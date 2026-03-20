import { describe, it, expect, vi, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

function mockOutput(type: string): string {
  if (type === "planner") {
    return JSON.stringify({
      schemaVersion: "2.0.0",
      prdPath: "PRD.md",
      specPath: "spec/SPEC-v1.0.md",
      stories: [{
        id: "US-01", title: "Setup", specSections: ["§1"], dependencies: [],
        sourceFiles: [{ path: "package.json", changeType: "ADDED" }],
        complexity: "low", rolesUsed: ["analyst"], stepFile: "plans/steps/US-01.md",
        status: "not-started", attempts: 0, maxAttempts: 3, committed: false, commitHash: null,
      }],
    });
  }
  return `# Mock output for ${type}`;
}

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string }) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname } = await import("node:path");
    md(dirname(config.outputFile), { recursive: true });
    wf(config.outputFile, mockOutput(config.type));
    return { success: true, outputFile: config.outputFile };
  }),
  spawnAgentsParallel: vi.fn(async (configs: Array<{ outputFile: string; type: string }>) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname } = await import("node:path");
    return configs.map((c) => {
      md(dirname(c.outputFile), { recursive: true });
      wf(c.outputFile, mockOutput(c.type));
      return { success: true, outputFile: c.outputFile };
    });
  }),
}));

vi.mock("../../utils/shell.js", () => ({
  runShell: vi.fn(async () => ({ exitCode: 0, stdout: "v1.0.0\n", stderr: "" })),
}));

vi.mock("../../utils/notify.js", () => ({
  notifyCheckpoint: vi.fn(),
}));

const config = getDefaultConfig();

describe("spec rejection loop (REQ-08)", () => {
  const testDir = join(process.cwd(), ".test-spec-rejection");
  const hmDir = join(testDir, ".hive-mind");
  const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };

  function setupWithSpecArtifacts() {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(join(hmDir, "spec"), { recursive: true });

    // Write PIPELINE_START log entry
    const logEntry = JSON.stringify({
      timestamp: "2026-03-20T00:00:00Z",
      cycle: 0,
      storyId: null,
      action: "PIPELINE_START",
      reason: null,
      prdPath: join(testDir, "PRD.md"),
      stopAfterPlan: false,
      greenfield: false,
    });
    writeFileSync(join(hmDir, "manager-log.jsonl"), logEntry + "\n");

    // Write the PRD
    writeFileSync(join(testDir, "PRD.md"), "# Test PRD\n## Requirements\n- Build something");

    // Write pre-existing spec artifacts (from prior full run)
    writeFileSync(join(hmDir, "spec", "project-listing.txt"), "src/index.ts  -- export function main()");
    writeFileSync(join(hmDir, "spec", "relevance-map.md"), "# Relevance Map");
    writeFileSync(join(hmDir, "spec", "research-report.md"), "# Research Report");
    writeFileSync(join(hmDir, "spec", "spec-existing.md"), "# Existing Spec");
  }

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("rejection at approve-spec re-runs specStage with fromStep=drafter", async () => {
    setupWithSpecArtifacts();
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const { spawnAgentWithRetry } = await import("../../agents/spawner.js");
    vi.mocked(spawnAgentWithRetry).mockClear();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await resumeFromCheckpoint(
      { awaiting: "approve-spec", message: "test", timestamp: "2026-03-20T00:00:00Z", feedback: "Fix the API section" },
      dirs,
      config,
    );

    consoleSpy.mockRestore();

    // Should have spawned agents for the drafter-onward pipeline (no scanner/researcher/analyzer)
    const types = vi.mocked(spawnAgentWithRetry).mock.calls.map((c) => c[0].type);
    expect(types).toContain("feature-spec-drafter");
    expect(types).toContain("reconciler");
    expect(types).not.toContain("relevance-scanner");
    expect(types).not.toContain("researcher");
  });

  it("after rejection re-run, checkpoint is approve-spec again", async () => {
    setupWithSpecArtifacts();
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await resumeFromCheckpoint(
      { awaiting: "approve-spec", message: "test", timestamp: "2026-03-20T00:00:00Z", feedback: "Fix the API section" },
      dirs,
      config,
    );

    consoleSpy.mockRestore();

    // Should have written a new approve-spec checkpoint
    const cpPath = join(hmDir, ".checkpoint");
    expect(existsSync(cpPath)).toBe(true);
    const cp = JSON.parse(readFileSync(cpPath, "utf-8"));
    expect(cp.awaiting).toBe("approve-spec");
  });

  it("rejection injects feedback into drafter memoryContent", async () => {
    setupWithSpecArtifacts();
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const { spawnAgentWithRetry } = await import("../../agents/spawner.js");
    vi.mocked(spawnAgentWithRetry).mockClear();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await resumeFromCheckpoint(
      { awaiting: "approve-spec", message: "test", timestamp: "2026-03-20T00:00:00Z", feedback: "Fix the API section" },
      dirs,
      config,
    );

    consoleSpy.mockRestore();

    const drafterCall = vi.mocked(spawnAgentWithRetry).mock.calls.find((c) => c[0].type === "feature-spec-drafter");
    expect(drafterCall).toBeDefined();
    expect(drafterCall![0].memoryContent).toContain("## HUMAN FEEDBACK");
    expect(drafterCall![0].memoryContent).toContain("Fix the API section");
  });

  it("approve (no feedback) proceeds to plan stage", async () => {
    setupWithSpecArtifacts();
    // Write SPEC-v1.0.md so plan stage can proceed
    writeFileSync(join(hmDir, "spec", "SPEC-v1.0.md"), "# SPEC v1.0");

    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const { spawnAgentWithRetry } = await import("../../agents/spawner.js");
    vi.mocked(spawnAgentWithRetry).mockClear();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await resumeFromCheckpoint(
      { awaiting: "approve-spec", message: "test", timestamp: "2026-03-20T00:00:00Z", feedback: null },
      dirs,
      config,
    );

    consoleSpy.mockRestore();

    // Should have spawned plan-stage agents (planner, etc.), NOT spec agents
    const types = vi.mocked(spawnAgentWithRetry).mock.calls.map((c) => c[0].type);
    expect(types).not.toContain("feature-spec-drafter");
    expect(types).not.toContain("relevance-scanner");
    // Planner would be spawned by plan stage
    expect(types).toContain("planner");
  });
});
