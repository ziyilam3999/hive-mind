import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Mock the agent spawner to avoid calling real claude CLI
vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string }) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname } = await import("node:path");
    md(dirname(config.outputFile), { recursive: true });
    wf(config.outputFile, `# Mock output for ${config.type}`);
    return { success: true, outputFile: config.outputFile };
  }),
  spawnAgent: vi.fn(async () => ({ success: true, outputFile: "" })),
}));

// Mock shell for tooling detection
vi.mock("../../utils/shell.js", () => ({
  runShell: vi.fn(async () => ({ exitCode: 0, stdout: "v1.0.0\n", stderr: "" })),
}));

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
    rmSync(testDir, { recursive: true, force: true });
  });

  it("resumeFromCheckpoint at approve-spec writes approve-plan", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const testDir = join(process.cwd(), ".test-orch-cp-plan");
    mkdirSync(testDir, { recursive: true });
    // Create the SPEC file that plan-stage needs
    mkdirSync(join(testDir, "spec"), { recursive: true });
    writeFileSync(join(testDir, "spec", "SPEC-v1.0.md"), "# SPEC\n## Requirements\nBuild something");

    await resumeFromCheckpoint(
      { awaiting: "approve-spec", message: "test", timestamp: "2026-03-06T00:00:00Z", feedback: null },
      testDir,
    );

    const cpPath = join(testDir, ".checkpoint");
    expect(existsSync(cpPath)).toBe(true);
    const cp = JSON.parse(readFileSync(cpPath, "utf-8"));
    expect(cp.awaiting).toBe("approve-plan");

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });
});
