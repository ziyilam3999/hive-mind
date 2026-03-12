import { describe, it, expect, vi } from "vitest";

// Mock spawner before imports
vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string }) => {
    // Write a mock output file
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });
    writeFileSync(config.outputFile, `# Mock output for ${config.type}`);
    return { success: true, outputFile: config.outputFile };
  }),
}));

import { runSpecStage, SPEC_STEPS } from "../../stages/spec-stage.js";
import { spawnAgentWithRetry } from "../../agents/spawner.js";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";

const config = getDefaultConfig();

describe("spec-stage", () => {
  const testDir = join(process.cwd(), ".test-spec-stage");
  const hmDir = join(testDir, ".hive-mind");
  const prdPath = join(testDir, "PRD.md");

  function setup() {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(prdPath, "# Test PRD\n## Requirements\n- Build something");
    vi.mocked(spawnAgentWithRetry).mockClear();
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("runSpecStage produces 7 output files", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, hmDir, config);
      consoleSpy.mockRestore();

      for (const step of SPEC_STEPS) {
        expect(existsSync(join(hmDir, "spec", step))).toBe(true);
      }
    } finally {
      cleanup();
    }
  });

  it("critic receives only artifact (isolation)", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, hmDir, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      // S.4 is the 4th call (index 3), S.6 is the 6th call (index 5)
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

  it("exactly 7 steps in pipeline", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, hmDir, config);
      consoleSpy.mockRestore();

      expect(vi.mocked(spawnAgentWithRetry).mock.calls.length).toBe(7);
    } finally {
      cleanup();
    }
  });

  it("critic agents are separate subagent spawns", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runSpecStage(prdPath, hmDir, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const criticCalls = calls.filter((c) => c[0].type === "critic");

      // Each critic is a separate spawnAgentWithRetry call
      expect(criticCalls.length).toBe(2);
      // They have different output files
      expect(criticCalls[0][0].outputFile).not.toBe(criticCalls[1][0].outputFile);
    } finally {
      cleanup();
    }
  });

  it("empty critique handled gracefully", async () => {
    setup();
    try {
      // Make critic calls return failure (empty output)
      vi.mocked(spawnAgentWithRetry).mockImplementation(async (config) => {
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });

        if (config.type === "critic") {
          // Don't write file — simulate empty output
          return { success: false, outputFile: config.outputFile, error: "Empty critique" };
        }

        wf(config.outputFile, `# Mock output for ${config.type}`);
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Should not throw — empty critiques are handled gracefully
      await runSpecStage(prdPath, hmDir, config);

      expect(warnSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    } finally {
      cleanup();
    }
  });
});
