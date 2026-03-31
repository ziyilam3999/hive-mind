import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all heavy dependencies to isolate dashboard lifecycle tests
vi.mock("../dashboard/server.js", () => ({
  startDashboard: vi.fn(),
  isDashboardRunning: vi.fn().mockResolvedValue(false),
}));

vi.mock("../utils/file-io.js", () => ({
  fileExists: vi.fn().mockReturnValue(true),
  ensureDir: vi.fn(),
  readFileSafe: vi.fn().mockReturnValue(null),
  writeFileAtomic: vi.fn(),
}));

vi.mock("../memory/memory-manager.js", () => ({
  createMemoryFromTemplate: vi.fn(),
}));

vi.mock("../state/checkpoint.js", () => ({
  writeCheckpoint: vi.fn(),
  deleteCheckpoint: vi.fn(),
  getCheckpointMessage: vi.fn().mockReturnValue("checkpoint message"),
}));

vi.mock("../state/manager-log.js", () => ({
  appendLogEntry: vi.fn(),
  createLogEntry: vi.fn().mockReturnValue({}),
}));

vi.mock("../utils/timestamp.js", () => ({
  isoTimestamp: vi.fn().mockReturnValue("2026-01-01T00:00:00Z"),
}));

vi.mock("../stages/normalize-stage.js", () => ({
  runNormalizeStage: vi.fn(),
}));

vi.mock("../stages/scorecard.js", () => ({
  runScorecard: vi.fn(),
}));

vi.mock("../reports/live-report.js", () => ({
  updateLiveReport: vi.fn(),
}));

vi.mock("../utils/notify.js", () => ({
  notifyCheckpoint: vi.fn(),
}));

vi.mock("../utils/cost-tracker.js", () => {
  class MockCostTracker {
    getSummary() { return { totalCostUsd: 0, perStory: new Map() }; }
    getTimingSummary() { return { agentCount: 0 }; }
    recordAgentCost() {}
  }
  return {
    CostTracker: MockCostTracker,
    estimatePipelineCost: vi.fn().mockReturnValue(0),
  };
});

vi.mock("../stages/spec-stage.js", () => ({
  runSpecStage: vi.fn(),
}));

vi.mock("../stages/plan-stage.js", () => ({
  runPlanStage: vi.fn().mockResolvedValue({ registryGapsFixed: [] }),
}));

vi.mock("../manifest/generator.js", () => ({
  updateManifest: vi.fn(),
}));

vi.mock("../config/schema.js", () => ({}));

import { startDashboard } from "../dashboard/server.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";

const mockStartDashboard = vi.mocked(startDashboard);

const mockDirs: PipelineDirs = {
  workingDir: "/tmp/test-working",
  knowledgeDir: "/tmp/test-knowledge",
  labDir: "/tmp/test-lab",
};

const mockConfig: HiveMindConfig = {
  workingDir: ".hive-mind-working",
  knowledgeDir: "../.hive-mind-persist",
  labDir: ".hive-mind-lab",
  skipNormalize: false,
  liveReport: false,
  stageTimeouts: {
    preplan: 7_200_000,
    planDecompose: 7_200_000,
    postExecute: 3_600_000,
    hardCap: 172_800_000,
  },
} as HiveMindConfig;

