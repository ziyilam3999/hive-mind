import { describe, it, expect, vi } from "vitest";

vi.mock("../../agents/spawner.js", () => {
  const impl = async (config: { outputFile: string; type: string }) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });
    writeFileSync(config.outputFile, `# Mock ${config.type} report`);
    return { success: true, outputFile: config.outputFile };
  };
  return {
    spawnAgentWithRetry: vi.fn(impl),
    spawnAgentsParallel: vi.fn(async (configs: Array<{ outputFile: string; type: string }>) => {
      return Promise.all(configs.map(impl));
    }),
  };
});

import { runReportStage } from "../../stages/report-stage.js";
import { spawnAgentsParallel } from "../../agents/spawner.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

const config = getDefaultConfig();

describe("report-stage-reviewers integration", () => {
  const testDir = join(process.cwd(), ".test-report-reviewers");
  const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };

  function setup() {
    mkdirSync(join(testDir, "reports", "US-01"), { recursive: true });
    mkdirSync(join(testDir, "plans"), { recursive: true });
    writeFileSync(join(testDir, "reports", "US-01", "impl-report.md"), "# Impl Report");
    writeFileSync(join(testDir, "reports", "US-01", "refactor-report.md"), "# Refactor Report");
    writeFileSync(join(testDir, "reports", "US-01", "learning.md"), "# Learning");
    writeFileSync(
      join(testDir, "plans", "execution-plan.json"),
      JSON.stringify({
        schemaVersion: "2.0.0",
        prdPath: "PRD.md",
        specPath: "SPEC.md",
        stories: [{
          id: "US-01",
          title: "Test",
          specSections: ["§1"],
          dependencies: [],
          sourceFiles: ["src/foo.ts"],
          complexity: "low",
          rolesUsed: ["analyst"],
          stepFile: "plans/steps/US-01.md",
          status: "passed",
          attempts: 1,
          maxAttempts: 3,
          committed: true,
          commitHash: "abc123",
        }],
      }),
    );
    writeFileSync(
      join(testDir, "manager-log.jsonl"),
      '{"type":"BUILD_COMPLETE","storyId":"US-01","timestamp":"2026-03-12T00:00:00Z"}\n',
    );
    vi.mocked(spawnAgentsParallel).mockClear();
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("batch 1 (code-reviewer + log-summarizer) spawned first", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runReportStage(dirs, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      const calls = vi.mocked(spawnAgentsParallel).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);

      const batch1 = calls[0][0];
      const codeReviewerConfig = batch1.find((c: { type: string }) => c.type === "code-reviewer");
      const logSummarizerConfig = batch1.find((c: { type: string }) => c.type === "log-summarizer");
      expect(codeReviewerConfig).toBeDefined();
      expect(logSummarizerConfig).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("batch 2 (reporter + retrospective) spawned second", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runReportStage(dirs, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      const calls = vi.mocked(spawnAgentsParallel).mock.calls;
      const batch2 = calls[1][0];
      const reporterConfig = batch2.find((c: { type: string }) => c.type === "reporter");
      const retroConfig = batch2.find((c: { type: string }) => c.type === "retrospective");
      expect(reporterConfig).toBeDefined();
      expect(retroConfig).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("reporter receives code-review-report.md as input", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runReportStage(dirs, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      const calls = vi.mocked(spawnAgentsParallel).mock.calls;
      const batch2 = calls[1][0];
      const reporterConfig = batch2.find((c: { type: string }) => c.type === "reporter");
      expect(reporterConfig!.inputFiles.some((f: string) => f.includes("code-review-report.md"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("log-summarizer receives manager-log.jsonl as input", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runReportStage(dirs, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      const calls = vi.mocked(spawnAgentsParallel).mock.calls;
      const batch1 = calls[0][0];
      const logConfig = batch1.find((c: { type: string }) => c.type === "log-summarizer");
      expect(logConfig!.inputFiles.some((f: string) => f.includes("manager-log.jsonl"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("code-reviewer receives impl-reports + source files", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runReportStage(dirs, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      const calls = vi.mocked(spawnAgentsParallel).mock.calls;
      const batch1 = calls[0][0];
      const codeReviewerConfig = batch1.find((c: { type: string }) => c.type === "code-reviewer");
      expect(codeReviewerConfig!.inputFiles.some((f: string) => f.includes("impl-report.md"))).toBe(true);
      expect(codeReviewerConfig!.inputFiles.some((f: string) => f.includes("src/foo.ts"))).toBe(true);
    } finally {
      cleanup();
    }
  });
});
