import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

// Capture spawner calls for inspection
const spawnCalls: Array<{ type: string; rules?: string[]; instructionBlocks?: Array<{ heading: string }> }> = [];

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string; rules?: string[]; instructionBlocks?: Array<{ heading: string }>; cwd?: string }) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    md(dirname(config.outputFile), { recursive: true });

    // Simulate implementer creating source files on disk (Fix 1 gate)
    if (config.type === "implementer") {
      const targetDir = config.cwd ?? dirname(dirname(config.outputFile));
      wf(join(targetDir, "package.json"), '{"name": "mock"}');
    }

    // For planner, produce valid execution-plan JSON
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

    spawnCalls.push({ type: config.type, rules: config.rules, instructionBlocks: config.instructionBlocks });
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

describe("greenfield flow", () => {
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spawnCalls.length = 0;
  });
  afterEach(() => { cwdSpy?.mockRestore(); });

  it("greenfield skips baseline at approve-plan", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const { runBaselineCheck } = await import("../../stages/baseline-check.js");
    vi.mocked(runBaselineCheck).mockClear();

    const testDir = join(process.cwd(), ".test-greenfield-baseline");
    mkdirSync(testDir, { recursive: true });
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testDir);

    // Write a PIPELINE_START with greenfield=true
    const logEntry = JSON.stringify({
      timestamp: "2026-03-18T00:00:00Z",
      cycle: 0,
      storyId: null,
      action: "PIPELINE_START",
      reason: null,
      prdPath: "./test.md",
      stopAfterPlan: false,
      greenfield: true,
    });
    writeFileSync(join(testDir, "manager-log.jsonl"), logEntry + "\n");
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
    );

    // Baseline should NOT have been called (greenfield auto-skips)
    expect(runBaselineCheck).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("greenfield injects context block into spec agents", async () => {
    const { runPipeline } = await import("../../orchestrator.js");

    const testDir = join(process.cwd(), ".test-greenfield-spec");
    mkdirSync(testDir, { recursive: true });
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testDir);
    const prdPath = join(testDir, "PRD.md");
    writeFileSync(prdPath, "# Test PRD\nBuild a thing.");
    const dirs: PipelineDirs = { workingDir: join(testDir, ".hive-mind"), knowledgeDir: join(testDir, ".hive-mind"), labDir: join(testDir, ".hive-mind") };

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runPipeline(prdPath, dirs, config, { skipNormalize: true, greenfield: true });

    // Check that researcher got GREENFIELD block
    const researcherCall = spawnCalls.find((c) => c.type === "researcher");
    expect(researcherCall).toBeDefined();
    expect(researcherCall!.instructionBlocks?.some((b) => b.heading === "GREENFIELD PROJECT")).toBe(true);

    // Check that feature-spec-drafter got GREENFIELD block
    const drafterCall = spawnCalls.find((c) => c.type === "feature-spec-drafter");
    expect(drafterCall).toBeDefined();
    expect(drafterCall!.instructionBlocks?.some((b) => b.heading === "GREENFIELD PROJECT")).toBe(true);

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("greenfield injects scaffold rule into planner", async () => {
    const { runPipeline } = await import("../../orchestrator.js");

    const testDir = join(process.cwd(), ".test-greenfield-plan");
    mkdirSync(testDir, { recursive: true });
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testDir);
    const prdPath = join(testDir, "PRD.md");
    writeFileSync(prdPath, "# Test PRD\nBuild a thing.");
    const dirs: PipelineDirs = { workingDir: join(testDir, ".hive-mind"), knowledgeDir: join(testDir, ".hive-mind"), labDir: join(testDir, ".hive-mind") };

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runPipeline(prdPath, dirs, config, { skipNormalize: true, stopAfterPlan: true, greenfield: true });

    // Check that planner got the greenfield scaffold rule
    const plannerCall = spawnCalls.find((c) => c.type === "planner");
    expect(plannerCall).toBeDefined();
    expect(plannerCall!.rules?.some((r) => r.includes("FIRST story MUST create package.json"))).toBe(true);

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });
});
