import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";
import type { Checkpoint } from "../../types/checkpoint.js";

// Mock the agent spawner — plan-stage agents will throw to simulate crash
vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string }) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname } = await import("node:path");
    md(dirname(config.outputFile), { recursive: true });
    wf(config.outputFile, `# Mock output for ${config.type}`);
    return { success: true, outputFile: config.outputFile, costUsd: 0, durationMs: 100 };
  }),
  spawnAgent: vi.fn(async () => ({ success: true, outputFile: "" })),
  spawnAgentsParallel: vi.fn(async (configs: Array<{ outputFile: string; type: string }>) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname } = await import("node:path");
    return configs.map((c) => {
      md(dirname(c.outputFile), { recursive: true });
      wf(c.outputFile, `# Mock output for ${c.type}`);
      return { success: true, outputFile: c.outputFile, costUsd: 0, durationMs: 100 };
    });
  }),
}));

// Mock baseline check
vi.mock("../../stages/baseline-check.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../stages/baseline-check.js")>();
  return {
    ...original,
    runBaselineCheck: vi.fn(async () => ({ passed: true, buildOutput: "", testOutput: "" })),
  };
});

// Mock plan stage to throw (simulates API limit crash)
vi.mock("../../stages/plan-stage.js", () => ({
  runPlanStage: vi.fn(async () => {
    throw new Error("Planner failed: API usage limit reached");
  }),
}));

const config = getDefaultConfig();

function makeTestDir(name: string): { testDir: string; dirs: PipelineDirs; cleanup: () => void } {
  const testDir = join(process.cwd(), `.test-crash-recovery-${name}`);
  mkdirSync(testDir, { recursive: true });
  const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };
  return { testDir, dirs, cleanup: () => rmSync(testDir, { recursive: true, force: true }) };
}

function writeManagerLog(dir: string): void {
  writeFileSync(
    join(dir, "manager-log.jsonl"),
    JSON.stringify({
      timestamp: "2026-03-30T00:00:00Z",
      cycle: 0,
      storyId: null,
      action: "PIPELINE_START",
      reason: null,
      prdPath: "./PRD.md",
      stopAfterPlan: false,
    }) + "\n",
  );
}

describe("crash recovery checkpoints", () => {
  it("recovery checkpoint survives when PLAN crashes after approve-spec", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { testDir, dirs, cleanup } = makeTestDir("spec-crash");
    try {
      // Set up: SPEC was approved, artifacts exist
      writeFileSync(join(testDir, ".checkpoint"), JSON.stringify({ awaiting: "approve-spec" }));
      writeManagerLog(testDir);
      mkdirSync(join(testDir, "spec"), { recursive: true });
      writeFileSync(join(testDir, "spec", "SPEC-v1.0.md"), "# Test SPEC");

      const checkpoint: Checkpoint = {
        awaiting: "approve-spec",
        message: "test",
        timestamp: "2026-03-30T00:00:00Z",
        feedback: null,
      };

      // PLAN stage will throw (mocked)
      await expect(resumeFromCheckpoint(checkpoint, dirs, config)).rejects.toThrow();

      // Recovery checkpoint should survive
      expect(existsSync(join(testDir, ".checkpoint"))).toBe(true);
      const recovered = JSON.parse(readFileSync(join(testDir, ".checkpoint"), "utf-8"));
      expect(recovered.awaiting).toBe("approve-spec");
      expect(recovered.message).toContain("recovery checkpoint");
    } finally {
      consoleSpy.mockRestore();
      cleanup();
    }
  });

  it("recovery checkpoint written for approve-normalize before SPEC runs", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { testDir, dirs, cleanup } = makeTestDir("normalize-recovery");
    try {
      writeFileSync(join(testDir, ".checkpoint"), JSON.stringify({ awaiting: "approve-normalize" }));
      writeManagerLog(testDir);
      mkdirSync(join(testDir, "normalize"), { recursive: true });
      writeFileSync(join(testDir, "normalize", "normalized-prd.md"), "# Normalized PRD\n\nContent here.");

      const checkpoint: Checkpoint = {
        awaiting: "approve-normalize",
        message: "test",
        timestamp: "2026-03-30T00:00:00Z",
        feedback: null,
      };

      // SPEC stage will run and complete (mocked agents produce output).
      // After SPEC completes, writeCheckpoint(approve-spec) overwrites recovery.
      await resumeFromCheckpoint(checkpoint, dirs, config);

      // Final checkpoint should be approve-spec (recovery was overwritten by SPEC completion)
      expect(existsSync(join(testDir, ".checkpoint"))).toBe(true);
      const final = JSON.parse(readFileSync(join(testDir, ".checkpoint"), "utf-8"));
      expect(final.awaiting).toBe("approve-spec");
    } finally {
      consoleSpy.mockRestore();
      cleanup();
    }
  });
});

