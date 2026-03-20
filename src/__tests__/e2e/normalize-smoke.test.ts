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
  spawnClaude: vi.fn(async () => ({ exitCode: 0, stdout: "{}", stderr: "", json: {} })),
  runShell: vi.fn(async () => ({ exitCode: 0, stdout: "abc1234", stderr: "" })),
}));

vi.mock("../../utils/notify.js", () => ({
  notifyCheckpoint: vi.fn(),
}));

const config = getDefaultConfig();

describe("normalize stage E2E smoke", () => {
  const testDir = join(process.cwd(), ".test-normalize-smoke");
  const hmDir = join(testDir, ".hive-mind");
  const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };
  const prdPath = join(testDir, "PRD.md");

  beforeEach(() => {
    vi.clearAllMocks();
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    writeFileSync(prdPath, "# Test PRD\n\nREQ-01: Build a widget\nREQ-02: Add tests\n");
  });

  it("start produces normalize checkpoint (default flow)", async () => {
    const { runPipeline } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runPipeline(prdPath, dirs, config, { silent: true });

    // Checkpoint should exist with approve-normalize
    const cpPath = join(hmDir, ".checkpoint");
    expect(existsSync(cpPath)).toBe(true);
    const cp = JSON.parse(readFileSync(cpPath, "utf-8"));
    expect(cp.awaiting).toBe("approve-normalize");

    // Normalized PRD should exist
    expect(existsSync(join(hmDir, "normalize", "normalized-prd.md"))).toBe(true);

    // Manager log should contain PIPELINE_START
    const logPath = join(hmDir, "manager-log.jsonl");
    expect(existsSync(logPath)).toBe(true);
    const logContent = readFileSync(logPath, "utf-8");
    const logLines = logContent.trim().split("\n").map((l) => JSON.parse(l));
    const startEntry = logLines.find((e) => e.action === "PIPELINE_START");
    expect(startEntry).toBeDefined();
    expect(startEntry.prdPath).toBe(prdPath);

    consoleSpy.mockRestore();
  });

  it("start --skip-normalize skips to SPEC checkpoint", async () => {
    const { runPipeline } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runPipeline(prdPath, dirs, config, { silent: true, skipNormalize: true });

    // Checkpoint should exist with approve-spec (not approve-normalize)
    const cpPath = join(hmDir, ".checkpoint");
    expect(existsSync(cpPath)).toBe(true);
    const cp = JSON.parse(readFileSync(cpPath, "utf-8"));
    expect(cp.awaiting).toBe("approve-spec");

    // normalize/ directory should NOT exist
    expect(existsSync(join(hmDir, "normalize"))).toBe(false);

    // spec/ directory should exist with artifacts
    expect(existsSync(join(hmDir, "spec"))).toBe(true);

    consoleSpy.mockRestore();
  });

  it("rejection loop re-runs normalize with feedback", async () => {
    const { runPipeline, resumeFromCheckpoint } = await import("../../orchestrator.js");
    const { spawnAgentWithRetry } = await import("../../agents/spawner.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Step 1: Initial run produces normalize checkpoint
    await runPipeline(prdPath, dirs, config, { silent: true });

    // Clear mock calls from initial run
    vi.mocked(spawnAgentWithRetry).mockClear();

    // Step 2: Reject with feedback
    await resumeFromCheckpoint(
      { awaiting: "approve-normalize", message: "test", timestamp: "2026-03-18T00:00:00Z", feedback: "Add auth requirements" },
      dirs,
      config,
      { silent: true },
    );

    // Checkpoint should be re-written with approve-normalize
    const cpPath = join(hmDir, ".checkpoint");
    expect(existsSync(cpPath)).toBe(true);
    const cp = JSON.parse(readFileSync(cpPath, "utf-8"));
    expect(cp.awaiting).toBe("approve-normalize");

    // Spawner should have been called with rules containing the feedback
    const spawnCalls = vi.mocked(spawnAgentWithRetry).mock.calls;
    const normalizerCall = spawnCalls.find((c) => (c[0] as { type: string }).type === "normalizer");
    expect(normalizerCall).toBeDefined();
    const rules = (normalizerCall![0] as { rules: string[] }).rules;
    expect(rules.some((r: string) => r.includes("Add auth requirements"))).toBe(true);

    consoleSpy.mockRestore();
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });
});
