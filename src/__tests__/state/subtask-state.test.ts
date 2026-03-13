import { describe, it, expect } from "vitest";
import type { ExecutionPlan, Story } from "../../types/execution-plan.js";
import {
  updateSubTaskStatus,
  incrementSubTaskAttempts,
  allSubTasksPassed,
  getPendingSubTasks,
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
          { id: "US-01.1", title: "Types", targetFiles: ["src/a.ts"], acceptanceCriteria: ["AC-1"], exitCriteria: ["EC-1"], status: "not-started", attempts: 0 },
          { id: "US-01.2", title: "Logic", targetFiles: ["src/b.ts"], acceptanceCriteria: ["AC-2"], exitCriteria: ["EC-2"], status: "not-started", attempts: 0 },
          { id: "US-01.3", title: "Utils", targetFiles: ["src/c.ts"], acceptanceCriteria: ["AC-3"], exitCriteria: ["EC-3"], status: "not-started", attempts: 0 },
        ],
        ...storyOverrides,
      },
    ],
  };
}

describe("sub-task state management (FW-01)", () => {
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

  it("updateSubTaskStatus: rejects invalid transition not-started → passed", () => {
    const plan = makePlan();
    expect(() => updateSubTaskStatus(plan, "US-01", "US-01.1", "passed")).toThrow("Invalid sub-task transition");
  });

  it("updateSubTaskStatus: failed → in-progress (retry)", () => {
    const plan = makePlan();
    let updated = updateSubTaskStatus(plan, "US-01", "US-01.2", "in-progress");
    updated = updateSubTaskStatus(updated, "US-01", "US-01.2", "failed");
    updated = updateSubTaskStatus(updated, "US-01", "US-01.2", "in-progress");
    const st = updated.stories[0].subTasks!.find((s) => s.id === "US-01.2")!;
    expect(st.status).toBe("in-progress");
  });

  it("updateSubTaskStatus: throws for unknown story", () => {
    const plan = makePlan();
    expect(() => updateSubTaskStatus(plan, "US-99", "US-99.1", "in-progress")).toThrow("Story not found");
  });

  it("updateSubTaskStatus: throws for unknown sub-task", () => {
    const plan = makePlan();
    expect(() => updateSubTaskStatus(plan, "US-01", "US-01.9", "in-progress")).toThrow("Sub-task not found");
  });

  it("updateSubTaskStatus: throws if story has no sub-tasks", () => {
    const plan = makePlan({ subTasks: undefined });
    expect(() => updateSubTaskStatus(plan, "US-01", "US-01.1", "in-progress")).toThrow("has no sub-tasks");
  });

  it("incrementSubTaskAttempts: increments correctly", () => {
    const plan = makePlan();
    const updated = incrementSubTaskAttempts(plan, "US-01", "US-01.1");
    const st = updated.stories[0].subTasks!.find((s) => s.id === "US-01.1")!;
    expect(st.attempts).toBe(1);
  });

  it("allSubTasksPassed: false when some not-started", () => {
    const plan = makePlan();
    expect(allSubTasksPassed(plan.stories[0])).toBe(false);
  });

  it("allSubTasksPassed: true when all passed", () => {
    const plan = makePlan();
    const story = {
      ...plan.stories[0],
      subTasks: plan.stories[0].subTasks!.map((st) => ({ ...st, status: "passed" as const })),
    };
    expect(allSubTasksPassed(story)).toBe(true);
  });

  it("allSubTasksPassed: true when no sub-tasks", () => {
    const plan = makePlan({ subTasks: undefined });
    expect(allSubTasksPassed(plan.stories[0])).toBe(true);
  });

  it("getPendingSubTasks: returns non-passed sub-tasks", () => {
    const plan = makePlan();
    let updated = updateSubTaskStatus(plan, "US-01", "US-01.1", "in-progress");
    updated = updateSubTaskStatus(updated, "US-01", "US-01.1", "passed");
    const pending = getPendingSubTasks(updated.stories[0]);
    expect(pending.length).toBe(2);
    expect(pending.map((st) => st.id)).toEqual(["US-01.2", "US-01.3"]);
  });

  it("getPendingSubTasks: returns empty for story without sub-tasks", () => {
    const plan = makePlan({ subTasks: undefined });
    expect(getPendingSubTasks(plan.stories[0])).toEqual([]);
  });
});
