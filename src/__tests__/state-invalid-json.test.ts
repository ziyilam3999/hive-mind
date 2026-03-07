import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadExecutionPlan } from "../state/execution-plan.js";

describe("state manager invalid JSON", () => {
  const testDir = join(process.cwd(), ".test-state-invalid");

  it("throws on invalid JSON", () => {
    mkdirSync(testDir, { recursive: true });
    const planPath = join(testDir, "plan.json");
    writeFileSync(planPath, "not valid json{{{");
    expect(() => loadExecutionPlan(planPath)).toThrow("corrupted");
    rmSync(testDir, { recursive: true });
  });

  it("throws on missing file", () => {
    expect(() => loadExecutionPlan("/nonexistent/plan.json")).toThrow("not found");
  });
});
