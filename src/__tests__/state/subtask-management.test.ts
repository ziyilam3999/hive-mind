import { describe, it, expect } from "vitest";
import type { ExecutionPlan, Story } from "../../types/execution-plan.js";
import {
  updateSubTaskStatus,
  getNextSubTask,
  incrementSubTaskAttempts,
} from "../../state/execution-plan.js";

function makePlan(storyOverrides?: Partial<Story>): ExecutionPlan {
  return {
    schemaVersion: "2.0.0",
    prdPath: "PRD.md",
    specPath: "spec/SPEC-v1.0.md",
    stories: [
      {
        id: "US-01",
        title: "Test story",
        specSections: ["§1"],
        dependencies: [],
        sourceFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
        complexity: "high",
        rolesUsed: ["analyst"],
        stepFile: "plans/steps/US-01.md",
        status: "in-progress",
        attempts: 0,
        maxAttempts: 3,
        committed: false,
        commitHash: null,
        subTasks: [
          { id: "US-01.1", title: "Types", description: "Define types", sourceFiles: ["src/a.ts"], status: "not-started", attempts: 0, maxAttempts: 3 },
          { id: "US-01.2", title: "Logic", description: "Implement logic", sourceFiles: ["src/b.ts"], status: "not-started", attempts: 0, maxAttempts: 3 },
          { id: "US-01.3", title: "Utils", description: "Add utilities", sourceFiles: ["src/c.ts"], status: "not-started", attempts: 0, maxAttempts: 3 },
        ],
        ...storyOverrides,
      },
    ],
  };
}

describe("sub-task state management (FW-01)", () => {
  // updateSubTaskStatus tests
  it("updateSubTaskStatus: not-started → in-progress", () => {
    const plan = makePlan();
    const updated = updateSubTaskStatus(plan, "US-01", "US-01.1", "in-progress");
    const st = updated.stories[0].subTasks!.find((s) => s.id === "US-01.1")!;
    expect(st.status).toBe("in-progress");
  });

  it("updateSubTaskStatus: in-progress → passed", () => {
    const plan = makePlan();
    let updated = updateSubTaskStatus(plan, "US-01", "US-01.1", "in-progress");
    updated = updateSubTaskStatus(updated, "US-01", "US-01.1", "passed");
    const st = updated.stories[0].subTasks!.find((s) => s.id === "US-01.1")!;
    expect(st.status).toBe("passed");
  });

  it("updateSubTaskStatus: in-progress → failed", () => {
    const plan = makePlan();
    let updated = updateSubTaskStatus(plan, "US-01", "US-01.2", "in-progress");
    updated = updateSubTaskStatus(updated, "US-01", "US-01.2", "failed");
    const st = updated.stories[0].subTasks!.find((s) => s.id === "US-01.2")!;
    expect(st.status).toBe("failed");
  });

  it("updateSubTaskStatus: failed → in-progress (retry)", () => {
    const plan = makePlan();
    let updated = updateSubTaskStatus(plan, "US-01", "US-01.2", "in-progress");
    updated = updateSubTaskStatus(updated, "US-01", "US-01.2", "failed");
    updated = updateSubTaskStatus(updated, "US-01", "US-01.2", "in-progress");
    const st = updated.stories[0].subTasks!.find((s) => s.id === "US-01.2")!;
    expect(st.status).toBe("in-progress");
  });

  it("updateSubTaskStatus: rejects invalid transition not-started → passed", () => {
    const plan = makePlan();
    expect(() => updateSubTaskStatus(plan, "US-01", "US-01.1", "passed")).toThrow("Invalid sub-task transition");
  });

  it("updateSubTaskStatus: throws for unknown story", () => {
    const plan = makePlan();
    expect(() => updateSubTaskStatus(plan, "US-99", "US-99.1", "in-progress")).toThrow("Story not found");
  });

  it("updateSubTaskStatus: throws for story without sub-tasks", () => {
    const plan = makePlan({ subTasks: undefined });
    expect(() => updateSubTaskStatus(plan, "US-01", "US-01.1", "in-progress")).toThrow("has no sub-tasks");
  });

  // getNextSubTask tests
  it("getNextSubTask: returns first not-started sub-task", () => {
    const plan = makePlan();
    const next = getNextSubTask(plan.stories[0]);
    expect(next?.id).toBe("US-01.1");
  });

  it("getNextSubTask: skips passed, returns next not-started", () => {
    const plan = makePlan();
    let updated = updateSubTaskStatus(plan, "US-01", "US-01.1", "in-progress");
    updated = updateSubTaskStatus(updated, "US-01", "US-01.1", "passed");
    const next = getNextSubTask(updated.stories[0]);
    expect(next?.id).toBe("US-01.2");
  });

  it("getNextSubTask: returns failed sub-task with remaining attempts", () => {
    const plan = makePlan();
    let updated = updateSubTaskStatus(plan, "US-01", "US-01.1", "in-progress");
    updated = updateSubTaskStatus(updated, "US-01", "US-01.1", "failed");
    updated = incrementSubTaskAttempts(updated, "US-01", "US-01.1"); // attempts=1, max=3
    const next = getNextSubTask(updated.stories[0]);
    expect(next?.id).toBe("US-01.1"); // retry this one first
  });

  it("getNextSubTask: skips exhausted failed sub-task, returns next not-started", () => {
    const plan = makePlan();
    // Exhaust US-01.1
    let updated = updateSubTaskStatus(plan, "US-01", "US-01.1", "in-progress");
    updated = updateSubTaskStatus(updated, "US-01", "US-01.1", "failed");
    updated = incrementSubTaskAttempts(updated, "US-01", "US-01.1");
    updated = incrementSubTaskAttempts(updated, "US-01", "US-01.1");
    updated = incrementSubTaskAttempts(updated, "US-01", "US-01.1"); // attempts=3=maxAttempts
    const next = getNextSubTask(updated.stories[0]);
    expect(next?.id).toBe("US-01.2"); // US-01.1 exhausted, move to US-01.2
  });

  it("getNextSubTask: returns undefined when all passed", () => {
    const plan = makePlan();
    let updated = plan;
    for (const st of plan.stories[0].subTasks!) {
      updated = updateSubTaskStatus(updated, "US-01", st.id, "in-progress");
      updated = updateSubTaskStatus(updated, "US-01", st.id, "passed");
    }
    expect(getNextSubTask(updated.stories[0])).toBeUndefined();
  });

  it("getNextSubTask: returns undefined for story without sub-tasks", () => {
    const plan = makePlan({ subTasks: undefined });
    expect(getNextSubTask(plan.stories[0])).toBeUndefined();
  });

  // incrementSubTaskAttempts tests
  it("incrementSubTaskAttempts: increments correctly", () => {
    const plan = makePlan();
    const updated = incrementSubTaskAttempts(plan, "US-01", "US-01.1");
    const st = updated.stories[0].subTasks!.find((s) => s.id === "US-01.1")!;
    expect(st.attempts).toBe(1);
  });

  it("backward compat: stories without subTasks work with existing functions", () => {
    const plan = makePlan({ subTasks: undefined });
    expect(plan.stories[0].subTasks).toBeUndefined();
    // getNextSubTask returns undefined
    expect(getNextSubTask(plan.stories[0])).toBeUndefined();
  });
});