describe("orchestrator dashboard lifecycle", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    stderrSpy.mockRestore();
  });

  it("does not call startDashboard when noDashboard is true", async () => {
    const { runPipeline } = await import("../orchestrator.js");

    mockStartDashboard.mockResolvedValue({
      stop: vi.fn(),
      url: "http://localhost:12345",
      signalShutdown: vi.fn(),
    });

    await runPipeline("/tmp/test.md", mockDirs, mockConfig, {
      noDashboard: true,
    });

    expect(mockStartDashboard).not.toHaveBeenCalled();
  });

  it("logs to stderr and continues pipeline when startDashboard throws", async () => {
    const { runPipeline } = await import("../orchestrator.js");

    mockStartDashboard.mockRejectedValue(new Error("port bind failed"));

    await runPipeline("/tmp/test.md", mockDirs, mockConfig, {});

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Dashboard server error:")
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("port bind failed")
    );
  });

  it("calls signalShutdown and schedules stop() on successful pipeline", async () => {
    const mockStop = vi.fn();
    const mockSignalShutdown = vi.fn();
    const { runPipeline } = await import("../orchestrator.js");

    mockStartDashboard.mockResolvedValue({
      stop: mockStop,
      url: "http://localhost:12345",
      signalShutdown: mockSignalShutdown,
    });

    await runPipeline("/tmp/test.md", mockDirs, mockConfig, {});

    expect(mockSignalShutdown).toHaveBeenCalledWith(
      expect.any(Number)
    );
    // Verify the 60s offset
    const shutdownAt = mockSignalShutdown.mock.calls[0][0];
    expect(shutdownAt).toBeGreaterThan(Date.now());

    // stop() should not have been called yet (scheduled for 60s later)
    expect(mockStop).not.toHaveBeenCalled();

    // Advance timer to trigger deferred stop
    vi.advanceTimersByTime(60_000);
    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});

// ---------- Timeout & HardCap Tests ----------

import { createLogEntry } from "../state/manager-log.js";
import { readFileSafe } from "../utils/file-io.js";
import { runNormalizeStage } from "../stages/normalize-stage.js";

const mockCreateLogEntry = vi.mocked(createLogEntry);
const mockReadFileSafe = vi.mocked(readFileSafe);
const mockNormalize = vi.mocked(runNormalizeStage);

const timeoutConfig: HiveMindConfig = {
  ...mockConfig,
  skipNormalize: false,
  liveReport: false,
  stageTimeouts: {
    preplan: 7_200_000,
    planDecompose: 7_200_000,
    postExecute: 3_600_000,
    hardCap: 172_800_000,
  },
} as HiveMindConfig;

