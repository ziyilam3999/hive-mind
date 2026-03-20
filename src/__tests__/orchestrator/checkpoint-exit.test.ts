import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
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
  spawnAgentsParallel: vi.fn(async (configs: Array<{ outputFile: string; type: string }>) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname } = await import("node:path");
    return configs.map((c) => {
      md(dirname(c.outputFile), { recursive: true });
      wf(c.outputFile, `# Mock output for ${c.type}`);
      return { success: true, outputFile: c.outputFile };
    });
  }),
}));

// Mock baseline check for the checkpoint preservation test
vi.mock("../../stages/baseline-check.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../stages/baseline-check.js")>();
  return {
    ...original,
    runBaselineCheck: vi.fn(async () => ({ passed: true, buildOutput: "", testOutput: "" })),
  };
});

const config = getDefaultConfig();

describe("orchestrator checkpoint exit", () => {
  it("runPipeline writes checkpoint and does not continue to PLAN", async () => {
    const { runPipeline } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const testDir = join(process.cwd(), ".test-orch-cp-exit");
    mkdirSync(testDir, { recursive: true });
    const prdPath = join(testDir, "PRD.md");
    writeFileSync(prdPath, "# Test PRD");
    const hmDir = join(testDir, ".hive-mind");
    const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };

    await runPipeline(prdPath, dirs, config, { skipNormalize: true });

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    // Should have SPEC but NOT PLAN
    expect(calls.some((c) => typeof c === "string" && c.includes("SPEC stage"))).toBe(true);
    expect(calls.some((c) => typeof c === "string" && c.includes("Running PLAN stage"))).toBe(false);

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("ship checkpoint cleans up and prints pipeline complete", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const testDir = join(process.cwd(), ".test-orch-ship");
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, ".checkpoint"), '{"awaiting":"ship"}');
    const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };

    await resumeFromCheckpoint(
      { awaiting: "ship", message: "test", timestamp: "2026-03-06T00:00:00Z", feedback: null },
      dirs,
      config,
    );

    expect(existsSync(join(testDir, ".checkpoint"))).toBe(false);
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => typeof c === "string" && c.includes("Pipeline complete"))).toBe(true);

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("baseline failure preserves checkpoint so user can re-approve", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const { runBaselineCheck } = await import("../../stages/baseline-check.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const testDir = join(process.cwd(), ".test-orch-baseline-fail");
    mkdirSync(testDir, { recursive: true });
    const checkpointPath = join(testDir, ".checkpoint");
    writeFileSync(checkpointPath, JSON.stringify({ awaiting: "approve-plan" }));
    // getPipelineStartData now reads manager-log.jsonl
    writeFileSync(join(testDir, "manager-log.jsonl"), JSON.stringify({ timestamp: "2026-03-06T00:00:00Z", cycle: 0, storyId: null, action: "PIPELINE_START", reason: null, prdPath: "./PRD.md", stopAfterPlan: false }) + "\n");
    const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };

    // Make baseline throw
    vi.mocked(runBaselineCheck).mockRejectedValueOnce(new Error("Baseline build failed"));

    await expect(resumeFromCheckpoint(
      { awaiting: "approve-plan", message: "test", timestamp: "2026-03-06T00:00:00Z", feedback: null },
      dirs,
      config,
    )).rejects.toThrow("Baseline build failed");

    // Checkpoint should still exist after baseline failure
    expect(existsSync(checkpointPath)).toBe(true);

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });
});