describe("approve-plan baseline failure", () => {
  it("recovery checkpoint survives when baseline check fails after approve", async () => {
    const { resumeFromCheckpoint } = await import("../../orchestrator.js");
    const { runBaselineCheck } = await import("../../stages/baseline-check.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { testDir, dirs, cleanup } = makeTestDir("baseline-fail");
    try {
      writeManagerLog(testDir);
      mkdirSync(join(testDir, "plans"), { recursive: true });
      writeFileSync(join(testDir, "plans", "execution-plan.json"), JSON.stringify({ stories: [] }));

      // Make baseline throw (simulates test/build failure)
      vi.mocked(runBaselineCheck).mockRejectedValueOnce(new Error("npm test failed — baseline broken"));

      const checkpoint: Checkpoint = {
        awaiting: "approve-plan",
        message: "test",
        timestamp: "2026-03-30T00:00:00Z",
        feedback: null,
      };

      // Should throw because baseline fails
      await expect(resumeFromCheckpoint(checkpoint, dirs, config)).rejects.toThrow("npm test failed");

      // Recovery checkpoint must exist so user can retry
      expect(existsSync(join(testDir, ".checkpoint"))).toBe(true);
      const recovered = JSON.parse(readFileSync(join(testDir, ".checkpoint"), "utf-8"));
      expect(recovered.awaiting).toBe("approve-plan");
      expect(recovered.message).toContain("recovery checkpoint");
    } finally {
      consoleSpy.mockRestore();
      cleanup();
    }
  });
});

describe("start command checkpoint guard", () => {
  it("start throws when checkpoint exists and --force not set", async () => {
    const { runPipeline } = await import("../../orchestrator.js");

    const { testDir, dirs, cleanup } = makeTestDir("start-guard");
    try {
      mkdirSync(join(testDir, "spec"), { recursive: true });
      writeFileSync(join(testDir, "spec", "SPEC-v1.0.md"), "# spec");
      writeFileSync(join(testDir, ".checkpoint"), JSON.stringify({ awaiting: "approve-spec" }));

      const prdPath = join(testDir, "PRD.md");
      writeFileSync(prdPath, "# Test PRD");

      await expect(runPipeline(prdPath, dirs, config)).rejects.toThrow(/Active checkpoint found/);
    } finally {
      cleanup();
    }
  });

  it("start proceeds when checkpoint exists and --force is set", async () => {
    const { runPipeline } = await import("../../orchestrator.js");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // PRD must live OUTSIDE working dir so cleanup doesn't delete it
    const testDir = join(process.cwd(), ".test-crash-recovery-start-force");
    mkdirSync(testDir, { recursive: true });
    const hmDir = join(testDir, ".hive-mind");
    mkdirSync(hmDir, { recursive: true });
    const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };

    try {
      mkdirSync(join(hmDir, "spec"), { recursive: true });
      writeFileSync(join(hmDir, "spec", "SPEC-v1.0.md"), "# spec");
      writeFileSync(join(hmDir, ".checkpoint"), JSON.stringify({ awaiting: "approve-spec" }));

      const prdPath = join(testDir, "PRD.md");
      writeFileSync(prdPath, "# Test PRD\n\n## Overview\nThis is a test PRD with enough content.\n\n## Goals\n- Goal 1\n- Goal 2\n");

      // Should not throw — force overrides the guard
      // (will proceed to SPEC and eventually write a new checkpoint)
      await expect(runPipeline(prdPath, dirs, config, { skipNormalize: true, force: true })).resolves.not.toThrow();
    } finally {
      consoleSpy.mockRestore();
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