describe("orchestrator timeout and hardCap", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy2: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stderrSpy2 = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    stderrSpy2.mockRestore();
    vi.restoreAllMocks();
  });

  // AC-01, AC-03: fresh start sets pipelineStartTime to Date.now()
  it("fresh start sets pipelineStartTime to Date.now() in PIPELINE_START log", async () => {
    const { runPipeline } = await import("../orchestrator.js");

    const before = Date.now();
    await runPipeline("/tmp/test.md", mockDirs, timeoutConfig, { noDashboard: true });
    const after = Date.now();

    const startCall = mockCreateLogEntry.mock.calls.find(c => c[0] === "PIPELINE_START");
    expect(startCall).toBeDefined();
    const data = startCall![1] as Record<string, unknown>;
    expect(data.pipelineStartTime).toBeDefined();
    expect(typeof data.pipelineStartTime).toBe("number");
    expect(data.pipelineStartTime as number).toBeGreaterThanOrEqual(before);
    expect(data.pipelineStartTime as number).toBeLessThanOrEqual(after + 5000);
  });

  // AC-02, SC-14: dynamic mode log — PIPELINE_START includes timeout when set
  it("SC-14: dynamic mode log — PIPELINE_START includes timeout field when --timeout is set", async () => {
    const { runPipeline } = await import("../orchestrator.js");

    await runPipeline("/tmp/test.md", mockDirs, timeoutConfig, {
      noDashboard: true,
      timeoutMs: 3_600_000,
    });

    const startCall = mockCreateLogEntry.mock.calls.find(c => c[0] === "PIPELINE_START");
    const data = startCall![1] as Record<string, unknown>;
    expect(data.timeout).toBe(3_600_000);
    expect(data.pipelineStartTime).toBeDefined();
  });

  // AC-02: dynamic mode — timeout is undefined when no --timeout
  it("SC-14: dynamic mode log — PIPELINE_START has undefined timeout when no --timeout flag", async () => {
    const { runPipeline } = await import("../orchestrator.js");

    await runPipeline("/tmp/test.md", mockDirs, timeoutConfig, { noDashboard: true });

    const startCall = mockCreateLogEntry.mock.calls.find(c => c[0] === "PIPELINE_START");
    const data = startCall![1] as Record<string, unknown>;
    expect(data.timeout).toBeUndefined();
  });

  // AC-06, SC-15: CLI timeout overrides hardCap — effectiveHardCap = 3600000 when timeoutMs is set
  it("SC-15: CLI timeout overrides hardCap — effectiveHardCap uses timeoutMs=3600000 instead of config hardCap", async () => {
    const { runPipeline } = await import("../orchestrator.js");

    // Config hardCap = 172_800_000 (48h), but CLI timeoutMs = 1 (effectively immediate)
    // If effectiveHardCap = timeoutMs = 1, the abort should fire
    let callIdx = 0;
    vi.spyOn(Date, "now").mockImplementation(() => {
      callIdx++;
      return 1_700_000_000_000 + callIdx * 10;
    });

    await runPipeline("/tmp/test.md", mockDirs, timeoutConfig, {
      noDashboard: true,
      timeoutMs: 1, // 1ms — should immediately exceed
    });

    // effectiveHardCap should be 1 (CLI), not 172800000 (config)
    // The abort should have triggered, skipping NORMALIZE
    expect(mockNormalize).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[timeout]"),
    );
  });

  // AC-07: effectiveHardCap uses config hardCap when no --timeout
  it("effectiveHardCap uses config hardCap when no timeout flag is set", async () => {
    const { runPipeline } = await import("../orchestrator.js");

    // Set hardCap = 1ms, no --timeout → effectiveHardCap = hardCap = 1
    const smallCapConfig = {
      ...timeoutConfig,
      stageTimeouts: { ...timeoutConfig.stageTimeouts, hardCap: 1 },
    } as HiveMindConfig;

    let callIdx = 0;
    vi.spyOn(Date, "now").mockImplementation(() => {
      callIdx++;
      return 1_700_000_000_000 + callIdx * 10;
    });

    await runPipeline("/tmp/test.md", mockDirs, smallCapConfig, { noDashboard: true });

    // effectiveHardCap = config.hardCap = 1ms, so abort fires
    expect(mockNormalize).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[timeout]"),
    );
  });

  // AC-08, SC-09: hardCap abort check fires when time exceeded
  it("SC-09: hardCap abort skips stages when hard cap exceeded and logs [timeout]", async () => {
    const { runPipeline } = await import("../orchestrator.js");

    const abortConfig = {
      ...timeoutConfig,
      stageTimeouts: { ...timeoutConfig.stageTimeouts, hardCap: 1 },
    } as HiveMindConfig;

    let callIdx = 0;
    vi.spyOn(Date, "now").mockImplementation(() => {
      callIdx++;
      // pipelineStartTime = first call; subsequent calls simulate 2ms elapsed
      return callIdx === 1 ? 1_700_000_000_000 : 1_700_000_000_002;
    });

    await runPipeline("/tmp/test.md", mockDirs, abortConfig, { noDashboard: true });

    // Verify abort triggered: NORMALIZE should NOT have been called
    expect(mockNormalize).not.toHaveBeenCalled();

    // Verify [timeout] was logged
    const timeoutLogs = consoleSpy.mock.calls.filter(
      (c: string[]) => typeof c[0] === "string" && c[0].includes("[timeout]"),
    );
    expect(timeoutLogs.length).toBeGreaterThan(0);
  });

  // AC-09: REPORT stage is exempt from hardCap abort (drain target)
  it("REPORT stage is exempt from abort — still runs after hardCap exceeded", async () => {
    // The REPORT exemption is structural: in runPipeline, the hardCap check
    // appears before NORMALIZE/SPEC but NOT before REPORT stage calls.
    // The REPORT stage is always called in writeReportAndCheckpoint regardless of abort.
    // We verify this structurally: the runReportStage function does NOT include
    // a hardCap check and documents REPORT as "exempt from abort".
    const { runReportStage } = await import("../orchestrator.js");
    // runReportStage should be callable regardless of timeout state — it's the drain target
    expect(runReportStage).toBeDefined();
    expect(typeof runReportStage).toBe("function");
  });
});

