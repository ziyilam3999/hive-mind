import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("orchestrator checkpoint exit", () => {
  it("runPipeline writes checkpoint and does not continue to PLAN", async () => {
    const { runPipeline } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const testDir = join(process.cwd(), ".test-orch-cp-exit");
    mkdirSync(testDir, { recursive: true });
    const prdPath = join(testDir, "PRD.md");
    writeFileSync(prdPath, "# Test PRD");
    const hmDir = join(testDir, ".hive-mind");

    await runPipeline(prdPath, hmDir);

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    // Should have SPEC but NOT PLAN
    expect(calls.some((c) => typeof c === "string" && c.includes("SPEC stage"))).toBe(true);
    expect(calls.some((c) => typeof c === "string" && c.includes("Running PLAN stage"))).toBe(false);

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true });
  });

  it("ship checkpoint cleans up and prints pipeline complete", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const testDir = join(process.cwd(), ".test-orch-ship");
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, ".checkpoint"), '{"awaiting":"ship"}');

    await resumeFromCheckpoint(
      { awaiting: "ship", message: "test", timestamp: "2026-03-06T00:00:00Z", feedback: null },
      testDir,
    );

    expect(existsSync(join(testDir, ".checkpoint"))).toBe(false);
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => typeof c === "string" && c.includes("Pipeline complete"))).toBe(true);

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true });
  });
});
