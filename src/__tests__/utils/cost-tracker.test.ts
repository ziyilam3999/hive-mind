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
