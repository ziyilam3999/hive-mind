import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Track all spawner calls with their configs
const spawnCalls: Array<{ config: Record<string, unknown>; hiveMindConfig: Record<string, unknown> }> = [];

vi.mock("../../agents/spawner.js", () => {
  const impl = async (
    config: { outputFile: string; type: string },
    _hiveMindConfig: Record<string, unknown>,
  ) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });
    writeFileSync(config.outputFile, `# Mock output for ${config.type}`);
    spawnCalls.push({ config: config as Record<string, unknown>, hiveMindConfig: _hiveMindConfig });
    return {
      success: true,
      outputFile: config.outputFile,
      costUsd: 0.05,
      modelUsed: "claude-sonnet-4-20250514",
      sessionId: "sess-integration-test",
      durationMs: 3200,
    };
  };
  return {
    spawnAgentWithRetry: vi.fn(impl),
    spawnAgentsParallel: vi.fn(
      async (configs: Array<{ outputFile: string; type: string }>, hiveMindConfig: Record<string, unknown>) => {
        return Promise.all(configs.map((c) => impl(c, hiveMindConfig)));
      },
    ),
  };
});

vi.mock("../../utils/shell.js", () => ({
  runShell: vi.fn(async () => ({ exitCode: 0, stdout: "v1.0.0\n", stderr: "" })),
}));

import { runSpecStage, SPEC_STEPS } from "../../stages/spec-stage.js";
import { loadConfig, getDefaultConfig } from "../../config/loader.js";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

describe("integration: SPEC stage with config-driven model assignments", () => {
  const testDir = join(process.cwd(), ".test-integration-spec");
  const hmDir = join(testDir, ".hive-mind");
  const prdPath = join(testDir, "PRD.md");
  const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };

  beforeEach(() => {
    spawnCalls.length = 0;
    mkdirSync(hmDir, { recursive: true });
    writeFileSync(prdPath, "# Test PRD\n\nBuild a widget system.");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("SPEC stage produces all 7 artifacts with default config", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const config = getDefaultConfig();

    await runSpecStage(prdPath, dirs, config);
    consoleSpy.mockRestore();

    const specDir = join(hmDir, "spec");
    for (const step of SPEC_STEPS) {
      expect(existsSync(join(specDir, step))).toBe(true);
    }

    // 6 sequential spawns via spawnAgentWithRetry
    expect(spawnCalls.length).toBe(6);
  });

  it("config roundtrip: write config file → load → spawn with correct model", async () => {
    // Write a .hivemindrc.json with critic overridden to opus
    writeFileSync(
      join(testDir, ".hivemindrc.json"),
      JSON.stringify({ modelAssignments: { critic: "opus" } }),
    );

    const config = loadConfig(testDir);

    // Verify config loaded correctly: critic=opus, others unchanged
    expect(config.modelAssignments.critic).toBe("opus");
    expect(config.modelAssignments.researcher).toBe("opus"); // default preserved
    expect(config.modelAssignments.reporter).toBe("haiku"); // default preserved

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runSpecStage(prdPath, dirs, config);
    consoleSpy.mockRestore();

    // Every spawn call should receive the same config with critic=opus
    for (const call of spawnCalls) {
      const hmc = call.hiveMindConfig as { modelAssignments: Record<string, string> };
      expect(hmc.modelAssignments.critic).toBe("opus");
    }
  });

  it("partial config merge: overridden + default agents coexist", async () => {
    writeFileSync(
      join(testDir, ".hivemindrc.json"),
      JSON.stringify({
        modelAssignments: { critic: "opus", researcher: "haiku" },
        maxRetries: 3,
      }),
    );

    const config = loadConfig(testDir);

    expect(config.modelAssignments.critic).toBe("opus");
    expect(config.modelAssignments.researcher).toBe("haiku");
    expect(config.modelAssignments["spec-drafter"]).toBe("opus"); // default
    expect(config.modelAssignments["spec-corrector"]).toBe("opus"); // default
    expect(config.maxRetries).toBe(3);
    // Other numeric values remain defaults
    expect(config.agentTimeout).toBe(600_000);
  });

  it("JSON metadata returned by spawner does not break SPEC stage", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const config = getDefaultConfig();

    await runSpecStage(prdPath, dirs, config);
    consoleSpy.mockRestore();

    // All 6 steps completed despite agents returning metadata
    expect(spawnCalls.length).toBe(6);

    // Verify metadata was included in mock returns (the mock always includes it)
    // The key thing is that the SPEC stage didn't crash
    for (const step of SPEC_STEPS) {
      expect(existsSync(join(hmDir, "spec", step))).toBe(true);
    }
  });

  it("agent types match expected SPEC pipeline sequence", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const config = getDefaultConfig();

    await runSpecStage(prdPath, dirs, config);
    consoleSpy.mockRestore();

    const types = spawnCalls.map((c) => c.config.type);
    expect(types).toEqual([
      "researcher",
      "spec-drafter",
      "critic",
      "spec-corrector",
      "critic",
      "spec-corrector",
    ]);
  });

  it("critic isolation: critics only receive their target artifact", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const config = getDefaultConfig();

    await runSpecStage(prdPath, dirs, config);
    consoleSpy.mockRestore();

    // Find the two critic calls (indices 3 and 5)
    const criticCalls = spawnCalls.filter((c) => c.config.type === "critic");
    expect(criticCalls.length).toBe(2);

    // Critic 1 only receives SPEC-draft.md
    const critic1Inputs = criticCalls[0].config.inputFiles as string[];
    expect(critic1Inputs.length).toBe(1);
    expect(critic1Inputs[0]).toContain("SPEC-draft.md");

    // Critic 2 only receives SPEC-v0.2.md
    const critic2Inputs = criticCalls[1].config.inputFiles as string[];
    expect(critic2Inputs.length).toBe(1);
    expect(critic2Inputs[0]).toContain("SPEC-v0.2.md");
  });
});
