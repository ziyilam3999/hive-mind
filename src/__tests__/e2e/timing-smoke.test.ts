import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

// Track spawn calls
const spawnCalls: Array<{ type: string; outputFile: string }> = [];

let callIdx = 0;
const DURATIONS = [8000, 12000, 15000, 6000, 20000, 10000, 5000, 14000, 9000, 11000];

vi.mock("../../agents/spawner.js", () => {
  const mockSpawn = async (config: { outputFile: string; type: string }) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname } = await import("node:path");
    md(dirname(config.outputFile), { recursive: true });

    if (config.type === "planner") {
      wf(config.outputFile, JSON.stringify({
        schemaVersion: "2.0.0",
        prdPath: "PRD.md",
        specPath: "spec/SPEC-v1.0.md",
        stories: [{
          id: "US-01",
          title: "Setup",
          specSections: ["§1"],
          dependencies: [],
          sourceFiles: [{ path: "package.json", changeType: "ADDED" }],
          complexity: "low",
          rolesUsed: ["analyst"],
          stepFile: "plans/steps/US-01.md",
          status: "not-started",
          attempts: 0,
          maxAttempts: 3,
          committed: false,
          commitHash: null,
        }],
      }));
    } else {
      wf(config.outputFile, `# Mock output for ${config.type}`);
    }

    spawnCalls.push({ type: config.type, outputFile: config.outputFile });
    const dur = DURATIONS[callIdx++ % DURATIONS.length];
    return { success: true, outputFile: config.outputFile, costUsd: 0.05, durationMs: dur };
  };

  return {
    spawnAgentWithRetry: vi.fn(mockSpawn),
    spawnAgent: vi.fn(async () => ({ success: true, outputFile: "" })),
    spawnAgentsParallel: vi.fn(async (configs: { outputFile: string; type: string }[]) => {
      return Promise.all(configs.map(mockSpawn));
    }),
  };
});

vi.mock("../../stages/baseline-check.js", () => ({
  runBaselineCheck: vi.fn(async () => ({ passed: true, buildOutput: "", testOutput: "" })),
}));

const config = getDefaultConfig();

describe("timing smoke test", () => {
  let testDir: string;
  let prdPath: string;
  let dirs: PipelineDirs;

  beforeEach(() => {
    spawnCalls.length = 0;
    callIdx = 0;

    testDir = join(process.cwd(), ".test-timing-smoke");
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });

    prdPath = join(testDir, "PRD.md");
    writeFileSync(prdPath, "# Test PRD\nBuild a timing test.");

    dirs = {
      workingDir: join(testDir, ".hive-mind"),
      knowledgeDir: join(testDir, ".hive-mind"),
      labDir: join(testDir, ".hive-mind"),
    };
  });

  it("--stop-after-plan produces timing summary and report", async () => {
    const { runPipeline } = await import("../../orchestrator.js");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // AC#6: Pipeline should not throw
    await runPipeline(prdPath, dirs, config, {
      skipNormalize: true,
      stopAfterPlan: true,
    });

    const logs = consoleSpy.mock.calls.map((c) => String(c[0]));

    // AC#4: No timeouts
    expect(logs.some((l) => l.includes("[spawnClaude] Timed out"))).toBe(false);

    // AC#7: Timing summary printed
    expect(logs.some((l) => l.includes("Timing summary"))).toBe(true);
    expect(logs.some((l) => l.includes("Fastest:"))).toBe(true);
    expect(logs.some((l) => l.includes("Median:"))).toBe(true);
    expect(logs.some((l) => l.includes("Slowest:"))).toBe(true);

    // AC#5: Spec files exist
    const specDir = join(dirs.workingDir, "spec");
    expect(existsSync(specDir)).toBe(true);
    const specFiles = readdirSync(specDir).filter((f) => f.endsWith(".md"));
    expect(specFiles.length).toBeGreaterThanOrEqual(1);

    // AC#5: Execution plan exists
    const planFile = join(dirs.workingDir, "plans", "execution-plan.json");
    expect(existsSync(planFile)).toBe(true);

    // AC#8: Timing report written
    const reportPath = join(dirs.workingDir, "timing-report.md");
    expect(existsSync(reportPath)).toBe(true);
    const reportContent = readFileSync(reportPath, "utf-8");
    expect(reportContent).toContain("# Agent Timing Report");
    expect(reportContent).toContain("|");

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });
});