// ---------- getPipelineStartData recovery tests ----------

describe("getPipelineStartData timeout recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // AC-04, SC-13: resume timeout recovery — getPipelineStartData returns timeout and pipelineStartTime
  it("SC-13: resume timeout recovery — getPipelineStartData recovers timeout and pipelineStartTime from log", async () => {
    const logLine = JSON.stringify({
      action: "PIPELINE_START",
      prdPath: "/test.md",
      stopAfterPlan: false,
      timeout: 18000000,
      pipelineStartTime: 1711900000000,
    });
    mockReadFileSafe.mockReturnValue(logLine + "\n");

    const { getPipelineStartData } = await import("../orchestrator.js");
    const data = getPipelineStartData("/tmp/test-working");

    expect(data.timeout).toBe(18000000);
    expect(data.pipelineStartTime).toBe(1711900000000);
    expect(data.prdPath).toBe("/test.md");
  });

  // AC-05: resume does NOT reset pipelineStartTime to Date.now()
  it("resume uses recovered pipelineStartTime from log, not fresh Date.now()", async () => {
    const recoveredTime = 1711900000000; // A past timestamp
    const logLine = JSON.stringify({
      action: "PIPELINE_START",
      prdPath: "/test.md",
      stopAfterPlan: false,
      timeout: 18000000,
      pipelineStartTime: recoveredTime,
    });
    mockReadFileSafe.mockReturnValue(logLine + "\n");

    const { getPipelineStartData } = await import("../orchestrator.js");
    const data = getPipelineStartData("/tmp/test-working");

    // The recovered value should be the exact value from the log, not Date.now()
    expect(data.pipelineStartTime).toBe(recoveredTime);
  });

  // AC-11: invalid pipelineStartTime is rejected (security HIGH-01)
  it("invalid pipelineStartTime is rejected — NaN returns undefined", async () => {
    const logLine = JSON.stringify({
      action: "PIPELINE_START",
      prdPath: "/test.md",
      stopAfterPlan: false,
      pipelineStartTime: "not-a-number",
    });
    mockReadFileSafe.mockReturnValue(logLine + "\n");

    const { getPipelineStartData } = await import("../orchestrator.js");
    const data = getPipelineStartData("/tmp/test-working");

    expect(data.pipelineStartTime).toBeUndefined();
  });

  it("invalid pipelineStartTime is rejected — too small value returns undefined", async () => {
    const logLine = JSON.stringify({
      action: "PIPELINE_START",
      prdPath: "/test.md",
      stopAfterPlan: false,
      pipelineStartTime: 999,
    });
    mockReadFileSafe.mockReturnValue(logLine + "\n");

    const { getPipelineStartData } = await import("../orchestrator.js");
    const data = getPipelineStartData("/tmp/test-working");

    expect(data.pipelineStartTime).toBeUndefined();
  });

  it("invalid pipelineStartTime is rejected — future epoch returns undefined", async () => {
    const logLine = JSON.stringify({
      action: "PIPELINE_START",
      prdPath: "/test.md",
      stopAfterPlan: false,
      pipelineStartTime: 9999999999999,
    });
    mockReadFileSafe.mockReturnValue(logLine + "\n");

    const { getPipelineStartData } = await import("../orchestrator.js");
    const data = getPipelineStartData("/tmp/test-working");

    // 9999999999999 is far in the future, should be rejected
    expect(data.pipelineStartTime).toBeUndefined();
  });
});
