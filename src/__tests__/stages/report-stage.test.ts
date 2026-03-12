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
import { spawnAgentWithRetry, spawnAgentsParallel } from "../../agents/spawner.js";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";

const config = getDefaultConfig();

describe("report-stage", () => {
  const testDir = join(process.cwd(), ".test-report-stage");

  function setup() {
    mkdirSync(join(testDir, "reports", "US-01"), { recursive: true });
    mkdirSync(join(testDir, "plans"), { recursive: true });
    writeFileSync(join(testDir, "reports", "US-01", "impl-report.md"), "# Impl");
    writeFileSync(join(testDir, "reports", "US-01", "learning.md"), "# Learning");
    writeFileSync(
      join(testDir, "plans", "execution-plan.json"),
      JSON.stringify({ schemaVersion: "2.0.0", prdPath: "PRD.md", specPath: "SPEC.md", stories: [] }),
    );
    vi.mocked(spawnAgentWithRetry).mockClear();
    vi.mocked(spawnAgentsParallel).mockClear();
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("consolidated report produced", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runReportStage(testDir, config);
      consoleSpy.mockRestore();

      expect(existsSync(join(testDir, "consolidated-report.md"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("retrospective produced", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runReportStage(testDir, config);
      consoleSpy.mockRestore();

      expect(existsSync(join(testDir, "retrospective.md"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("reporter and retrospective are spawned in parallel (batch 2)", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runReportStage(testDir, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentsParallel).mock.calls;
      // Batch 1 = code-reviewer + log-summarizer, Batch 2 = reporter + retrospective
      expect(calls.length).toBeGreaterThanOrEqual(2);
      const batch2Configs = calls[1][0];
      const reporterConfig = batch2Configs.find((c: { type: string }) => c.type === "reporter");
      const retroConfig = batch2Configs.find((c: { type: string }) => c.type === "retrospective");
      expect(reporterConfig).toBeDefined();
      expect(retroConfig).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("retrospective receives learning files", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runReportStage(testDir, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentsParallel).mock.calls;
      // Batch 2 is at index 1
      const batch2Configs = calls[1][0];
      const retroConfig = batch2Configs.find((c: { type: string }) => c.type === "retrospective");
      expect(retroConfig!.inputFiles.some((f: string) => f.includes("learning.md"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("graduation triggered when memory near cap", async () => {
    setup();
    // Write a large memory.md to trigger graduation
    const longEntry = "- 2026-01-01: Pattern confirmed across US-01 and US-02 and US-03: always lint first. " +
      "This is a very long entry to push the word count near the cap. ".repeat(20);
    writeFileSync(
      join(testDir, "memory.md"),
      `# Hive Mind Persist Memory\n\n## PATTERNS\n${longEntry}\n\n## MISTAKES\n\n## DISCOVERIES\n\n## GRADUATION LOG\n`,
    );

    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runReportStage(testDir, config);
      consoleSpy.mockRestore();

      // Memory file should still exist
      expect(existsSync(join(testDir, "memory.md"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("KB size warning at high word count", async () => {
    setup();
    // Create a large KB file
    mkdirSync(join(testDir, "knowledge-base"), { recursive: true });
    const largeContent = "word ".repeat(6000);
    writeFileSync(join(testDir, "knowledge-base", "01-proven-patterns.md"), largeContent);

    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runReportStage(testDir, config);
      consoleSpy.mockRestore();

      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = warnSpy.mock.calls.flat().join(" ");
      expect(warnMsg).toContain("Knowledge base exceeds");

      warnSpy.mockRestore();
    } finally {
      cleanup();
    }
  });
});
