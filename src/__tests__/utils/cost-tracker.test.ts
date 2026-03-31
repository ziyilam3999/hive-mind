import { describe, it, expect, vi } from "vitest";
import { CostTracker } from "../../utils/cost-tracker.js";
import { HiveMindError } from "../../utils/errors.js";

describe("CostTracker", () => {
  it("accumulates per-story and pipeline totals", () => {
    const tracker = new CostTracker();
    tracker.recordAgentCost("US-01", "implementer", 0.05, 5000);
    tracker.recordAgentCost("US-01", "tester-exec", 0.01, 2000);
    tracker.recordAgentCost("US-02", "implementer", 0.04, 4000);

    expect(tracker.getStoryTotal("US-01")).toBeCloseTo(0.06);
    expect(tracker.getStoryTotal("US-02")).toBeCloseTo(0.04);
    expect(tracker.getPipelineTotal()).toBeCloseTo(0.10);
  });

  it("handles missing/undefined cost data (returns 0, not crash)", () => {
    const tracker = new CostTracker();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    tracker.recordAgentCost("US-01", "implementer", undefined, undefined);

    expect(tracker.getStoryTotal("US-01")).toBe(0);
    expect(tracker.getPipelineTotal()).toBe(0);
    warnSpy.mockRestore();
  });

  it("logs warning when cost data is missing (K3)", () => {
    const tracker = new CostTracker();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    tracker.recordAgentCost("US-01", "implementer", undefined, 5000);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[CostTracker] Missing cost data for implementer (US-01)"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("defaulting to $0"),
    );
    warnSpy.mockRestore();
  });

  it("does not warn when cost data is present", () => {
    const tracker = new CostTracker();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    tracker.recordAgentCost("US-01", "implementer", 0.05, 5000);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns 0 for unknown story", () => {
    const tracker = new CostTracker();
    expect(tracker.getStoryTotal("US-99")).toBe(0);
  });

  it("checkBudget returns false when under budget", () => {
    const tracker = new CostTracker(1.00);
    tracker.recordAgentCost("US-01", "implementer", 0.50, 5000);
    expect(tracker.checkBudget()).toBe(false);
  });

  it("checkBudget returns true when budget exceeded", () => {
    const tracker = new CostTracker(0.10);
    tracker.recordAgentCost("US-01", "implementer", 0.15, 5000);
    expect(tracker.checkBudget()).toBe(true);
  });

  it("checkBudget returns false when no budget set", () => {
    const tracker = new CostTracker();
    tracker.recordAgentCost("US-01", "implementer", 999.99, 5000);
    expect(tracker.checkBudget()).toBe(false);
  });

  it("enforceBudget throws HiveMindError when exceeded", () => {
    const tracker = new CostTracker(0.10);
    tracker.recordAgentCost("US-01", "implementer", 0.15, 5000);
    expect(() => tracker.enforceBudget()).toThrow(HiveMindError);
    expect(() => tracker.enforceBudget()).toThrow("Budget exceeded");
  });

  it("enforceBudget does not throw when under budget", () => {
    const tracker = new CostTracker(1.00);
    tracker.recordAgentCost("US-01", "implementer", 0.05, 5000);
    expect(() => tracker.enforceBudget()).not.toThrow();
  });

  describe("getTimingSummary", () => {
    it("returns correct fastest/median/slowest", () => {
      const tracker = new CostTracker();
      tracker.recordAgentCost("SPEC", "critic", 0.01, 5000);
      tracker.recordAgentCost("SPEC", "researcher", 0.03, 10000);
      tracker.recordAgentCost("PLAN", "planner", 0.05, 12000);
      tracker.recordAgentCost("SPEC", "spec-drafter", 0.04, 15000);
      tracker.recordAgentCost("SPEC", "spec-corrector", 0.02, 20000);

      const timing = tracker.getTimingSummary();
      expect(timing.agentCount).toBe(5);
      expect(timing.fastest).toEqual({ agentType: "critic", storyId: "SPEC", durationMs: 5000 });
      // Math.floor(5/2) = 2 → index 2 in sorted array → planner at 12000
      expect(timing.median).toEqual({ agentType: "planner", storyId: "PLAN", durationMs: 12000 });
      expect(timing.slowest).toEqual({ agentType: "spec-corrector", storyId: "SPEC", durationMs: 20000 });
      expect(timing.totalDurationMs).toBe(62000);
    });

    it("filters out entries with durationMs === 0", () => {
      const tracker = new CostTracker();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      tracker.recordAgentCost("SPEC", "researcher", 0.03, 10000);
      tracker.recordAgentCost("SPEC", "critic", undefined, 0);

      const timing = tracker.getTimingSummary();
      expect(timing.agentCount).toBe(1);
      expect(timing.fastest!.agentType).toBe("researcher");
      warnSpy.mockRestore();
    });

    it("returns nulls when no entries have positive duration", () => {
      const tracker = new CostTracker();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      tracker.recordAgentCost("SPEC", "researcher", undefined, 0);
      tracker.recordAgentCost("SPEC", "critic", undefined, 0);

      const timing = tracker.getTimingSummary();
      expect(timing.agentCount).toBe(0);
      expect(timing.fastest).toBeNull();
      expect(timing.median).toBeNull();
      expect(timing.slowest).toBeNull();
      expect(timing.totalDurationMs).toBe(0);
      warnSpy.mockRestore();
    });

    it("handles single entry", () => {
      const tracker = new CostTracker();
      tracker.recordAgentCost("PLAN", "planner", 0.10, 8000);

      const timing = tracker.getTimingSummary();
      expect(timing.agentCount).toBe(1);
      expect(timing.fastest).toEqual({ agentType: "planner", storyId: "PLAN", durationMs: 8000 });
      expect(timing.median).toEqual({ agentType: "planner", storyId: "PLAN", durationMs: 8000 });
      expect(timing.slowest).toEqual({ agentType: "planner", storyId: "PLAN", durationMs: 8000 });
    });
  });

  describe("recordStoryDuration and getRollingAverageDuration", () => {
    it("getRollingAverageDuration returns 0 when no durations recorded", () => {
      const tracker = new CostTracker();
      expect(tracker.getRollingAverageDuration()).toBe(0);
    });

    it("getRollingAverageDuration returns arithmetic mean after 3 identical durations", () => {
      const tracker = new CostTracker();
      tracker.recordStoryDuration(60000);
      tracker.recordStoryDuration(60000);
      tracker.recordStoryDuration(60000);
      expect(tracker.getRollingAverageDuration()).toBe(60000);
    });

    it("getRollingAverageDuration returns correct mean for mixed durations", () => {
      const tracker = new CostTracker();
      tracker.recordStoryDuration(30000);
      tracker.recordStoryDuration(90000);
      expect(tracker.getRollingAverageDuration()).toBe(60000);
    });

    it("recordStoryDuration always records valid input regardless of configuration", () => {
      const tracker = new CostTracker();
      tracker.recordStoryDuration(1000);
      expect(tracker.getRollingAverageDuration()).toBe(1000);
      expect(tracker.getCompletedStoryCount()).toBe(1);
    });

    it("recordStoryDuration ignores NaN input (LOW-02 guard)", () => {
      const tracker = new CostTracker();
      tracker.recordStoryDuration(NaN);
      expect(tracker.getCompletedStoryCount()).toBe(0);
      expect(tracker.getRollingAverageDuration()).toBe(0);
    });

    it("recordStoryDuration ignores Infinity input (LOW-02 guard)", () => {
      const tracker = new CostTracker();
      tracker.recordStoryDuration(Infinity);
      expect(tracker.getCompletedStoryCount()).toBe(0);
    });

    it("recordStoryDuration ignores negative input", () => {
      const tracker = new CostTracker();
      tracker.recordStoryDuration(-5000);
      expect(tracker.getCompletedStoryCount()).toBe(0);
    });
  });

  describe("getCompletedStoryCount", () => {
    it("returns 0 with no recorded durations", () => {
      const tracker = new CostTracker();
      expect(tracker.getCompletedStoryCount()).toBe(0);
    });

    it("returns 3 after 3 recordStoryDuration calls", () => {
      const tracker = new CostTracker();
      tracker.recordStoryDuration(10000);
      tracker.recordStoryDuration(20000);
      tracker.recordStoryDuration(30000);
      expect(tracker.getCompletedStoryCount()).toBe(3);
    });
  });

  describe("projectRemainingTimeout", () => {
    it("returns 4050000 with avg=60000, remaining=5, buffer=1.5, grace=3600000", () => {
      const tracker = new CostTracker();
      tracker.recordStoryDuration(60000);
      // Formula: 60000 * 5 * 1.5 + 3600000 = 450000 + 3600000 = 4050000
      expect(tracker.projectRemainingTimeout(5, 1.5, 3600000)).toBe(4050000);
    });

    it("enforces 5-minute floor (300000ms) when projection is lower", () => {
      const tracker = new CostTracker();
      tracker.recordStoryDuration(1000);
      // Formula: 1000 * 1 * 1.0 + 0 = 1000 → floor to 300000
      expect(tracker.projectRemainingTimeout(1, 1.0, 0)).toBe(300000);
    });

    it("uses default bufferMultiplier=1.5 and graceMs=3600000", () => {
      const tracker = new CostTracker();
      tracker.recordStoryDuration(60000);
      // Formula: 60000 * 5 * 1.5 + 3600000 = 4050000
      expect(tracker.projectRemainingTimeout(5)).toBe(4050000);
    });

    it("returns graceMs when no durations recorded (avg=0)", () => {
      const tracker = new CostTracker();
      // Formula: 0 * 5 * 1.5 + 3600000 = 3600000
      expect(tracker.projectRemainingTimeout(5)).toBe(3600000);
    });
  });

  describe("checkCostVelocity", () => {
    it("returns insufficient when no stories completed", () => {
      const tracker = new CostTracker();
      const result = tracker.checkCostVelocity(5, 10);
      expect(result).toEqual({ overBudget: false, projectedUsd: 0, insufficient: true });
    });

    it("returns under-budget when projected cost is within 2x budget", () => {
      const tracker = new CostTracker();
      // Record 3 stories with total cost $6 (avg $2/story)
      tracker.recordAgentCost("US-01", "impl", 2, 5000);
      tracker.recordStoryDuration(5000);
      tracker.recordAgentCost("US-02", "impl", 2, 5000);
      tracker.recordStoryDuration(5000);
      tracker.recordAgentCost("US-03", "impl", 2, 5000);
      tracker.recordStoryDuration(5000);
      // projectedUsd = 2 * (3 + 5) = 16, overBudget = 16 > 2*10 = false
      const result = tracker.checkCostVelocity(5, 10);
      expect(result).toEqual({ overBudget: false, projectedUsd: 16, insufficient: false });
    });

    it("returns over-budget when projected cost exceeds 2x budget", () => {
      const tracker = new CostTracker();
      // Same cost setup: $6 total, 3 stories, avg $2
      tracker.recordAgentCost("US-01", "impl", 2, 5000);
      tracker.recordStoryDuration(5000);
      tracker.recordAgentCost("US-02", "impl", 2, 5000);
      tracker.recordStoryDuration(5000);
      tracker.recordAgentCost("US-03", "impl", 2, 5000);
      tracker.recordStoryDuration(5000);
      // projectedUsd = 2 * (3 + 5) = 16, overBudget = 16 > 2*5 = true
      const result = tracker.checkCostVelocity(5, 5);
      expect(result).toEqual({ overBudget: true, projectedUsd: 16, insufficient: false });
    });

    it("returns insufficient when budgetUsd is 0 (MEDIUM-01 guard)", () => {
      const tracker = new CostTracker();
      tracker.recordAgentCost("US-01", "impl", 2, 5000);
      tracker.recordStoryDuration(5000);
      const result = tracker.checkCostVelocity(5, 0);
      expect(result).toEqual({ overBudget: false, projectedUsd: 0, insufficient: true });
    });

    it("returns insufficient when budgetUsd is negative", () => {
      const tracker = new CostTracker();
      tracker.recordAgentCost("US-01", "impl", 2, 5000);
      tracker.recordStoryDuration(5000);
      const result = tracker.checkCostVelocity(5, -10);
      expect(result).toEqual({ overBudget: false, projectedUsd: 0, insufficient: true });
    });
  });

  it("getSummary returns correct structure", () => {
    const tracker = new CostTracker();
    tracker.recordAgentCost("US-01", "implementer", 0.05, 5000);
    tracker.recordAgentCost("US-02", "tester-exec", 0.01, 2000);

    const summary = tracker.getSummary();
    expect(summary.totalCostUsd).toBeCloseTo(0.06);
    expect(summary.totalDurationMs).toBe(7000);
    expect(summary.perStory.get("US-01")).toBeCloseTo(0.05);
    expect(summary.perStory.get("US-02")).toBeCloseTo(0.01);
    expect(summary.entries).toHaveLength(2);
  });
});
