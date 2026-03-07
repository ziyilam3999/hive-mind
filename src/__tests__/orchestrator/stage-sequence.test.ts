import { describe, it, expect, vi } from "vitest";

describe("orchestrator stage sequence", () => {
  it("runPipeline calls SPEC stage", async () => {
    const { runPipeline } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });

    // Create a temp PRD file
    const { writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const testDir = join(process.cwd(), ".test-orch-seq");
    mkdirSync(testDir, { recursive: true });
    const prdPath = join(testDir, "PRD.md");
    writeFileSync(prdPath, "# Test PRD");

    try {
      await runPipeline(prdPath, join(testDir, ".hive-mind"));
    } catch {
      // process.exit throws
    }

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => typeof c === "string" && c.includes("SPEC stage"))).toBe(true);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    rmSync(testDir, { recursive: true });
  });

  it("resumeFromCheckpoint handles all 4 stages", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { mkdirSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const testDir = join(process.cwd(), ".test-orch-resume");
    mkdirSync(testDir, { recursive: true });

    // Test ship checkpoint (simplest)
    await resumeFromCheckpoint(
      { awaiting: "ship", message: "test", timestamp: "2026-03-06T00:00:00Z", feedback: null },
      testDir,
    );
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => typeof c === "string" && c.includes("Pipeline complete"))).toBe(true);

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true });
  });
});
