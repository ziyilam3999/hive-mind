import { describe, it, expect } from "vitest";
import type { StoryStatus, Story } from "./execution-plan.js";
import type { CheckpointType } from "./checkpoint.js";
import type { LogAction } from "./manager-log.js";
import type { AgentType } from "./agents.js";

describe("types", () => {
  it("StoryStatus accepts valid values", () => {
    const statuses: StoryStatus[] = ["not-started", "in-progress", "passed", "failed"];
    expect(statuses).toHaveLength(4);
  });

  it("Story interface is structurally valid", () => {
    const story: Story = {
      id: "US-01",
      title: "Test",
      specSections: ["1.1"],
      dependencies: [],
      sourceFiles: ["src/foo.ts"],
      complexity: "low",
      rolesUsed: ["analyst"],
      stepFile: "steps/US-01.md",
      status: "not-started",
      attempts: 0,
      maxAttempts: 3,
      committed: false,
      commitHash: null,
    };
    expect(story.id).toBe("US-01");
  });

  it("CheckpointType accepts valid values", () => {
    const types: CheckpointType[] = ["approve-spec", "approve-plan", "verify", "ship"];
    expect(types).toHaveLength(4);
  });

  it("LogAction accepts all 7 values", () => {
    const actions: LogAction[] = [
      "COMPLETED", "COMMITTED", "FAILED", "COMMIT_FAILED",
      "TOOLING_VERIFIED", "TOOLING_INSTALLED", "TOOLING_SETUP_FAILED",
    ];
    expect(actions).toHaveLength(7);
  });

  it("AgentType accepts all 20 values", () => {
    const agents: AgentType[] = [
      "researcher", "spec-drafter", "critic", "spec-corrector",
      "tooling-setup",
      "analyst", "reviewer", "security", "architect", "tester-role",
      "synthesizer",
      "implementer", "refactorer", "tester-exec", "evaluator",
      "diagnostician", "fixer", "learner",
      "reporter", "retrospective",
    ];
    expect(agents).toHaveLength(20);
  });
});
