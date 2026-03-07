import { describe, it, expect } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { saveExecutionPlan, updateStoryStatus, loadExecutionPlan } from "../../state/execution-plan.js";
import type { ExecutionPlan } from "../../types/execution-plan.js";

describe("atomic state writes", () => {
  const testDir = join(process.cwd(), ".test-atomic-state");

  it("saveExecutionPlan persists after every transition", () => {
    mkdirSync(testDir, { recursive: true });
    const planPath = join(testDir, "plan.json");

    const plan: ExecutionPlan = {
      schemaVersion: "2.0.0",
      prdPath: "PRD.md",
      specPath: "SPEC.md",
      stories: [{
        id: "US-01",
        title: "Test",
        specSections: ["1.1"],
        dependencies: [],
        sourceFiles: [],
        complexity: "low",
        rolesUsed: ["analyst"],
        stepFile: "steps/US-01.md",
        status: "not-started",
        attempts: 0,
        maxAttempts: 3,
        committed: false,
        commitHash: null,
      }],
    };

    // Save initial
    saveExecutionPlan(planPath, plan);
    let loaded = loadExecutionPlan(planPath);
    expect(loaded.stories[0].status).toBe("not-started");

    // Transition to in-progress and save
    const updated = updateStoryStatus(plan, "US-01", "in-progress");
    saveExecutionPlan(planPath, updated);
    loaded = loadExecutionPlan(planPath);
    expect(loaded.stories[0].status).toBe("in-progress");

    rmSync(testDir, { recursive: true });
  });
});
