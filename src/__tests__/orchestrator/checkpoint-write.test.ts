import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

// Mock the agent spawner to avoid calling real claude CLI
const mockPlanJson = JSON.stringify({
  schemaVersion: "2.0.0",
  prdPath: "PRD.md",
  specPath: "spec/SPEC-v1.0.md",
  stories: [
    {
      id: "US-01", title: "Test", specSections: ["§1.1"], dependencies: [],
      sourceFiles: ["src/test.ts"], complexity: "low", rolesUsed: ["analyst"],
      stepFile: "plans/steps/US-01.md", status: "not-started",
      attempts: 0, maxAttempts: 3, committed: false, commitHash: null,
    },
  ],
});

const mockSpawnImpl = async (config: { outputFile: string; type: string }) => {
  const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
  const { dirname } = await import("node:path");
  md(dirname(config.outputFile), { recursive: true });
  if (config.type === "planner") {
    wf(config.outputFile, mockPlanJson);
  } else {
    wf(config.outputFile, `# Mock output for ${config.type}`);
  }
  return { success: true, outputFile: config.outputFile };
};

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(mockSpawnImpl),
  spawnAgent: vi.fn(async () => ({ success: true, outputFile: "" })),
  spawnAgentsParallel: vi.fn(async (configs: Array<{ outputFile: string; type: string }>) => {
    return Promise.all(configs.map(mockSpawnImpl));
  }),
}));

// Mock shell for tooling detection
vi.mock("../../utils/shell.js", () => ({
  runShell: vi.fn(async () => ({ exitCode: 0, stdout: "v1.0.0\n", stderr: "" })),
}));

const config = getDefaultConfig();

describe("orchestrator checkpoint write", () => {
  it("runPipeline writes approve-spec checkpoint", async () => {
    const { runPipeline } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const testDir = join(process.cwd(), ".test-orch-cp-write");
    mkdirSync(testDir, { recursive: true });
    const prdPath = join(testDir, "PRD.md");
    writeFileSync(prdPath, "# Test PRD");
    const hmDir = join(testDir, ".hive-mind");
    const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };

    await runPipeline(prdPath, dirs, config, { skipNormalize: true });

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
    // getPipelineStartData now reads manager-log.jsonl
    writeFileSync(join(testDir, "manager-log.jsonl"), JSON.stringify({ timestamp: "2026-03-06T00:00:00Z", cycle: 0, storyId: null, action: "PIPELINE_START", reason: null, prdPath: "./PRD.md", stopAfterPlan: false }) + "\n");
    const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };

    await resumeFromCheckpoint(
      { awaiting: "approve-spec", message: "test", timestamp: "2026-03-06T00:00:00Z", feedback: null },
      dirs,
      config,
    );

    const cpPath = join(testDir, ".checkpoint");
    expect(existsSync(cpPath)).toBe(true);
    const cp = JSON.parse(readFileSync(cpPath, "utf-8"));
    expect(cp.awaiting).toBe("approve-plan");

    consoleSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });
});
