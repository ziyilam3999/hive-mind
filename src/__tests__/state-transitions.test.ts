import { describe, it, expect } from "vitest";
import { updateStoryStatus } from "../state/execution-plan.js";
import type { ExecutionPlan } from "../types/execution-plan.js";

const makePlan = (status: "not-started" | "in-progress" | "passed" | "failed"): ExecutionPlan => ({
  schemaVersion: "2.0.0",
  prdPath: "PRD.md",
  specPath: "SPEC.md",
  stories: [{
    id: "US-01",
    title: "Test",
    specSections: ["1.1"],
    dependencies: [],
    sourceFiles: ["src/foo.ts"],
    complexity: "low",
    rolesUsed: ["analyst"],
    stepFile: "steps/US-01.md",
    status,
    attempts: 0,
    maxAttempts: 3,
    committed: false,
    commitHash: null,
  }],
});

describe("status transitions", () => {
  it("allows not-started -> in-progress", () => {
    const result = updateStoryStatus(makePlan("not-started"), "US-01", "in-progress");
    expect(result.stories[0].status).toBe("in-progress");
  });

  it("allows in-progress -> passed", () => {
    const result = updateStoryStatus(makePlan("in-progress"), "US-01", "passed");
    expect(result.stories[0].status).toBe("passed");
  });

  it("allows in-progress -> failed", () => {
    const result = updateStoryStatus(makePlan("in-progress"), "US-01", "failed");
    expect(result.stories[0].status).toBe("failed");
  });

  it("rejects not-started -> passed", () => {
    expect(() => updateStoryStatus(makePlan("not-started"), "US-01", "passed")).toThrow("Invalid status transition");
  });

  it("rejects passed -> in-progress", () => {
    expect(() => updateStoryStatus(makePlan("passed"), "US-01", "in-progress")).toThrow("Invalid status transition");
  });
});
