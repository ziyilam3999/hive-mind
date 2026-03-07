import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("orchestrator checkpoint write", () => {
  it("runPipeline writes approve-spec checkpoint", async () => {
    const { runPipeline } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const testDir = join(process.cwd(), ".test-orch-cp-write");
    mkdirSync(testDir, { recursive: true });
    const prdPath = join(testDir, "PRD.md");
    writeFileSync(prdPath, "# Test PRD");
    const hmDir = join(testDir, ".hive-mind");

    await runPipeline(prdPath, hmDir);

    const cpPath = join(hmDir, ".checkpoint");
    expect(existsSync(cpPath)).toBe(true);
    const cp = JSON.parse(readFileSync(cpPath, "utf-8"));
    expect(cp.awaiting).toBe("approve-spec");

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true });
  });

  it("resumeFromCheckpoint at approve-spec writes approve-plan", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const testDir = join(process.cwd(), ".test-orch-cp-plan");
    mkdirSync(testDir, { recursive: true });

    await resumeFromCheckpoint(
      { awaiting: "approve-spec", message: "test", timestamp: "2026-03-06T00:00:00Z", feedback: null },
      testDir,
    );

    const cpPath = join(testDir, ".checkpoint");
    expect(existsSync(cpPath)).toBe(true);
    const cp = JSON.parse(readFileSync(cpPath, "utf-8"));
    expect(cp.awaiting).toBe("approve-plan");

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true });
  });
});
