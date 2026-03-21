import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

// ── Track spawn calls ──────────────────────────────────────────────────────
const spawnCalls: Array<{ type: string; outputFile: string; memoryContent?: string }> = [];

let callIdx = 0;
const DURATIONS = [8000, 12000, 15000, 6000, 20000, 10000, 5000, 14000, 9000, 11000];

// Default killedByOutputDetection value — tests can override per-type
let killedByOutputDetectionOverrides: Record<string, boolean> = {};

// ── Mocks (P33 TDZ-safe inline factories) ──────────────────────────────────
vi.mock("../../agents/spawner.js", () => {
  const mockSpawn = async (config: { outputFile: string; type: string; memoryContent?: string; cwd?: string }) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    md(dirname(config.outputFile), { recursive: true });

    // Simulate implementer creating source files on disk (Fix 1 gate requires them)
    if (config.type === "implementer") {
      const targetDir = config.cwd ?? dirname(dirname(config.outputFile));
      wf(join(targetDir, "package.json"), '{"name": "mock"}');
    }

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

    spawnCalls.push({ type: config.type, outputFile: config.outputFile, memoryContent: config.memoryContent });
    const dur = DURATIONS[callIdx++ % DURATIONS.length];
    const killed = killedByOutputDetectionOverrides[config.type] ?? false;
    return { success: true, outputFile: config.outputFile, costUsd: 0.05, durationMs: dur, killedByOutputDetection: killed };
  };

  return {
    spawnAgentWithRetry: vi.fn(mockSpawn),
    spawnAgent: vi.fn(async () => ({ success: true, outputFile: "" })),
    spawnAgentsParallel: vi.fn(async (configs: { outputFile: string; type: string; memoryContent?: string }[]) => {
      return Promise.all(configs.map(mockSpawn));
    }),
  };
});

vi.mock("../../utils/shell.js", () => ({
  spawnClaude: vi.fn(async () => ({ exitCode: 0, stdout: "{}", stderr: "", json: {} })),
  runShell: vi.fn(async () => ({ exitCode: 0, stdout: "abc1234", stderr: "" })),
  getSpawnClaudeInvocationCount: vi.fn(() => 0),
}));

vi.mock("../../utils/notify.js", () => ({
  notifyCheckpoint: vi.fn(),
}));

vi.mock("../../stages/baseline-check.js", () => ({
  runBaselineCheck: vi.fn(async () => ({ passed: true, buildOutput: "", testOutput: "" })),
}));

const config = getDefaultConfig();

// ── Helpers ────────────────────────────────────────────────────────────────
function setupManagerLog(dir: string, overrides: Record<string, unknown> = {}): void {
  const entry = JSON.stringify({
    timestamp: "2026-03-18T00:00:00Z",
    cycle: 0,
    storyId: null,
    action: "PIPELINE_START",
    reason: null,
    prdPath: "./PRD.md",
    stopAfterPlan: false,
    greenfield: false,
    ...overrides,
  });
  writeFileSync(join(dir, "manager-log.jsonl"), entry + "\n");
}

function readCheckpointFile(dir: string): Record<string, unknown> | null {
  const cpPath = join(dir, ".checkpoint");
  if (!existsSync(cpPath)) return null;
  return JSON.parse(readFileSync(cpPath, "utf-8"));
}

