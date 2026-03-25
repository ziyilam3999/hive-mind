import { describe, it, expect } from "vitest";
import { deriveStages, type DeriveStagesInput } from "../../dashboard/derive-stages.js";

const NOW = new Date("2026-03-25T12:00:00Z").getTime();

function makeInput(overrides: Partial<DeriveStagesInput> = {}): DeriveStagesInput {
  return {
    managerLog: [],
    checkpoint: null,
    stories: null,
    costLog: null,
    ...overrides,
  };
}

function logEntry(action: string, timestamp: string) {
  return { action, timestamp };
}

describe("deriveStages", () => {
  it("returns 4 pending stages when log is empty", () => {
    const stages = deriveStages(makeInput(), NOW);
    expect(stages).toHaveLength(4);
    expect(stages.every((s) => s.status === "pending")).toBe(true);
  });

  it("uses primary startAction when available", () => {
    const input = makeInput({
      managerLog: [
        logEntry("SPEC_START", "2026-03-25T10:00:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    expect(stages[0].status).toBe("running");
    expect(stages[0].durationMs).toBeGreaterThan(0);
  });

  it("uses fallbackStart when primary is missing", () => {
    const input = makeInput({
      managerLog: [
        logEntry("PIPELINE_START", "2026-03-25T10:00:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    // PIPELINE_START is fallback for spec
    expect(stages[0].status).toBe("running");
  });

  it("uses secondaryFallback (WAVE_START) for execute when primary and fallback are missing", () => {
    const input = makeInput({
      managerLog: [
        logEntry("WAVE_START", "2026-03-25T10:30:00Z"),
        logEntry("WAVE_START", "2026-03-25T11:00:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    // Execute should use first WAVE_START occurrence
    expect(stages[2].status).toBe("running");
    expect(stages[2].durationMs).toBe(NOW - new Date("2026-03-25T10:30:00Z").getTime());
  });

  it("uses first occurrence of secondaryFallback, not last", () => {
    const firstTs = new Date("2026-03-25T10:00:00Z").getTime();
    const input = makeInput({
      managerLog: [
        logEntry("WAVE_START", "2026-03-25T10:00:00Z"),
        logEntry("WAVE_START", "2026-03-25T11:00:00Z"),
        logEntry("WAVE_START", "2026-03-25T11:30:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    expect(stages[2].durationMs).toBe(NOW - firstTs);
  });

  it("execute stays pending when no WAVE_START and no primary/fallback", () => {
    const input = makeInput({
      managerLog: [
        logEntry("SOME_OTHER_ACTION", "2026-03-25T10:00:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    expect(stages[2].status).toBe("pending");
  });

  it("returns paused status for checkpoint-gated stage", () => {
    const input = makeInput({
      managerLog: [
        logEntry("PIPELINE_START", "2026-03-25T09:00:00Z"),
        logEntry("SPEC_START", "2026-03-25T09:30:00Z"),
        logEntry("SPEC_COMPLETE", "2026-03-25T10:00:00Z"),
      ],
      checkpoint: { awaiting: "approve-spec" },
    });
    const stages = deriveStages(input, NOW);
    expect(stages[0].status).toBe("done"); // spec done
    expect(stages[1].status).toBe("paused"); // plan is gated by approve-spec
  });

  it("marks stage as done when start and end actions both present", () => {
    const input = makeInput({
      managerLog: [
        logEntry("SPEC_START", "2026-03-25T09:00:00Z"),
        logEntry("SPEC_COMPLETE", "2026-03-25T09:30:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    expect(stages[0].status).toBe("done");
    expect(stages[0].durationMs).toBe(30 * 60 * 1000);
  });

  it("marks execute as done via story completion even without EXECUTE_COMPLETE", () => {
    const input = makeInput({
      managerLog: [
        logEntry("EXECUTE_START", "2026-03-25T09:00:00Z"),
        logEntry("WAVE_COMPLETE", "2026-03-25T11:00:00Z"),
      ],
      stories: [
        { status: "passed" },
        { status: "passed" },
      ],
    });
    const stages = deriveStages(input, NOW);
    expect(stages[2].status).toBe("done");
  });

  it("marks execute as failed when stories have failures", () => {
    const input = makeInput({
      managerLog: [
        logEntry("EXECUTE_START", "2026-03-25T09:00:00Z"),
        logEntry("WAVE_COMPLETE", "2026-03-25T11:00:00Z"),
      ],
      stories: [
        { status: "passed" },
        { status: "failed" },
      ],
    });
    const stages = deriveStages(input, NOW);
    expect(stages[2].status).toBe("failed");
  });

  it("full pipeline: all stages done", () => {
    const input = makeInput({
      managerLog: [
        logEntry("PIPELINE_START", "2026-03-25T08:00:00Z"),
        logEntry("SPEC_START", "2026-03-25T08:10:00Z"),
        logEntry("SPEC_COMPLETE", "2026-03-25T08:30:00Z"),
        logEntry("PLAN_START", "2026-03-25T08:35:00Z"),
        logEntry("PLAN_COMPLETE", "2026-03-25T09:00:00Z"),
        logEntry("EXECUTE_START", "2026-03-25T09:05:00Z"),
        logEntry("EXECUTE_COMPLETE", "2026-03-25T10:00:00Z"),
        logEntry("REPORT_COMPLETE", "2026-03-25T10:30:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    expect(stages.every((s) => s.status === "done")).toBe(true);
  });
});
