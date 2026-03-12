import { describe, it, expect, vi } from "vitest";

const mockPlanJson = JSON.stringify({
  schemaVersion: "2.0.0",
  prdPath: "PRD.md",
  specPath: "spec/SPEC-v1.0.md",
  stories: [
    {
      id: "US-01",
      title: "First Story",
      specSections: ["§1.1"],
      dependencies: [],
      sourceFiles: ["src/a.ts"],
      complexity: "low",
      rolesUsed: ["analyst"],
      stepFile: "plans/steps/US-01.md",
      status: "not-started",
      attempts: 0,
      maxAttempts: 3,
      committed: false,
      commitHash: null,
    },
    {
      id: "US-02",
      title: "Second Story",
      specSections: ["§2.1"],
      dependencies: ["US-01"],
      sourceFiles: ["src/b.ts"],
      complexity: "medium",
      rolesUsed: ["analyst", "security"],
      stepFile: "plans/steps/US-02.md",
      status: "not-started",
      attempts: 0,
      maxAttempts: 3,
      committed: false,
      commitHash: null,
    },
  ],
});

vi.mock("../../agents/spawner.js", () => {
  const impl = async (config: { outputFile: string; type: string }) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });
    if (config.type === "planner") {
      writeFileSync(config.outputFile, mockPlanJson);
    } else if (config.type === "ac-generator") {
      writeFileSync(config.outputFile, "- AC-0: npm run lint && npm run typecheck\n- AC-1: Test passes");
    } else if (config.type === "ec-generator") {
      writeFileSync(config.outputFile, "- EC-1: npm test && echo PASS || echo FAIL");
    } else {
      writeFileSync(config.outputFile, `# Mock output for ${config.type}`);
    }
    return { success: true, outputFile: config.outputFile };
  };
  return {
    spawnAgentWithRetry: vi.fn(impl),
    spawnAgentsParallel: vi.fn(async (configs: Array<{ outputFile: string; type: string }>) => {
      return Promise.all(configs.map(impl));
    }),
  };
});

import { runPlanStage } from "../../stages/plan-stage.js";
import { spawnAgentWithRetry, spawnAgentsParallel } from "../../agents/spawner.js";
import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";

const config = getDefaultConfig();

describe("synthesizer-split integration", () => {
  const testDir = join(process.cwd(), ".test-synth-split");
  const hmDir = join(testDir, ".hive-mind");

  function setup() {
    mkdirSync(join(hmDir, "spec"), { recursive: true });
    writeFileSync(
      join(hmDir, "spec", "SPEC-v1.0.md"),
      "# SPEC\n## Requirements\n- Build a function to export data with auth token",
    );
    vi.mocked(spawnAgentWithRetry).mockClear();
    vi.mocked(spawnAgentsParallel).mockClear();
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("planner spawned with type 'planner' (not 'synthesizer')", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runPlanStage(hmDir, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      const retryCalls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const plannerCall = retryCalls.find((c) => c[0].type === "planner");
      expect(plannerCall).toBeDefined();
      // No synthesizer call for the planning step
      const synthesizerPlanCall = retryCalls.find(
        (c) => c[0].type === "synthesizer" && c[0].outputFile.includes("execution-plan"),
      );
      expect(synthesizerPlanCall).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("AC-generators spawned via spawnAgentsParallel, count matches stories", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runPlanStage(hmDir, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      const parallelCalls = vi.mocked(spawnAgentsParallel).mock.calls;
      // Find the AC-generator parallel call
      const acCall = parallelCalls.find((c) =>
        c[0].some((cfg: { type: string }) => cfg.type === "ac-generator"),
      );
      expect(acCall).toBeDefined();
      expect(acCall![0].length).toBe(2); // matches 2 stories
    } finally {
      cleanup();
    }
  });

  it("EC-generators spawned via spawnAgentsParallel, count matches stories", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runPlanStage(hmDir, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      const parallelCalls = vi.mocked(spawnAgentsParallel).mock.calls;
      const ecCall = parallelCalls.find((c) =>
        c[0].some((cfg: { type: string }) => cfg.type === "ec-generator"),
      );
      expect(ecCall).toBeDefined();
      expect(ecCall![0].length).toBe(2);
    } finally {
      cleanup();
    }
  });

  it("assembly produces step files with AC and EC sections", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runPlanStage(hmDir, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      const stepFile1 = join(hmDir, "plans", "steps", "US-01.md");
      const stepFile2 = join(hmDir, "plans", "steps", "US-02.md");
      expect(existsSync(stepFile1)).toBe(true);
      expect(existsSync(stepFile2)).toBe(true);

      const content1 = readFileSync(stepFile1, "utf-8");
      expect(content1).toContain("## ACCEPTANCE CRITERIA");
      expect(content1).toContain("## EXIT CRITERIA");
      expect(content1).toContain("AC-0");
      expect(content1).toContain("EC-1");
    } finally {
      cleanup();
    }
  });

  it("AC consolidator still runs after assembly", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runPlanStage(hmDir, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      const retryCalls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const consolidatorCall = retryCalls.find(
        (c) => c[0].type === "synthesizer" && c[0].rules?.some((r: string) => r.includes("CONSOLIDATE")),
      );
      expect(consolidatorCall).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("enricher spawned per story after assembly", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runPlanStage(hmDir, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      const retryCalls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const enricherCalls = retryCalls.filter((c) => c[0].type === "enricher");
      // enricher runs per story that has filtered role-reports
      expect(enricherCalls.length).toBeGreaterThanOrEqual(1);
    } finally {
      cleanup();
    }
  });

  it("enricher failure does not crash plan stage", async () => {
    setup();
    // Override spawnAgentWithRetry to fail on enricher
    const origImpl = vi.mocked(spawnAgentWithRetry).getMockImplementation()!;
    vi.mocked(spawnAgentWithRetry).mockImplementation(async (cfg, ...rest) => {
      if (cfg.type === "enricher") {
        throw new Error("Enricher exploded");
      }
      return origImpl(cfg, ...rest);
    });

    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Should not throw
      await runPlanStage(hmDir, config);
      consoleSpy.mockRestore();

      // Verify warning was logged
      const warnings = warnSpy.mock.calls.flat().join(" ");
      expect(warnings).toContain("Enricher failed");
      warnSpy.mockRestore();
    } finally {
      cleanup();
    }
  });
});
