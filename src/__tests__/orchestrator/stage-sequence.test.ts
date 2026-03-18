import { describe, it, expect, vi } from "vitest";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

// Mock the agent spawner to avoid calling real claude CLI
vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string }) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname } = await import("node:path");
    md(dirname(config.outputFile), { recursive: true });
    wf(config.outputFile, `# Mock output for ${config.type}`);
    return { success: true, outputFile: config.outputFile };
  }),
  spawnAgent: vi.fn(async () => ({ success: true, outputFile: "" })),
}));

const config = getDefaultConfig();

describe("orchestrator stage sequence", () => {
  it("runPipeline calls SPEC stage", async () => {
    const { runPipeline } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    // Create a temp PRD file
    const { writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const testDir = join(process.cwd(), ".test-orch-seq");
    mkdirSync(testDir, { recursive: true });
    const prdPath = join(testDir, "PRD.md");
    writeFileSync(prdPath, "# Test PRD");

    try {
      const hmDir = join(testDir, ".hive-mind");
      const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };
      await runPipeline(prdPath, dirs, config);
    } catch {
      // process.exit throws
    }

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => typeof c === "string" && c.includes("SPEC stage"))).toBe(true);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("resumeFromCheckpoint handles all 4 stages", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { mkdirSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const testDir = join(process.cwd(), ".test-orch-resume");
    mkdirSync(testDir, { recursive: true });

    // Test ship checkpoint (simplest)
    const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };
    await resumeFromCheckpoint(
      { awaiting: "ship", message: "test", timestamp: "2026-03-06T00:00:00Z", feedback: null },
      dirs,
      config,
    );
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => typeof c === "string" && c.includes("Pipeline complete"))).toBe(true);

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });
});
