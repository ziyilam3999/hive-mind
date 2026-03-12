import { describe, it, expect } from "vitest";
import { getNextStory, getReadyStories, validateDependencies } from "../../state/execution-plan.js";
import { HiveMindError } from "../../utils/errors.js";
import type { ExecutionPlan, Story } from "../../types/execution-plan.js";

function makeStory(overrides: Partial<Story> & { id: string }): Story {
  return {
    title: overrides.id,
    specSections: [],
    dependencies: [],
    sourceFiles: [],
    complexity: "low",
    rolesUsed: [],
    stepFile: `steps/${overrides.id}.md`,
    status: "not-started",
    attempts: 0,
    maxAttempts: 3,
    committed: false,
    commitHash: null,
    ...overrides,
  };
}

function makePlan(stories: Story[]): ExecutionPlan {
  return {
    schemaVersion: "2.0.0",
    prdPath: "/prd.md",
    specPath: "/spec.md",
    stories,
  };
}

describe("getNextStory with dependencies", () => {
  it("returns story with no dependencies", () => {
    const plan = makePlan([
      makeStory({ id: "US-01" }),
    ]);
    expect(getNextStory(plan)?.id).toBe("US-01");
  });

  it("skips story with unmet dependencies", () => {
    const plan = makePlan([
      makeStory({ id: "US-01", dependencies: ["US-02"] }),
      makeStory({ id: "US-02" }),
    ]);
    // US-01 depends on US-02, but US-02 is not-started → skip US-01
    expect(getNextStory(plan)?.id).toBe("US-02");
  });

  it("returns story when all dependencies are passed", () => {
    const plan = makePlan([
      makeStory({ id: "US-01", dependencies: ["US-02"], status: "not-started" }),
      makeStory({ id: "US-02", status: "passed" }),
    ]);
    expect(getNextStory(plan)?.id).toBe("US-01");
  });

  it("skips story when dependency is failed", () => {
    const plan = makePlan([
      makeStory({ id: "US-01", dependencies: ["US-02"] }),
      makeStory({ id: "US-02", status: "failed" }),
    ]);
    // US-01 depends on US-02 (failed), US-02 is failed → no next story
    expect(getNextStory(plan)).toBeUndefined();
  });

  it("handles dependency chain (S2→S1, S3→S2)", () => {
    const plan = makePlan([
      makeStory({ id: "US-01" }),
      makeStory({ id: "US-02", dependencies: ["US-01"] }),
      makeStory({ id: "US-03", dependencies: ["US-02"] }),
    ]);
    // Only US-01 has no deps
    expect(getNextStory(plan)?.id).toBe("US-01");
  });

  it("returns independent story when dependent story is blocked", () => {
    const plan = makePlan([
      makeStory({ id: "US-01", dependencies: ["US-02"] }),
      makeStory({ id: "US-02", status: "passed" }),
      makeStory({ id: "US-03", dependencies: ["US-04"] }),
      makeStory({ id: "US-04", status: "in-progress" }),
    ]);
    // US-01 deps satisfied (US-02 passed), US-03 blocked (US-04 in-progress)
    expect(getNextStory(plan)?.id).toBe("US-01");
  });
});

describe("getReadyStories", () => {
  it("returns all stories with satisfied dependencies", () => {
    const plan = makePlan([
      makeStory({ id: "US-01" }),
      makeStory({ id: "US-02" }),
      makeStory({ id: "US-03", dependencies: ["US-01"] }),
    ]);
    const ready = getReadyStories(plan);
    expect(ready.map((s) => s.id)).toEqual(["US-01", "US-02"]);
  });

  it("excludes in-progress stories", () => {
    const plan = makePlan([
      makeStory({ id: "US-01", status: "in-progress" }),
      makeStory({ id: "US-02" }),
    ]);
    const ready = getReadyStories(plan);
    expect(ready.map((s) => s.id)).toEqual(["US-02"]);
  });

  it("returns empty array when all are blocked", () => {
    const plan = makePlan([
      makeStory({ id: "US-01", dependencies: ["US-02"] }),
      makeStory({ id: "US-02", dependencies: ["US-01"] }),
    ]);
    expect(getReadyStories(plan)).toEqual([]);
  });
});

describe("validateDependencies", () => {
  it("passes for valid dependency graph", () => {
    const plan = makePlan([
      makeStory({ id: "US-01" }),
      makeStory({ id: "US-02", dependencies: ["US-01"] }),
      makeStory({ id: "US-03", dependencies: ["US-01", "US-02"] }),
    ]);
    expect(() => validateDependencies(plan)).not.toThrow();
  });

  it("passes for no dependencies", () => {
    const plan = makePlan([
      makeStory({ id: "US-01" }),
      makeStory({ id: "US-02" }),
    ]);
    expect(() => validateDependencies(plan)).not.toThrow();
  });

  it("throws on circular dependency (A→B→A)", () => {
    const plan = makePlan([
      makeStory({ id: "US-01", dependencies: ["US-02"] }),
      makeStory({ id: "US-02", dependencies: ["US-01"] }),
    ]);
    expect(() => validateDependencies(plan)).toThrow(HiveMindError);
    expect(() => validateDependencies(plan)).toThrow("Circular dependency");
  });

  it("throws on circular dependency (A→B→C→A)", () => {
    const plan = makePlan([
      makeStory({ id: "US-01", dependencies: ["US-03"] }),
      makeStory({ id: "US-02", dependencies: ["US-01"] }),
      makeStory({ id: "US-03", dependencies: ["US-02"] }),
    ]);
    expect(() => validateDependencies(plan)).toThrow("Circular dependency");
  });

  it("throws on missing dependency ID", () => {
    const plan = makePlan([
      makeStory({ id: "US-01", dependencies: ["US-99"] }),
    ]);
    expect(() => validateDependencies(plan)).toThrow(HiveMindError);
    expect(() => validateDependencies(plan)).toThrow("unknown story: US-99");
  });
});
