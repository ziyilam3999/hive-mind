import { describe, it, expect, vi } from "vitest";
import type { Story } from "../../types/execution-plan.js";

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string }) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });
    writeFileSync(config.outputFile, `# Learning Report: ${config.type}\n## ELI5 SUMMARY\nTest summary`);
    return { success: true, outputFile: config.outputFile };
  }),
}));

import { runLearn } from "../../stages/execute-learn.js";
import { spawnAgentWithRetry } from "../../agents/spawner.js";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";

const makeStory = (overrides?: Partial<Story>): Story => ({
  id: "US-99",
  title: "Test Story",
  specSections: ["1.1"],
  dependencies: [],
  sourceFiles: ["src/test.ts"],
  complexity: "low",
  rolesUsed: ["analyst"],
  stepFile: "plans/steps/US-99-test.md",
  status: "passed",
  attempts: 1,
  maxAttempts: 3,
  committed: false,
  commitHash: null,
  ...overrides,
});

const config = getDefaultConfig();

describe("execute-learn", () => {
  const testDir = join(process.cwd(), ".test-exec-learn");

  function setup() {
    mkdirSync(join(testDir, "reports", "US-99"), { recursive: true });
    writeFileSync(join(testDir, "reports", "US-99", "impl-report.md"), "# Impl");
    writeFileSync(join(testDir, "reports", "US-99", "test-report.md"), "# Test");
    vi.mocked(spawnAgentWithRetry).mockClear();
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("learner runs even for failed stories", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const failedStory = makeStory({ status: "failed", attempts: 3 });
      const learningPath = await runLearn(failedStory, testDir, config);
      consoleSpy.mockRestore();

      expect(existsSync(learningPath)).toBe(true);
      expect(learningPath).toContain("learning.md");
    } finally {
      cleanup();
    }
  });

  it("learner prompt requires ELI5 output", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runLearn(makeStory(), testDir, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const learnerCall = calls.find((c) => c[0].type === "learner");
      expect(learnerCall).toBeDefined();
      expect(learnerCall![0].rules.some((r: string) => r.includes("ELI5"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("learner receives all reports for the story", async () => {
    setup();
    // Add diagnosis and fix reports
    writeFileSync(join(testDir, "reports", "US-99", "diagnosis-report-1.md"), "# Diag");
    writeFileSync(join(testDir, "reports", "US-99", "fix-report-1.md"), "# Fix");

    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runLearn(makeStory(), testDir, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const learnerCall = calls.find((c) => c[0].type === "learner");
      const inputFiles: string[] = learnerCall![0].inputFiles;

      expect(inputFiles.some((f) => f.includes("impl-report.md"))).toBe(true);
      expect(inputFiles.some((f) => f.includes("test-report.md"))).toBe(true);
      expect(inputFiles.some((f) => f.includes("diagnosis-report-1.md"))).toBe(true);
      expect(inputFiles.some((f) => f.includes("fix-report-1.md"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("roleReportsDir threaded — role-report content in learner config", async () => {
    setup();
    const roleReportsDir = join(testDir, "plans", "role-reports");
    mkdirSync(roleReportsDir, { recursive: true });
    writeFileSync(join(roleReportsDir, "analyst-report.md"), "# Analyst findings");

    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runLearn(makeStory(), testDir, config, undefined, roleReportsDir);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const learnerCall = calls.find((c) => c[0].type === "learner");
      expect(learnerCall![0].roleReportContents).toBeDefined();
      expect(learnerCall![0].roleReportContents).toContain("analyst");
    } finally {
      cleanup();
    }
  });

  it("missing roleReportsDir — no injection (backward compatible)", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runLearn(makeStory(), testDir, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const learnerCall = calls.find((c) => c[0].type === "learner");
      expect(learnerCall![0].roleReportContents).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});
