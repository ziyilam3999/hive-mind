import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { ExecutionPlan, Story } from "../../types/execution-plan.js";
import type { Module } from "../../types/module.js";

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string }) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });
    writeFileSync(config.outputFile, "# Integration Report\n\n## Results\nAll contracts PASS\n");
    return { success: true, outputFile: config.outputFile, costUsd: 0.01 };
  }),
}));

import { runIntegrateVerify, buildIntegrationCheckpointMessage } from "../../stages/integrate-verify.js";
import { spawnAgentWithRetry } from "../../agents/spawner.js";
import { getToolsForAgent } from "../../agents/tool-permissions.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

const config = getDefaultConfig();

function makeStory(overrides: Partial<Story> & { id: string }): Story {
  return {
    title: overrides.id,
    specSections: [],
    dependencies: [],
    sourceFiles: [],
    complexity: "low",
    rolesUsed: [],
    stepFile: `plans/steps/${overrides.id}.md`,
    status: "passed",
    attempts: 1,
    maxAttempts: 3,
    committed: true,
    commitHash: "abc123",
    ...overrides,
  };
}

function makePlan(stories: Story[], modules?: Module[]): ExecutionPlan {
  return {
    schemaVersion: "2.0.0",
    prdPath: "/prd.md",
    specPath: "/spec.md",
    stories,
    modules,
  };
}

describe("integrate-verify", () => {
  const testDir = join(process.cwd(), ".test-integrate-verify");
  const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(join(testDir, "spec"), { recursive: true });
    mkdirSync(join(testDir, "reports"), { recursive: true });
    vi.mocked(spawnAgentWithRetry).mockClear();
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("skips for single-repo (no modules)", async () => {
    const plan = makePlan([makeStory({ id: "US-01" })]);
    const result = await runIntegrateVerify(plan, dirs, config);
    expect(result.skipped).toBe(true);
    expect(result.passed).toBe(true);
    expect(vi.mocked(spawnAgentWithRetry)).not.toHaveBeenCalled();
  });

  it("skips for empty modules array", async () => {
    const plan = makePlan([makeStory({ id: "US-01" })], []);
    const result = await runIntegrateVerify(plan, dirs, config);
    expect(result.skipped).toBe(true);
  });

  it("reports WARNING when SPEC has no contracts section", async () => {
    writeFileSync(join(testDir, "spec", "SPEC-v1.0.md"), "# SPEC\n\n## Stories\n");
    const plan = makePlan(
      [makeStory({ id: "US-01", moduleId: "lib" })],
      [
        { id: "lib", path: "/lib", role: "producer", dependencies: [] },
        { id: "app", path: "/app", role: "consumer", dependencies: ["lib"] },
      ],
    );
    const result = await runIntegrateVerify(plan, dirs, config);
    expect(result.skipped).toBe(false);
    expect(result.warning).toBe("No contracts defined — cannot verify");
    expect(vi.mocked(spawnAgentWithRetry)).not.toHaveBeenCalled();
  });

  it("spawns one agent per dependency edge", async () => {
    writeFileSync(join(testDir, "spec", "SPEC-v1.0.md"), "# SPEC\n\n## Inter-Module Contracts\n\nSome contracts\n");
    const plan = makePlan(
      [
        makeStory({ id: "US-01", moduleId: "lib" }),
        makeStory({ id: "US-02", moduleId: "app" }),
        makeStory({ id: "US-03", moduleId: "api" }),
      ],
      [
        { id: "lib", path: "/lib", role: "producer", dependencies: [] },
        { id: "app", path: "/app", role: "consumer", dependencies: ["lib"] },
        { id: "api", path: "/api", role: "consumer", dependencies: ["lib"] },
      ],
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await runIntegrateVerify(plan, dirs, config);
    consoleSpy.mockRestore();

    // 2 edges: lib→app, lib→api
    expect(vi.mocked(spawnAgentWithRetry)).toHaveBeenCalledTimes(2);
    expect(result.boundaries).toHaveLength(2);
    expect(result.skipped).toBe(false);
  });

  it("agent spawned with integration-verifier type", async () => {
    writeFileSync(join(testDir, "spec", "SPEC-v1.0.md"), "# SPEC\n\n## Inter-Module Contracts\n\nContracts\n");
    const plan = makePlan(
      [
        makeStory({ id: "US-01", moduleId: "lib" }),
        makeStory({ id: "US-02", moduleId: "app" }),
      ],
      [
        { id: "lib", path: "/lib", role: "producer", dependencies: [] },
        { id: "app", path: "/app", role: "consumer", dependencies: ["lib"] },
      ],
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runIntegrateVerify(plan, dirs, config);
    consoleSpy.mockRestore();

    const call = vi.mocked(spawnAgentWithRetry).mock.calls[0];
    expect(call[0].type).toBe("integration-verifier");
  });

  it("non-fatal on agent crash (P39)", async () => {
    writeFileSync(join(testDir, "spec", "SPEC-v1.0.md"), "# SPEC\n\n## Inter-Module Contracts\n\nContracts\n");
    vi.mocked(spawnAgentWithRetry).mockRejectedValueOnce(new Error("agent crash"));

    const plan = makePlan(
      [
        makeStory({ id: "US-01", moduleId: "lib" }),
        makeStory({ id: "US-02", moduleId: "app" }),
      ],
      [
        { id: "lib", path: "/lib", role: "producer", dependencies: [] },
        { id: "app", path: "/app", role: "consumer", dependencies: ["lib"] },
      ],
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Should not throw — non-fatal
    const result = await runIntegrateVerify(plan, dirs, config);

    expect(result.boundaries).toHaveLength(1);
    expect(result.boundaries[0].passed).toBe(false);
    // Verify warning was logged about the crash
    const warnCalls = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(warnCalls.some((msg) => msg.includes("crashed") || msg.includes("agent crash"))).toBe(true);

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("integration-verifier has OUTPUT_TOOLS (not READ_ONLY)", () => {
    const tools = getToolsForAgent("integration-verifier");
    expect(tools).toContain("Write");
    expect(tools).toContain("Read");
    expect(tools).toContain("Glob");
    expect(tools).toContain("Grep");
  });
});

describe("buildIntegrationCheckpointMessage", () => {
  it("includes warning when no contracts", () => {
    const msg = buildIntegrationCheckpointMessage({
      passed: true, skipped: false, boundaries: [],
      warning: "No contracts defined — cannot verify",
    });
    expect(msg).toContain("No contracts defined");
  });

  it("includes boundary results", () => {
    const msg = buildIntegrationCheckpointMessage({
      passed: true, skipped: false,
      boundaries: [
        { producer: "lib", consumer: "app", passed: true, reportPath: "/r.md" },
      ],
    });
    expect(msg).toContain("lib → app: PASS");
  });
});
