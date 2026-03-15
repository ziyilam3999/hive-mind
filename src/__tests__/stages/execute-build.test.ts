import { describe, it, expect, vi } from "vitest";
import type { Story } from "../../types/execution-plan.js";

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string }) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });
    writeFileSync(config.outputFile, `# Mock ${config.type} report`);
    return { success: true, outputFile: config.outputFile };
  }),
}));

import { runBuild } from "../../stages/execute-build.js";
import { spawnAgentWithRetry } from "../../agents/spawner.js";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";

const testStory: Story = {
  id: "US-99",
  title: "Test Story",
  specSections: ["1.1"],
  dependencies: [],
  sourceFiles: ["src/test.ts"],
  complexity: "low",
  rolesUsed: ["analyst"],
  stepFile: "plans/steps/US-99-test.md",
  status: "in-progress",
  attempts: 0,
  maxAttempts: 3,
  committed: false,
  commitHash: null,
};

const config = getDefaultConfig();

describe("execute-build", () => {
  const testDir = join(process.cwd(), ".test-exec-build");

  function setup() {
    mkdirSync(join(testDir, "plans", "steps"), { recursive: true });
    writeFileSync(
      join(testDir, testStory.stepFile),
      "# US-99: Test Story\n## OUTPUT\nsrc/test.ts\n## ACCEPTANCE CRITERIA\n- AC-0: lint",
    );
    vi.mocked(spawnAgentWithRetry).mockClear();
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("implementer receives step file as input (P16)", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, testDir, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const implCall = calls.find((c) => c[0].type === "implementer");
      expect(implCall).toBeDefined();
      expect(implCall![0].inputFiles).toEqual([join(testDir, testStory.stepFile)]);
    } finally {
      cleanup();
    }
  });

  it("reports written to reports/{storyId}/ directory", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = await runBuild(testStory, testDir, config);
      consoleSpy.mockRestore();

      expect(result.implReportPath).toMatch(/reports[/\\]US-99[/\\]impl-report\.md/);
      expect(result.refactorReportPath).toMatch(/reports[/\\]US-99[/\\]refactor-report\.md/);
      expect(existsSync(result.implReportPath)).toBe(true);
      expect(existsSync(result.refactorReportPath)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("implementer prompt includes OUTPUT-CONTRACT rule", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, testDir, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const implCall = calls.find((c) => c[0].type === "implementer");
      expect(implCall![0].rules.some((r: string) => r.includes("OUTPUT-CONTRACT"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("roleReportsDir threaded — role-report content in agent config", async () => {
    setup();
    // Create role-reports directory with an analyst report
    const roleReportsDir = join(testDir, "plans", "role-reports");
    mkdirSync(roleReportsDir, { recursive: true });
    writeFileSync(join(roleReportsDir, "analyst-report.md"), "# Analyst findings");
    writeFileSync(join(roleReportsDir, "architect-report.md"), "# Architect findings");

    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, testDir, config, undefined, roleReportsDir);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const implCall = calls.find((c) => c[0].type === "implementer");
      // implementer maps to ["architect", "security", "analyst"] but story only has rolesUsed: ["analyst"]
      expect(implCall![0].roleReportContents).toBeDefined();
      expect(implCall![0].roleReportContents).toContain("analyst");
    } finally {
      cleanup();
    }
  });

  it("missing roleReportsDir — no injection (backward compatible)", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, testDir, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const implCall = calls.find((c) => c[0].type === "implementer");
      expect(implCall![0].roleReportContents).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("moduleCwd forwarded to agent configs", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, testDir, config, undefined, undefined, undefined, "/external/repo");
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const implCall = calls.find((c) => c[0].type === "implementer");
      const refactorCall = calls.find((c) => c[0].type === "refactorer");
      expect(implCall![0].cwd).toBe("/external/repo");
      expect(refactorCall![0].cwd).toBe("/external/repo");
    } finally {
      cleanup();
    }
  });

  it("undefined moduleCwd — no cwd in agent config", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, testDir, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const implCall = calls.find((c) => c[0].type === "implementer");
      expect(implCall![0].cwd).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("sourceFiles resolved against moduleCwd when present", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, testDir, config, undefined, undefined, undefined, "/external/repo");
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const refactorCall = calls.find((c) => c[0].type === "refactorer");
      // sourceFiles should be joined with moduleCwd, not hiveMindDir
      expect(refactorCall![0].inputFiles[0]).toBe(join("/external/repo", "src/test.ts"));
    } finally {
      cleanup();
    }
  });
});
