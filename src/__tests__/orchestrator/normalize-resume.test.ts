import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

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

vi.mock("../../utils/shell.js", () => ({
  runShell: vi.fn(async () => ({ exitCode: 0, stdout: "v1.0.0\n", stderr: "" })),
}));

const config = getDefaultConfig();

describe("normalize resume", () => {
  const testDir = join(process.cwd(), ".test-normalize-resume");
  const hmDir = join(testDir, ".hive-mind");
  const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(join(hmDir, "normalize"), { recursive: true });
    writeFileSync(join(hmDir, "normalize", "normalized-prd.md"), "# Normalized PRD\nREQ-01: Something");

    // Write PIPELINE_START log entry
    const logEntry = JSON.stringify({
      timestamp: "2026-03-18T00:00:00Z",
      cycle: 0,
      storyId: null,
      action: "PIPELINE_START",
      reason: null,
      prdPath: join(testDir, "original.md"),
      stopAfterPlan: false,
    });
    writeFileSync(join(hmDir, "manager-log.jsonl"), logEntry + "\n");

    // Write checkpoint
    writeFileSync(join(hmDir, ".checkpoint"), JSON.stringify({ awaiting: "approve-normalize" }));

    // Write original PRD
    writeFileSync(join(testDir, "original.md"), "# Original PRD");
  });

  it("approve-normalize without feedback proceeds to DESIGN then SPEC", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Resume from approve-normalize → DESIGN stage runs (no UI keywords → approve-design-skip)
    await resumeFromCheckpoint(
      { awaiting: "approve-normalize", message: "test", timestamp: "2026-03-18T00:00:00Z", feedback: null },
      dirs,
      config,
    );

    // Checkpoint should be approve-design-skip (DESIGN gates SPEC)
    expect(existsSync(join(hmDir, ".checkpoint"))).toBe(true);
    const cp = JSON.parse(readFileSync(join(hmDir, ".checkpoint"), "utf-8"));
    expect(cp.awaiting).toBe("approve-design-skip");

    // Resume from design-skip → SPEC stage runs
    await resumeFromCheckpoint(
      { awaiting: "approve-design-skip", message: "test", timestamp: "2026-03-18T00:00:00Z", feedback: null },
      dirs,
      config,
    );

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => typeof c === "string" && c.includes("Running SPEC stage"))).toBe(true);

    consoleSpy.mockRestore();
  });

  it("approve-normalize with feedback re-runs normalize", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await resumeFromCheckpoint(
      { awaiting: "approve-normalize", message: "test", timestamp: "2026-03-18T00:00:00Z", feedback: "Missing auth" },
      dirs,
      config,
    );

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => typeof c === "string" && c.includes("Re-running NORMALIZE"))).toBe(true);
    expect(calls.some((c) => typeof c === "string" && c.includes("Review again"))).toBe(true);

    // Checkpoint should be re-written (new approve-normalize checkpoint)
    expect(existsSync(join(hmDir, ".checkpoint"))).toBe(true);

    consoleSpy.mockRestore();
  });

  it("approve-normalize throws on missing normalized-prd.md", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    rmSync(join(hmDir, "normalize", "normalized-prd.md"));

    await expect(
      resumeFromCheckpoint(
        { awaiting: "approve-normalize", message: "test", timestamp: "2026-03-18T00:00:00Z", feedback: null },
        dirs,
        config,
      ),
    ).rejects.toThrow("normalized-prd.md not found");
  });

  it("approve-normalize throws on empty normalized-prd.md", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    writeFileSync(join(hmDir, "normalize", "normalized-prd.md"), "  \n  ");

    await expect(
      resumeFromCheckpoint(
        { awaiting: "approve-normalize", message: "test", timestamp: "2026-03-18T00:00:00Z", feedback: null },
        dirs,
        config,
      ),
    ).rejects.toThrow("normalized-prd.md is empty");
  });

  it("getPipelineStartData returns last PIPELINE_START when multiple exist", async () => {
    // Add a second PIPELINE_START entry after the first
    const existingLog = readFileSync(join(hmDir, "manager-log.jsonl"), "utf-8");
    const secondEntry = JSON.stringify({
      timestamp: "2026-03-18T01:00:00Z",
      cycle: 0,
      storyId: null,
      action: "PIPELINE_START",
      reason: null,
      prdPath: join(testDir, "second.md"),
      stopAfterPlan: true,
    });
    writeFileSync(join(hmDir, "manager-log.jsonl"), existingLog + secondEntry + "\n");
    writeFileSync(join(testDir, "second.md"), "# Second PRD");

    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { spawnAgentWithRetry } = await import("../../agents/spawner.js");

    // Clear prior mock calls
    vi.mocked(spawnAgentWithRetry).mockClear();

    // Reject with feedback to trigger re-normalize, which uses getPipelineStartData
    await resumeFromCheckpoint(
      { awaiting: "approve-normalize", message: "test", timestamp: "2026-03-18T00:00:00Z", feedback: "Fix it" },
      dirs,
      config,
    );

    // The spawner should have been called with the SECOND PRD path (last-wins)
    const spawnCalls = vi.mocked(spawnAgentWithRetry).mock.calls;
    const normalizerCall = spawnCalls.find((c) => (c[0] as { type: string }).type === "normalizer");
    expect(normalizerCall).toBeDefined();
    const inputFiles = (normalizerCall![0] as { inputFiles: string[] }).inputFiles;
    expect(inputFiles[0]).toContain("second.md");

    consoleSpy.mockRestore();
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });
});
