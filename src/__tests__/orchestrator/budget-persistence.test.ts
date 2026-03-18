import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

// Mock the agent spawner
vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string }) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname } = await import("node:path");
    md(dirname(config.outputFile), { recursive: true });
    wf(config.outputFile, `# Mock output for ${config.type}`);
    return { success: true, outputFile: config.outputFile };
  }),
  spawnAgent: vi.fn(async () => ({ success: true, outputFile: "" })),
  spawnAgentsParallel: vi.fn(async (configs: { outputFile: string; type: string }[]) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname } = await import("node:path");
    return configs.map((c) => {
      md(dirname(c.outputFile), { recursive: true });
      wf(c.outputFile, `# Mock output for ${c.type}`);
      return { success: true, outputFile: c.outputFile };
    });
  }),
}));

vi.mock("../../stages/baseline-check.js", () => ({
  runBaselineCheck: vi.fn(async () => ({ passed: true, buildOutput: "", testOutput: "" })),
}));

const config = getDefaultConfig();

describe("budget persistence across checkpoints", () => {
  it("budget from PIPELINE_START is used when creating CostTracker at approve-plan", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const testDir = join(process.cwd(), ".test-budget-persist");
    mkdirSync(testDir, { recursive: true });

    // Write a manager-log with budget=5
    const logPath = join(testDir, "manager-log.jsonl");
    const logEntry = JSON.stringify({
      timestamp: "2026-03-18T00:00:00Z",
      cycle: 0,
      storyId: null,
      action: "PIPELINE_START",
      reason: null,
      prdPath: "./test.md",
      stopAfterPlan: false,
      budget: 5,
    });
    writeFileSync(logPath, logEntry + "\n");

    // Write checkpoint and empty plan so approve-plan proceeds
    writeFileSync(join(testDir, ".checkpoint"), JSON.stringify({ awaiting: "approve-plan" }));
    mkdirSync(join(testDir, "plans"), { recursive: true });
    writeFileSync(join(testDir, "plans", "execution-plan.json"), JSON.stringify({ schemaVersion: "2.0.0", prdPath: "PRD.md", specPath: "spec/SPEC-v1.0.md", stories: [] }));

    const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await resumeFromCheckpoint(
      { awaiting: "approve-plan", message: "test", timestamp: "2026-03-18T00:00:00Z", feedback: null },
      dirs,
      config,
      { skipBaseline: true },
    );

    // Read the log to verify budget was persisted
    const { readFileSync } = await import("node:fs");
    const logContent = readFileSync(logPath, "utf-8");
    expect(logContent).toContain('"budget":5');

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });
});
