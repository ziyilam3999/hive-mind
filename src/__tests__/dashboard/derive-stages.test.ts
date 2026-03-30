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
  it("returns 5 pending stages when log is empty", () => {
    const stages = deriveStages(makeInput(), NOW);
    expect(stages).toHaveLength(5);
    expect(stages.every((s) => s.status === "pending")).toBe(true);
  });

  it("uses primary startAction when available", () => {
    const input = makeInput({
      managerLog: [
        logEntry("SPEC_START", "2026-03-25T10:00:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    expect(stages[1].status).toBe("running");
    expect(stages[1].durationMs).toBeGreaterThan(0);
  });

  it("uses fallbackStart when primary is missing", () => {
    const input = makeInput({
      managerLog: [
        logEntry("PIPELINE_START", "2026-03-25T10:00:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    // Design has secondaryFallback — stays pending when only fallback exists (BUG-5 fix)
    expect(stages[0].status).toBe("pending");
    // Spec has no secondaryFallback — fallbackStart still works
    expect(stages[1].status).toBe("running");
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
    expect(stages[3].status).toBe("running");
    expect(stages[3].durationMs).toBe(NOW - new Date("2026-03-25T10:30:00Z").getTime());
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
    expect(stages[3].durationMs).toBe(NOW - firstTs);
  });

  it("execute stays pending when no WAVE_START and no primary/fallback", () => {
    const input = makeInput({
      managerLog: [
        logEntry("SOME_OTHER_ACTION", "2026-03-25T10:00:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    expect(stages[3].status).toBe("pending");
  });

  it("returns paused status for checkpoint-gated stage with startTs", () => {
    const input = makeInput({
      managerLog: [
        logEntry("PIPELINE_START", "2026-03-25T09:00:00Z"),
        logEntry("SPEC_START", "2026-03-25T09:30:00Z"),
        logEntry("SPEC_COMPLETE", "2026-03-25T10:00:00Z"),
      ],
      checkpoint: { awaiting: "approve-spec" },
    });
    const stages = deriveStages(input, NOW);
    expect(stages[1].status).toBe("done"); // spec done
    expect(stages[2].status).toBe("paused"); // plan is gated by approve-spec
  });

  it("returns paused status for checkpoint-gated stage even without startTs", () => {
    const input = makeInput({
      managerLog: [
        logEntry("PIPELINE_START", "2026-03-25T09:00:00Z"),
      ],
      checkpoint: { awaiting: "approve-normalize" },
    });
    const stages = deriveStages(input, NOW);
    // approve-normalize gates spec (index 1); design (index 0) runs via PIPELINE_START fallback
    expect(stages[1].status).toBe("paused");
  });

  it("returns paused when gated stage has zero log entries for its start", () => {
    const input = makeInput({
      managerLog: [],
      checkpoint: { awaiting: "approve-plan" },
    });
    const stages = deriveStages(input, NOW);
    // execute is gated by approve-plan, but no log entries at all
    expect(stages[3].status).toBe("paused");
  });

  it("marks stage as done when start and end actions both present", () => {
    const input = makeInput({
      managerLog: [
        logEntry("SPEC_START", "2026-03-25T09:00:00Z"),
        logEntry("SPEC_COMPLETE", "2026-03-25T09:30:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    expect(stages[1].status).toBe("done");
    expect(stages[1].durationMs).toBe(30 * 60 * 1000);
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
    expect(stages[3].status).toBe("done");
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
    expect(stages[3].status).toBe("failed");
  });

  // BUG-5: DESIGN stage should be pending (not running) when only PIPELINE_START exists
  it("BUG-5: design stage stays pending when no DESIGN_START or DESIGN_SKIPPED", () => {
    const input = makeInput({
      managerLog: [
        logEntry("PIPELINE_START", "2026-03-25T08:00:00Z"),
        logEntry("SPEC_START", "2026-03-25T08:10:00Z"),
        logEntry("SPEC_COMPLETE", "2026-03-25T08:30:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    // Design has no primary or secondary start — should be pending, not running with 22h duration
    expect(stages[0].status).toBe("pending");
    expect(stages[0].durationMs).toBeNull();
  });

  // BUG-5: DESIGN stage should be done when DESIGN_SKIPPED is in the log
  it("BUG-5: design stage uses DESIGN_SKIPPED as secondaryFallback", () => {
    const input = makeInput({
      managerLog: [
        logEntry("PIPELINE_START", "2026-03-25T08:00:00Z"),
        logEntry("DESIGN_SKIPPED", "2026-03-25T08:01:00Z"),
        logEntry("SPEC_START", "2026-03-25T08:10:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    // DESIGN_SKIPPED is secondaryFallback — gives startTs, stage should be running
    expect(stages[0].status).toBe("running");
  });

  // CRIT-03: REPORT_INCOMPLETE should not mark report as done
  it("CRIT-03: REPORT_INCOMPLETE alone does not mark report as done", () => {
    const input = makeInput({
      managerLog: [
        logEntry("EXECUTE_START", "2026-03-25T09:00:00Z"),
        logEntry("EXECUTE_COMPLETE", "2026-03-25T10:00:00Z"),
        logEntry("REPORT_INCOMPLETE", "2026-03-25T10:30:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    // Report stage: hasReportAction should be true from REPORT_INCOMPLETE
    // but no REPORT_COMPLETE endAction — report should still show done via fallback logic
    expect(stages[4].status).toBe("done");
  });

  // BUG-6: REPORT_COMPLETE marks report as done via endAction
  it("BUG-6: report stage shows done when REPORT_COMPLETE is logged", () => {
    const input = makeInput({
      managerLog: [
        logEntry("EXECUTE_START", "2026-03-25T09:00:00Z"),
        logEntry("EXECUTE_COMPLETE", "2026-03-25T10:00:00Z"),
        logEntry("REPORT_COMPLETE", "2026-03-25T10:30:00Z"),
      ],
    });
    const stages = deriveStages(input, NOW);
    expect(stages[4].status).toBe("done");
    expect(stages[4].durationMs).toBe(30 * 60 * 1000); // EXECUTE_COMPLETE to REPORT_COMPLETE
  });

  it("full pipeline: all stages done", () => {
    const input = makeInput({
      managerLog: [
        logEntry("PIPELINE_START", "2026-03-25T08:00:00Z"),
        logEntry("DESIGN_START", "2026-03-25T08:05:00Z"),
        logEntry("DESIGN_PROTOTYPE_APPROVED", "2026-03-25T08:08:00Z"),
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