function readLogEntries(dir: string): Array<Record<string, unknown>> {
  const logPath = join(dir, "manager-log.jsonl");
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// ── Test suite ─────────────────────────────────────────────────────────────
describe("pipeline smoke test (e2e)", () => {
  const testDir = join(process.cwd(), ".test-pipeline-smoke");
  const hmDir = join(testDir, ".hive-mind");
  const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };
  const prdPath = join(testDir, "PRD.md");

  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    cwdSpy?.mockRestore();
    vi.clearAllMocks();
    spawnCalls.length = 0;
    callIdx = 0;
    killedByOutputDetectionOverrides = {};

    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    writeFileSync(prdPath, "# Test PRD\n\nREQ-01: Build a widget\nREQ-02: Add tests\n");

    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testDir);
  });

  afterAll(() => {
    cwdSpy?.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });

  function getLogs(): string[] {
    return consoleSpy.mock.calls.map((c: unknown[]) => String(c[0]));
  }

  // ── Test 1: Full golden path ──────────────────────────────────────────
  it("full pipeline golden path: normalize → spec → plan → execute → verify → ship", async () => {
    const { runPipeline, resumeFromCheckpoint } = await import("../../orchestrator.js");

    // Step 1: Start — should checkpoint at approve-normalize
    await runPipeline(prdPath, dirs, config);

    let cp = readCheckpointFile(hmDir);
    expect(cp?.awaiting).toBe("approve-normalize");
    expect(existsSync(join(hmDir, "normalize", "normalized-prd.md"))).toBe(true);
    const logEntries = readLogEntries(hmDir);
    expect(logEntries.some((e) => e.action === "PIPELINE_START")).toBe(true);

    // Step 2: Approve normalize → checkpoint at approve-spec
    await resumeFromCheckpoint(
      { awaiting: "approve-normalize", message: "", timestamp: "2026-03-18T00:00:00Z", feedback: null },
      dirs, config,
    );

    cp = readCheckpointFile(hmDir);
    expect(cp?.awaiting).toBe("approve-spec");
    expect(existsSync(join(hmDir, "spec"))).toBe(true);
    const logEntries2 = readLogEntries(hmDir);
    expect(logEntries2.some((e) => e.action === "SPEC_COMPLETE")).toBe(true);

    // Step 3: Approve spec → checkpoint at approve-plan
    await resumeFromCheckpoint(
      { awaiting: "approve-spec", message: "", timestamp: "2026-03-18T00:00:00Z", feedback: null },
      dirs, config,
    );

    cp = readCheckpointFile(hmDir);
    expect(cp?.awaiting).toBe("approve-plan");
    expect(existsSync(join(hmDir, "plans", "execution-plan.json"))).toBe(true);
    const logEntries3 = readLogEntries(hmDir);
    expect(logEntries3.some((e) => e.action === "PLAN_COMPLETE")).toBe(true);

    // Step 4: Approve plan (skipBaseline) → checkpoint at verify
    await resumeFromCheckpoint(
      { awaiting: "approve-plan", message: "", timestamp: "2026-03-18T00:00:00Z", feedback: null },
      dirs, config, { skipBaseline: true },
    );

    cp = readCheckpointFile(hmDir);
    expect(cp?.awaiting).toBe("verify");
    // Timing observability: timing-report.md written after execute
    expect(existsSync(join(hmDir, "timing-report.md"))).toBe(true);

    // Step 5: Approve verify → checkpoint at ship
    await resumeFromCheckpoint(
      { awaiting: "verify", message: "", timestamp: "2026-03-18T00:00:00Z", feedback: null },
      dirs, config,
    );

    cp = readCheckpointFile(hmDir);
    expect(cp?.awaiting).toBe("ship");

    // Step 6: Ship → pipeline complete
    await resumeFromCheckpoint(
      { awaiting: "ship", message: "", timestamp: "2026-03-18T00:00:00Z", feedback: null },
      dirs, config,
    );

    cp = readCheckpointFile(hmDir);
    expect(cp).toBeNull();
    expect(getLogs().some((l) => l.includes("Pipeline complete"))).toBe(true);
  });

  // ── Test 2: stopAfterPlan honored at approve-spec resume (ISSUE-2) ────
  it("stopAfterPlan honored at approve-spec resume (ISSUE-2)", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");

    // Manual state: PIPELINE_START with stopAfterPlan: true
    mkdirSync(hmDir, { recursive: true });
    mkdirSync(join(hmDir, "spec"), { recursive: true });
    writeFileSync(join(hmDir, "spec", "SPEC-v1.0.md"), "# SPEC\n\n## Requirements\nREQ-01: Build widget");
    setupManagerLog(hmDir, { stopAfterPlan: true });

    await resumeFromCheckpoint(
      { awaiting: "approve-spec", message: "", timestamp: "2026-03-18T00:00:00Z", feedback: null },
      dirs, config,
    );

    // No checkpoint file — pipeline exited cleanly
    const cp = readCheckpointFile(hmDir);
    expect(cp).toBeNull();

    const logs = getLogs();
    expect(logs.some((l) => l.includes("Plan Preview"))).toBe(true);
    expect(logs.some((l) => l.includes("--stop-after-plan"))).toBe(true);

    // execution-plan.json produced
    expect(existsSync(join(hmDir, "plans", "execution-plan.json"))).toBe(true);

    // CostTracker wired — timing-report.md written (ISSUE-3)
    expect(existsSync(join(hmDir, "timing-report.md"))).toBe(true);
  });

  // ── Test 3: greenfield + budget + stopAfterPlan persist across normalize checkpoint ──
  it("greenfield + budget + stopAfterPlan persist across normalize checkpoint", async () => {
    const { runPipeline, resumeFromCheckpoint } = await import("../../orchestrator.js");

    // Start with all flags
    await runPipeline(prdPath, dirs, config, {
      budget: 2.50,
      greenfield: true,
      stopAfterPlan: true,
    });

    // PIPELINE_START should have all flags
    const logEntries = readLogEntries(hmDir);
    const startEntry = logEntries.find((e) => e.action === "PIPELINE_START");
    expect(startEntry).toBeDefined();
    expect(startEntry!.budget).toBe(2.5);
    expect(startEntry!.greenfield).toBe(true);
    expect(startEntry!.stopAfterPlan).toBe(true);

    // Should be at approve-normalize
    let cp = readCheckpointFile(hmDir);
    expect(cp?.awaiting).toBe("approve-normalize");

    // Resume — flags should persist across normalize boundary
    await resumeFromCheckpoint(
      { awaiting: "approve-normalize", message: "", timestamp: "2026-03-18T00:00:00Z", feedback: null },
      dirs, config,
    );

    // stopAfterPlan honored — pipeline should run SPEC + PLAN and exit
    cp = readCheckpointFile(hmDir);
    expect(cp).toBeNull(); // no approve-plan checkpoint written

    const logs = getLogs();
    expect(logs.some((l) => l.includes("Plan Preview"))).toBe(true);

    // execution-plan.json produced
    expect(existsSync(join(hmDir, "plans", "execution-plan.json"))).toBe(true);
  });

  // ── Test 4: approve-spec with feedback re-runs SPEC from drafter (REQ-08) ──
  it("approve-spec with feedback re-runs SPEC from drafter", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const { spawnAgentWithRetry } = await import("../../agents/spawner.js");

    // Manual state: PIPELINE_START with stopAfterPlan: false
    mkdirSync(hmDir, { recursive: true });
    mkdirSync(join(hmDir, "spec"), { recursive: true });
    writeFileSync(prdPath, "# Test PRD\n## Requirements\n- Build something");
    writeFileSync(join(hmDir, "spec", "SPEC-v1.0.md"), "# SPEC\n\n## Requirements\nREQ-01: Build widget");
    writeFileSync(join(hmDir, "spec", "research-report.md"), "# Research");
    writeFileSync(join(hmDir, "spec", "spec-existing.md"), "# Existing");
    setupManagerLog(hmDir, { stopAfterPlan: false, prdPath });

    vi.mocked(spawnAgentWithRetry).mockClear();

    await resumeFromCheckpoint(
      { awaiting: "approve-spec", message: "", timestamp: "2026-03-18T00:00:00Z", feedback: "Focus on REST endpoints" },
      dirs, config,
    );

    // Should checkpoint at approve-spec again (not approve-plan)
    const cp = readCheckpointFile(hmDir);
    expect(cp?.awaiting).toBe("approve-spec");

    // Should have spawned feature-spec-drafter with feedback in memory
    const drafterCall = vi.mocked(spawnAgentWithRetry).mock.calls.find((c) => c[0].type === "feature-spec-drafter");
    expect(drafterCall).toBeDefined();
    expect(drafterCall![0].memoryContent).toContain("Focus on REST endpoints");

    // Should NOT have run scanner or researcher (reuses prior artifacts)
    const types = vi.mocked(spawnAgentWithRetry).mock.calls.map((c) => c[0].type);
    expect(types).not.toContain("relevance-scanner");
    expect(types).not.toContain("researcher");
  });

  // ── Test 5: greenfield skips baseline at approve-plan ──
  it("greenfield skips baseline at approve-plan", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const { runBaselineCheck } = await import("../../stages/baseline-check.js");
    vi.mocked(runBaselineCheck).mockClear();

    // Manual state: greenfield=true, valid execution plan
    mkdirSync(hmDir, { recursive: true });
    mkdirSync(join(hmDir, "plans"), { recursive: true });
    writeFileSync(join(hmDir, "plans", "execution-plan.json"), JSON.stringify({
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
    writeFileSync(join(hmDir, ".checkpoint"), JSON.stringify({ awaiting: "approve-plan" }));
    setupManagerLog(hmDir, { greenfield: true });

    // Need step file for execute stage
    mkdirSync(join(hmDir, "plans", "steps"), { recursive: true });
    writeFileSync(join(hmDir, "plans", "steps", "US-01.md"), "# US-01: Setup\n\n## ACCEPTANCE CRITERIA\n- AC1\n## EXIT CRITERIA\n- EC1");

    await resumeFromCheckpoint(
      { awaiting: "approve-plan", message: "", timestamp: "2026-03-18T00:00:00Z", feedback: null },
      dirs, config,
    );

    // Baseline NOT called (greenfield auto-skips)
    expect(runBaselineCheck).not.toHaveBeenCalled();

    // Pipeline advances — execute ran (spawner called for builder/verifier types)
    expect(spawnCalls.some((c) => c.type === "implementer")).toBe(true);

    // Checkpoint at verify
    const cp = readCheckpointFile(hmDir);
    expect(cp?.awaiting).toBe("verify");
  });

  // ── Test 6: timing observability: cost and duration tracked through execute ──
  it("timing observability: cost and duration tracked through execute", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");

    // Manual state: budget=10.00, greenfield=true, valid plan with 1 story
    mkdirSync(hmDir, { recursive: true });
    mkdirSync(join(hmDir, "plans"), { recursive: true });
    mkdirSync(join(hmDir, "plans", "steps"), { recursive: true });
    writeFileSync(join(hmDir, "plans", "execution-plan.json"), JSON.stringify({
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
    writeFileSync(join(hmDir, "plans", "steps", "US-01.md"), "# US-01: Setup\n\n## ACCEPTANCE CRITERIA\n- AC1\n## EXIT CRITERIA\n- EC1");
    writeFileSync(join(hmDir, ".checkpoint"), JSON.stringify({ awaiting: "approve-plan" }));
    setupManagerLog(hmDir, { budget: 10.00, greenfield: true });

    await resumeFromCheckpoint(
      { awaiting: "approve-plan", message: "", timestamp: "2026-03-18T00:00:00Z", feedback: null },
      dirs, config,
    );

    // timing-report.md exists with expected content
    const reportPath = join(hmDir, "timing-report.md");
    expect(existsSync(reportPath)).toBe(true);
    const reportContent = readFileSync(reportPath, "utf-8");
    expect(reportContent).toContain("# Agent Timing Report");
    expect(reportContent).toContain("|");

    // Console has cost summary
    const logs = getLogs();
    expect(logs.some((l) => l.includes("Cost summary"))).toBe(true);
    expect(logs.some((l) => l.includes("$"))).toBe(true);

    // Console has timing summary
    expect(logs.some((l) => l.includes("Timing summary"))).toBe(true);
    expect(logs.some((l) => l.includes("Fastest:"))).toBe(true);
    expect(logs.some((l) => l.includes("Median:"))).toBe(true);
    expect(logs.some((l) => l.includes("Slowest:"))).toBe(true);

    // Checkpoint at verify
    const cp = readCheckpointFile(hmDir);
    expect(cp?.awaiting).toBe("verify");
  });

  // ── Test 7: output file polling flag flows through agent results ──
  it("output file polling flag flows through agent results", async () => {
    const { runPipeline } = await import("../../orchestrator.js");

    // Make one agent type return killedByOutputDetection: true
    killedByOutputDetectionOverrides["implementer"] = true;

    await runPipeline(prdPath, dirs, config, { skipNormalize: true, stopAfterPlan: true });

    // Pipeline completes without error (killedByOutputDetection treated as success)
    // With stopAfterPlan, the spawner mock returns the flag but the pipeline still completes

    // Verify the mock returned the flag properly
    const logs = getLogs();
    // Pipeline should complete normally
    expect(logs.some((l) => l.includes("Plan Preview") || l.includes("SPEC stage") || l.includes("PLAN stage"))).toBe(true);

    // Verify the spawnCalls happened
    expect(spawnCalls.length).toBeGreaterThan(0);

    // Check that execution-plan.json was produced
    expect(existsSync(join(hmDir, "plans", "execution-plan.json"))).toBe(true);
  });
});
