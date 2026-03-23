import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all heavy dependencies to isolate dashboard lifecycle tests
vi.mock("../dashboard/server.js", () => ({
  startDashboard: vi.fn(),
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
