import { describe, it, expect } from "vitest";
import { parseArgs } from "../index.js";
import { HiveMindError } from "../utils/errors.js";
import { getNextStory, updateStoryStatus, loadExecutionPlan, saveExecutionPlan } from "../state/execution-plan.js";
import type { ExecutionPlan } from "../types/execution-plan.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("parseArgs throws HiveMindError instead of process.exit", () => {
  it("throws on unknown command", () => {
    expect(() => parseArgs(["node", "cli", "unknown"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "unknown"])).toThrow("Unknown command");
  });

  it("throws on rejected flags", () => {
    expect(() => parseArgs(["node", "cli", "start", "--spec"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "start", "--spec"])).toThrow("Unknown option");
  });

  it("throws on start without --prd", () => {
    expect(() => parseArgs(["node", "cli", "start"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "start"])).toThrow("--prd");
  });

  it("throws on reject without --feedback", () => {
    expect(() => parseArgs(["node", "cli", "reject"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "reject"])).toThrow("--feedback");
  });
});

describe("parseArgs resume command", () => {
  it("parses resume with --from", () => {
    const result = parseArgs(["node", "cli", "resume", "--from", "US-03"]);
    expect(result).toEqual({ command: "resume", from: "US-03", skipFailed: false, silent: false });
  });

  it("parses resume with --skip-failed", () => {
    const result = parseArgs(["node", "cli", "resume", "--skip-failed"]);
    expect(result).toEqual({ command: "resume", from: undefined, skipFailed: true, silent: false });
  });

  it("parses resume with both --from and --skip-failed", () => {
    const result = parseArgs(["node", "cli", "resume", "--from", "US-02", "--skip-failed"]);
    expect(result).toEqual({ command: "resume", from: "US-02", skipFailed: true, silent: false });
  });

  it("parses resume with no flags", () => {
    const result = parseArgs(["node", "cli", "resume"]);
    expect(result).toEqual({ command: "resume", from: undefined, skipFailed: false, silent: false });
  });
});

describe("Story error fields", () => {
  const tmpDir = join(tmpdir(), `hive-test-${Date.now()}`);
  const planPath = join(tmpDir, "plan.json");

  const basePlan: ExecutionPlan = {
    schemaVersion: "2.0.0",
    prdPath: "/prd.md",
    specPath: "/spec.md",
    stories: [
      {
        id: "US-01",
        title: "Story 1",
        specSections: [],
        dependencies: [],
        sourceFiles: [],
        complexity: "low",
        rolesUsed: [],
        stepFile: "steps/US-01.md",
        status: "failed",
        attempts: 3,
        maxAttempts: 3,
        committed: false,
        commitHash: null,
        errorMessage: "Verification failed after max attempts",
        lastFailedStage: "verify",
      },
      {
        id: "US-02",
        title: "Story 2",
        specSections: [],
        dependencies: [],
        sourceFiles: [],
        complexity: "low",
        rolesUsed: [],
        stepFile: "steps/US-02.md",
        status: "not-started",
        attempts: 0,
        maxAttempts: 3,
        committed: false,
        commitHash: null,
      },
    ],
  };

  it("errorMessage survives save/load roundtrip", () => {
    mkdirSync(tmpDir, { recursive: true });
    saveExecutionPlan(planPath, basePlan);
    const loaded = loadExecutionPlan(planPath);
    const story = loaded.stories.find((s) => s.id === "US-01")!;
    expect(story.errorMessage).toBe("Verification failed after max attempts");
    expect(story.lastFailedStage).toBe("verify");
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("StoryStatus skipped handling", () => {
  const makePlan = (): ExecutionPlan => ({
    schemaVersion: "2.0.0",
    prdPath: "/prd.md",
    specPath: "/spec.md",
    stories: [
      {
        id: "US-01", title: "S1", specSections: [], dependencies: [],
        sourceFiles: [], complexity: "low", rolesUsed: [],
        stepFile: "s.md", status: "not-started", attempts: 0,
        maxAttempts: 3, committed: false, commitHash: null,
      },
      {
        id: "US-02", title: "S2", specSections: [], dependencies: [],
        sourceFiles: [], complexity: "low", rolesUsed: [],
        stepFile: "s.md", status: "not-started", attempts: 0,
        maxAttempts: 3, committed: false, commitHash: null,
      },
      {
        id: "US-03", title: "S3", specSections: [], dependencies: [],
        sourceFiles: [], complexity: "low", rolesUsed: [],
        stepFile: "s.md", status: "failed", attempts: 3,
        maxAttempts: 3, committed: false, commitHash: null,
      },
    ],
  });

  it("--from skips stories before target", () => {
    let plan = makePlan();
    plan = updateStoryStatus(plan, "US-01", "skipped");
    expect(plan.stories[0].status).toBe("skipped");
    // US-02 should be next
    expect(getNextStory(plan)?.id).toBe("US-02");
  });

  it("--skip-failed marks failed as skipped", () => {
    let plan = makePlan();
    plan = updateStoryStatus(plan, "US-03", "skipped");
    expect(plan.stories[2].status).toBe("skipped");
  });

  it("getNextStory skips skipped stories", () => {
    let plan = makePlan();
    plan = updateStoryStatus(plan, "US-01", "skipped");
    plan = updateStoryStatus(plan, "US-02", "skipped");
    // US-03 is "failed", not "not-started" or "in-progress"
    expect(getNextStory(plan)).toBeUndefined();
  });
});
