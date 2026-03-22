import { describe, it, expect, vi } from "vitest";

// Mock spawner before imports
vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string }) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });
    writeFileSync(config.outputFile, `# Mock output for ${config.type}`);
    return { success: true, outputFile: config.outputFile };
  }),
  spawnAgentsParallel: vi.fn(async (configs: Array<{ outputFile: string; type: string }>) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    return configs.map((c) => {
      mkdirSync(dirname(c.outputFile), { recursive: true });
      writeFileSync(c.outputFile, `# Mock output for ${c.type}`);
      return { success: true, outputFile: c.outputFile };
    });
  }),
}));

import { runSpecStage, SPEC_STEPS, getSpecSteps } from "../../stages/spec-stage.js";
import { spawnAgentWithRetry, spawnAgentsParallel } from "../../agents/spawner.js";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

const config = getDefaultConfig();

describe("spec-stage", () => {
  const testDir = join(process.cwd(), ".test-spec-stage");
  const hmDir = join(testDir, ".hive-mind");
  const prdPath = join(testDir, "PRD.md");
  const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };

  function setup() {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(prdPath, "# Test PRD\n## Requirements\n- Build something");
    vi.mocked(spawnAgentWithRetry).mockClear();
    vi.mocked(spawnAgentsParallel).mockClear();
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("non-greenfield: 9 agents spawned (1 sequential + 2 parallel + 6 sequential)", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      // S.0 (scanner) + S.3 (feature-drafter) + S.4 (reconciler) + S.5-S.8 (critique pipeline) = 7 sequential
      const sequentialCount = vi.mocked(spawnAgentWithRetry).mock.calls.length;
      // S.1 + S.2 run in parallel
      const parallelCalls = vi.mocked(spawnAgentsParallel).mock.calls;

      expect(parallelCalls.length).toBe(1); // one parallel batch
      expect(parallelCalls[0][0].length).toBe(2); // researcher + codebase-analyzer

      // 7 sequential + 2 parallel = 9 total agents
      expect(sequentialCount + 2).toBe(9);
    } finally {
      cleanup();
    }
  });

  it("non-greenfield: produces all expected output files", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      for (const step of SPEC_STEPS) {
        expect(existsSync(join(hmDir, "spec", step))).toBe(true);
      }
      // project-listing.txt is written by calling code, not an agent
      expect(existsSync(join(hmDir, "spec", "project-listing.txt"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("greenfield: 6 agents spawned (no scanner/analyzer/reconciler)", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config, undefined, true);
      consoleSpy.mockRestore();

      // Greenfield: no parallel calls
      expect(vi.mocked(spawnAgentsParallel).mock.calls.length).toBe(0);

      // 6 sequential: researcher + feature-drafter + 4 critique pipeline
      expect(vi.mocked(spawnAgentWithRetry).mock.calls.length).toBe(6);

      // No scanner, analyzer, or reconciler
      const types = vi.mocked(spawnAgentWithRetry).mock.calls.map((c) => c[0].type);
      expect(types).not.toContain("relevance-scanner");
      expect(types).not.toContain("codebase-analyzer");
      expect(types).not.toContain("reconciler");
    } finally {
      cleanup();
    }
  });

  it("greenfield: copies spec-new-features.md to SPEC-draft.md", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config, undefined, true);
      consoleSpy.mockRestore();

      expect(existsSync(join(hmDir, "spec", "spec-new-features.md"))).toBe(true);
      expect(existsSync(join(hmDir, "spec", "SPEC-draft.md"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("S.1 and S.2 run in parallel (spawnAgentsParallel called)", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      const parallelCalls = vi.mocked(spawnAgentsParallel).mock.calls;
      expect(parallelCalls.length).toBe(1);

      const parallelTypes = parallelCalls[0][0].map((c: { type: string }) => c.type);
      expect(parallelTypes).toContain("researcher");
      expect(parallelTypes).toContain("codebase-analyzer");
    } finally {
      cleanup();
    }
  });

  it("feature-spec-drafter receives NO codebase files", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const drafterCall = calls.find((c) => c[0].type === "feature-spec-drafter");
      expect(drafterCall).toBeDefined();

      const inputFiles = drafterCall![0].inputFiles;
      // Should only have research-report.md and PRD — NO codebase files
      for (const f of inputFiles) {
        expect(f).not.toContain("spec-existing");
        expect(f).not.toContain("relevance-map");
        expect(f).not.toContain("project-listing");
      }
    } finally {
      cleanup();
    }
  });

  it("reconciler receives spec-existing + spec-new-features", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const reconcilerCall = calls.find((c) => c[0].type === "reconciler");
      expect(reconcilerCall).toBeDefined();

      const inputFiles = reconcilerCall![0].inputFiles;
      expect(inputFiles.some((f: string) => f.includes("spec-existing.md"))).toBe(true);
      expect(inputFiles.some((f: string) => f.includes("spec-new-features.md"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("fromStep=drafter reuses existing artifacts, runs fewer agents", async () => {
    setup();
    try {
      // Pre-create the artifacts that would exist from a prior run
      mkdirSync(join(hmDir, "spec"), { recursive: true });
      writeFileSync(join(hmDir, "spec", "research-report.md"), "# Prior research");
      writeFileSync(join(hmDir, "spec", "spec-existing.md"), "# Prior analysis");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config, "fix the API section", false, undefined, "drafter");
      consoleSpy.mockRestore();

      // Should NOT call scanner, researcher, or analyzer
      const seqTypes = vi.mocked(spawnAgentWithRetry).mock.calls.map((c) => c[0].type);
      expect(seqTypes).not.toContain("relevance-scanner");
      expect(seqTypes).not.toContain("researcher");
      expect(seqTypes).not.toContain("codebase-analyzer");

      // Should NOT call parallel batch
      expect(vi.mocked(spawnAgentsParallel).mock.calls.length).toBe(0);

      // Should run: feature-drafter + reconciler + 4 critique = 6 sequential
      expect(seqTypes.length).toBe(6);
      expect(seqTypes).toContain("feature-spec-drafter");
      expect(seqTypes).toContain("reconciler");
    } finally {
      cleanup();
    }
  });

  it("critic isolation: critics only receive their target artifact", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const criticCalls = calls.filter((c) => c[0].type === "critic");

      expect(criticCalls.length).toBe(2);

      // Critic round 1 should only receive SPEC-draft.md
      const critic1Input = criticCalls[0][0].inputFiles;
      expect(critic1Input.length).toBe(1);
      expect(critic1Input[0]).toContain("SPEC-draft.md");

      // Critic round 2 should only receive SPEC-v0.2.md
      const critic2Input = criticCalls[1][0].inputFiles;
      expect(critic2Input.length).toBe(1);
      expect(critic2Input[0]).toContain("SPEC-v0.2.md");
    } finally {
      cleanup();
    }
  });

  it("critic agents are separate subagent spawns", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const criticCalls = calls.filter((c) => c[0].type === "critic");

      expect(criticCalls.length).toBe(2);
      expect(criticCalls[0][0].outputFile).not.toBe(criticCalls[1][0].outputFile);
    } finally {
      cleanup();
    }
  });

  it("empty critique handled gracefully", async () => {
    setup();
    try {
      vi.mocked(spawnAgentWithRetry).mockImplementation(async (config) => {
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });

        if (config.type === "critic") {
          return { success: false, outputFile: config.outputFile, error: "Empty critique" };
        }

        wf(config.outputFile, `# Mock output for ${config.type}`);
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await runSpecStage(prdPath, dirs, config);

      expect(warnSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    } finally {
      cleanup();
    }
  });

  it("feedback injects HUMAN FEEDBACK into drafter memoryContent", async () => {
    setup();
    try {
      mkdirSync(join(hmDir, "spec"), { recursive: true });
      writeFileSync(join(hmDir, "spec", "research-report.md"), "# Prior research");
      writeFileSync(join(hmDir, "spec", "spec-existing.md"), "# Prior analysis");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config, "fix the API section", false, undefined, "drafter");
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const drafterCall = calls.find((c) => c[0].type === "feature-spec-drafter");
      expect(drafterCall).toBeDefined();
      expect(drafterCall![0].memoryContent).toContain("## HUMAN FEEDBACK");
      expect(drafterCall![0].memoryContent).toContain("fix the API section");
    } finally {
      cleanup();
    }
  });

  it("multi-module rule injected when PRD has ## Modules", async () => {
    setup();
    writeFileSync(prdPath, "# Test PRD\n## Modules\n- Module A\n- Module B");
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const drafterCall = calls.find((c) => c[0].type === "feature-spec-drafter");
      expect(drafterCall).toBeDefined();
      expect(drafterCall![0].rules.some((r: string) => r.includes("MULTI-MODULE"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("greenfield fromStep=drafter skips researcher, runs 5 agents", async () => {
    setup();
    try {
      mkdirSync(join(hmDir, "spec"), { recursive: true });
      writeFileSync(join(hmDir, "spec", "research-report.md"), "# Prior research");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config, "tweak it", true, undefined, "drafter");
      consoleSpy.mockRestore();

      // No parallel calls in greenfield
      expect(vi.mocked(spawnAgentsParallel).mock.calls.length).toBe(0);

      // 5 sequential: feature-drafter + 4 critique pipeline (no researcher)
      const seqTypes = vi.mocked(spawnAgentWithRetry).mock.calls.map((c) => c[0].type);
      expect(seqTypes.length).toBe(5);
      expect(seqTypes).not.toContain("researcher");
      expect(seqTypes).toContain("feature-spec-drafter");
    } finally {
      cleanup();
    }
  });

  it("parallel agent failure throws clear error", async () => {
    setup();
    try {
      vi.mocked(spawnAgentsParallel).mockResolvedValueOnce([
        { success: true, outputFile: join(hmDir, "spec", "research-report.md") },
        { success: false, outputFile: join(hmDir, "spec", "spec-existing.md"), error: "boom" },
      ]);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await expect(
        runSpecStage(prdPath, dirs, config),
      ).rejects.toThrow(/codebase-analyzer.*boom|boom/);

      consoleSpy.mockRestore();
    } finally {
      cleanup();
    }
  });

  it("project-listing.txt written before scanner spawn", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      expect(existsSync(join(hmDir, "spec", "project-listing.txt"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("critic rules include EVIDENCE-GATED", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const criticCalls = calls.filter((c) => c[0].type === "critic");
      expect(criticCalls.length).toBe(2);

      // Both critics should have EVIDENCE-GATED rule
      for (const call of criticCalls) {
        expect(call[0].rules.some((r: string) => r.includes("EVIDENCE-GATED"))).toBe(true);
      }
    } finally {
      cleanup();
    }
  });

  it("spec-corrector rules include EVIDENCE-GATED", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const correctorCalls = calls.filter((c) => c[0].type === "spec-corrector");
      expect(correctorCalls.length).toBe(2);

      for (const call of correctorCalls) {
        expect(call[0].rules.some((r: string) => r.includes("EVIDENCE-GATED"))).toBe(true);
      }
    } finally {
      cleanup();
    }
  });

  it("round-2 critic has REGRESSION-CHECK, round-1 does not", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const criticCalls = calls.filter((c) => c[0].type === "critic");
      expect(criticCalls.length).toBe(2);

      // Round 1 should NOT have REGRESSION-CHECK
      expect(criticCalls[0][0].rules.some((r: string) => r.includes("REGRESSION-CHECK"))).toBe(false);

      // Round 2 should have REGRESSION-CHECK
      expect(criticCalls[1][0].rules.some((r: string) => r.includes("REGRESSION-CHECK"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("critique-log.md is produced after pipeline completes", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, dirs, config);
      consoleSpy.mockRestore();

      expect(existsSync(join(hmDir, "spec", "critique-log.md"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("getSpecSteps returns correct arrays", () => {
    const fullSteps = getSpecSteps(false);
    expect(fullSteps.length).toBe(9);
    expect(fullSteps).toContain("relevance-map.md");
    expect(fullSteps).toContain("spec-existing.md");

    const greenfieldSteps = getSpecSteps(true);
    expect(greenfieldSteps.length).toBe(6);
    expect(greenfieldSteps).not.toContain("relevance-map.md");
    expect(greenfieldSteps).not.toContain("spec-existing.md");
  });
});
