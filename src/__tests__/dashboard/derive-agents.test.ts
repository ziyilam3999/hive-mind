import { describe, it, expect } from "vitest";
import {
  deriveActiveAgents,
  type Story,
  type ManagerLogEntry,
  type CostLogEntry,
} from "../../dashboard/derive-agents.js";

const NOW = 1700000000000;

function ts(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

function logEntry(
  action: string,
  offsetMs: number,
  extra?: Partial<ManagerLogEntry>,
): ManagerLogEntry {
  return { timestamp: ts(offsetMs), action, ...extra };
}

describe("deriveActiveAgents", () => {
  // --- Pipeline agents (no stories) ---

  it("returns spec-agent when only PIPELINE_START exists", () => {
    const log = [logEntry("PIPELINE_START", -5000)];
    const result = deriveActiveAgents(null, log, [], NOW);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].type).toBe("spec-agent");
    expect(result.agents[0].context).toBe("SPEC");
    expect(result.agents[0].pipeline).toBe(true);
    expect(result.agents[0].description).toBe(
      "Generating specification from PRD",
    );
  });

  it("returns planner when SPEC_COMPLETE but no PLAN_COMPLETE", () => {
    const log = [
      logEntry("PIPELINE_START", -10000),
      logEntry("SPEC_COMPLETE", -5000),
    ];
    const result = deriveActiveAgents(null, log, [], NOW);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].type).toBe("planner");
    expect(result.agents[0].context).toBe("PLAN");
    expect(result.agents[0].description).toBe("Creating execution plan");
  });

  it("returns no pipeline agents when PLAN_COMPLETE exists", () => {
    const log = [
      logEntry("PIPELINE_START", -20000),
      logEntry("SPEC_COMPLETE", -10000),
      logEntry("PLAN_COMPLETE", -5000),
    ];
    const result = deriveActiveAgents(null, log, [], NOW);
    expect(result.agents).toHaveLength(0);
  });

  // --- Story agent type mapping ---

  it("maps in-progress story with no substage to implementer/BUILD", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].type).toBe("implementer");
    expect(result.agents[0].substage).toBe("BUILD");
    expect(result.agents[0].context).toBe("US-01");
  });

  it("maps substage VERIFY to verifier", () => {
    const stories: Story[] = [
      { id: "US-01", status: "in-progress", substage: "VERIFY" },
    ];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents[0].type).toBe("verifier");
    expect(result.agents[0].substage).toBe("VERIFY");
  });

  it("maps substage COMMIT to committer", () => {
    const stories: Story[] = [
      { id: "US-01", status: "in-progress", substage: "COMMIT" },
    ];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents[0].type).toBe("committer");
    expect(result.agents[0].substage).toBe("COMMIT");
  });

  it("maps substage TEST to tester", () => {
    const stories: Story[] = [
      { id: "US-01", status: "in-progress", substage: "TEST" },
    ];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents[0].type).toBe("tester");
    expect(result.agents[0].substage).toBe("TEST");
  });

  // --- Manager log overrides ---

  it("overrides to refactorer on BUILD_COMPLETE", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const log = [
      logEntry("BUILD_COMPLETE", -1000, { storyId: "US-01" }),
    ];
    const result = deriveActiveAgents(stories, log, [], NOW);
    expect(result.agents[0].type).toBe("refactorer");
    expect(result.agents[0].substage).toBe("BUILD");
  });

  it("overrides to verifier on VERIFY_ATTEMPT", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const log = [
      logEntry("VERIFY_ATTEMPT", -1000, { storyId: "US-01", attempt: 2 }),
    ];
    const result = deriveActiveAgents(stories, log, [], NOW);
    expect(result.agents[0].type).toBe("verifier");
    expect(result.agents[0].substage).toBe("VERIFY");
  });

  it("overrides to implementer/RETRY on BUILD_RETRY", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const log = [
      logEntry("BUILD_RETRY", -1000, { storyId: "US-01", attempt: 3 }),
    ];
    const result = deriveActiveAgents(stories, log, [], NOW);
    expect(result.agents[0].type).toBe("implementer");
    expect(result.agents[0].substage).toBe("RETRY");
  });

  it("overrides to compliance on COMPLIANCE_CHECK", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const log = [
      logEntry("COMPLIANCE_CHECK", -1000, { storyId: "US-01" }),
    ];
    const result = deriveActiveAgents(stories, log, [], NOW);
    expect(result.agents[0].type).toBe("compliance");
    expect(result.agents[0].substage).toBe("VERIFY");
  });

  // --- Subtask extraction ---

  it("extracts first in-progress subtask ID", () => {
    const stories: Story[] = [
      {
        id: "US-01",
        status: "in-progress",
        subTasks: [
          { id: "US-01.1", status: "done" },
          { id: "US-01.2", status: "in-progress" },
          { id: "US-01.3", status: "pending" },
        ],
      },
    ];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents[0].subtaskId).toBe("US-01.2");
  });

  it("returns null subtaskId when no subtask is in-progress", () => {
    const stories: Story[] = [
      {
        id: "US-01",
        status: "in-progress",
        subTasks: [
          { id: "US-01.1", status: "done" },
          { id: "US-01.2", status: "done" },
        ],
      },
    ];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents[0].subtaskId).toBeNull();
  });

  it("returns null subtaskId when no subTasks exist", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents[0].subtaskId).toBeNull();
  });

  // --- Descriptions ---

  it("includes attempt number in description from VERIFY_ATTEMPT", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const log = [
      logEntry("VERIFY_ATTEMPT", -1000, { storyId: "US-01", attempt: 2 }),
    ];
    const result = deriveActiveAgents(stories, log, [], NOW);
    expect(result.agents[0].description).toBe(
      "Running verification (attempt 2)",
    );
  });

  it("uses fallback description when no manager log entry", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents[0].description).toBe("Building implementation");
  });

  it("uses VERIFY fallback description for substage VERIFY without log", () => {
    const stories: Story[] = [
      { id: "US-01", status: "in-progress", substage: "VERIFY" },
    ];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents[0].description).toBe("Running verification");
  });

  it("uses TEST fallback description", () => {
    const stories: Story[] = [
      { id: "US-01", status: "in-progress", substage: "TEST" },
    ];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents[0].description).toBe("Running tests");
  });

  it("uses COMMIT fallback description", () => {
    const stories: Story[] = [
      { id: "US-01", status: "in-progress", substage: "COMMIT" },
    ];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents[0].description).toBe("Preparing commit");
  });

  // --- Wave tracking ---

  it("tracks currentWave from WAVE_START entries", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const log = [
      logEntry("WAVE_START", -5000, { waveNumber: 1, storyIds: ["US-01"] }),
      logEntry("WAVE_START", -2000, { waveNumber: 2, storyIds: ["US-02"] }),
    ];
    const result = deriveActiveAgents(stories, log, [], NOW);
    expect(result.currentWave).toBe(2);
  });

  it("returns null currentWave when no WAVE_START entries", () => {
    const result = deriveActiveAgents(null, [], [], NOW);
    expect(result.currentWave).toBeNull();
  });

  // --- Start time resolution ---

  it("uses earliest costLog timestamp as startTs", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const cost: CostLogEntry[] = [
      { storyId: "US-01", timestamp: ts(-8000) },
      { storyId: "US-01", timestamp: ts(-3000) },
    ];
    const result = deriveActiveAgents(stories, [], cost, NOW);
    expect(result.agents[0].startTs).toBe(NOW - 8000);
  });

  it("falls back to waveStart when no costLog", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const log = [
      logEntry("WAVE_START", -6000, {
        waveNumber: 1,
        storyIds: ["US-01"],
      }),
    ];
    const result = deriveActiveAgents(stories, log, [], NOW);
    expect(result.agents[0].startTs).toBe(NOW - 6000);
  });

  it("falls back to now - durationMs when no costLog or waveStart", () => {
    const stories: Story[] = [
      { id: "US-01", status: "in-progress", durationMs: 4000 },
    ];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents[0].startTs).toBe(NOW - 4000);
  });

  // --- Edge cases ---

  it("returns empty agents for completely empty inputs", () => {
    const result = deriveActiveAgents(null, [], [], NOW);
    expect(result.agents).toHaveLength(0);
    expect(result.currentWave).toBeNull();
  });

  it("skips non-in-progress stories", () => {
    const stories: Story[] = [
      { id: "US-01", status: "passed" },
      { id: "US-02", status: "failed" },
      { id: "US-03", status: "pending" },
    ];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents).toHaveLength(0);
  });

  it("suppresses pipeline agents when any story is in-progress", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const log = [logEntry("PIPELINE_START", -10000)];
    const result = deriveActiveAgents(stories, log, [], NOW);
    // Should only have story agent, not spec-agent
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].type).toBe("implementer");
    expect(result.agents[0].pipeline).toBe(false);
  });

  it("handles multiple in-progress stories", () => {
    const stories: Story[] = [
      { id: "US-01", status: "in-progress" },
      { id: "US-02", status: "in-progress", substage: "VERIFY" },
      { id: "US-03", status: "passed" },
    ];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents).toHaveLength(2);
    expect(result.agents[0].context).toBe("US-01");
    expect(result.agents[0].type).toBe("implementer");
    expect(result.agents[1].context).toBe("US-02");
    expect(result.agents[1].type).toBe("verifier");
  });

  it("assigns story wave from story object", () => {
    const stories: Story[] = [
      { id: "US-01", status: "in-progress", wave: 3 },
    ];
    const result = deriveActiveAgents(stories, [], [], NOW);
    expect(result.agents[0].wave).toBe(3);
  });

  it("should use wave 0 when story.wave is 0", () => {
    const stories: Story[] = [
      { id: "US-01", status: "in-progress", wave: 0 },
    ];
    const log = [
      logEntry("WAVE_START", -5000, { waveNumber: 3, storyIds: ["US-01"] }),
    ];
    const result = deriveActiveAgents(stories, log, [], NOW);
    expect(result.agents[0].wave).toBe(0);
  });

  it("falls back to currentWave when story has no wave", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const log = [
      logEntry("WAVE_START", -5000, { waveNumber: 2, storyIds: ["US-01"] }),
    ];
    const result = deriveActiveAgents(stories, log, [], NOW);
    expect(result.agents[0].wave).toBe(2);
  });

  it("uses latest manager log entry per story for overrides", () => {
    const stories: Story[] = [{ id: "US-01", status: "in-progress" }];
    const log = [
      logEntry("BUILD_COMPLETE", -5000, { storyId: "US-01" }),
      logEntry("VERIFY_ATTEMPT", -2000, { storyId: "US-01", attempt: 1 }),
    ];
    const result = deriveActiveAgents(stories, log, [], NOW);
    // Latest action is VERIFY_ATTEMPT, should override to verifier
    expect(result.agents[0].type).toBe("verifier");
    expect(result.agents[0].substage).toBe("VERIFY");
  });
});
