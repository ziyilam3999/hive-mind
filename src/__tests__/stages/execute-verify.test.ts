import { describe, it, expect, vi } from "vitest";
import type { Story } from "../../types/execution-plan.js";
import type { ExecutionPlan } from "../../types/execution-plan.js";

// Track spawn calls to verify behavior
const spawnCalls: Array<{ type: string; inputFiles: string[] }> = [];

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string; inputFiles: string[] }) => {
    spawnCalls.push({ type: config.type, inputFiles: [...config.inputFiles] });
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });

    if (config.type === "tester-exec") {
      writeFileSync(config.outputFile, "## STATUS: PASS\n");
    } else if (config.type === "evaluator") {
      writeFileSync(config.outputFile, "## VERDICT: PASS\n");
    } else {
      writeFileSync(config.outputFile, `# Mock ${config.type} report`);
    }
    return { success: true, outputFile: config.outputFile };
  }),
}));

import { runVerify } from "../../stages/execute-verify.js";
import { spawnAgentWithRetry } from "../../agents/spawner.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

const makeStory = (overrides?: Partial<Story>): Story => ({
  id: "US-99",
  title: "Test Story",
  specSections: ["1.1"],
  dependencies: [],
  sourceFiles: ["src/test.ts"],
  complexity: "low",
  rolesUsed: ["analyst"],
  stepFile: "plans/steps/US-99-test.md",
  status: "in-progress",
  attempts: 0,
  maxAttempts: 3,
  committed: false,
  commitHash: null,
  ...overrides,
});

const makePlan = (story: Story): ExecutionPlan => ({
  schemaVersion: "2.0.0",
  prdPath: "PRD.md",
  specPath: "SPEC.md",
  stories: [story],
});

const config = getDefaultConfig();

describe("execute-verify", () => {
  const testDir = join(process.cwd(), ".test-exec-verify");
  const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };

  function setup() {
    spawnCalls.length = 0;
    mkdirSync(join(testDir, "plans", "steps"), { recursive: true });
    mkdirSync(join(testDir, "reports", "US-99"), { recursive: true });
    const story = makeStory();
    writeFileSync(
      join(testDir, story.stepFile),
      "# US-99\n## ACCEPTANCE CRITERIA\n- AC-0: lint\n## EVALUATION CRITERIA\n- EC-1: test",
    );
    const plan = makePlan(story);
    const planPath = join(testDir, "plans", "execution-plan.json");
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("tester runs ACs via shell (returns PASS)", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = await runVerify(makeStory(), dirs, join(testDir, "plans", "execution-plan.json"), config);
      consoleSpy.mockRestore();

      expect(result.passed).toBe(true);
      expect(result.attempts).toBe(1);

      const testerCall = spawnCalls.find((c) => c.type === "tester-exec");
      expect(testerCall).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("max 3 attempts per story", async () => {
    setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementation(async (config) => {
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });
        // Always fail tester
        if (config.type === "tester-exec") {
          wf(config.outputFile, "## STATUS: FAIL\n| AC-0 | lint | npx eslint | FAIL | FAIL |");
        } else {
          wf(config.outputFile, `# Mock ${config.type}`);
        }
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await runVerify(makeStory(), dirs, join(testDir, "plans", "execution-plan.json"), config);
      consoleSpy.mockRestore();
      errSpy.mockRestore();

      expect(result.passed).toBe(false);
      expect(result.attempts).toBeLessThanOrEqual(3);
    } finally {
      cleanup();
    }
  });

  it("fixer receives step file as first input (K1/K4)", async () => {
    setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      let testerCallCount = 0;
      vi.mocked(mockSpawn).mockImplementation(async (config) => {
        spawnCalls.push({ type: config.type, inputFiles: [...config.inputFiles] });
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });
        if (config.type === "tester-exec") {
          testerCallCount++;
          if (testerCallCount === 1) {
            wf(config.outputFile, "## STATUS: FAIL\n| AC-0 | lint | npx eslint | FAIL | FAIL |");
          } else {
            wf(config.outputFile, "## STATUS: PASS\n");
          }
        } else if (config.type === "evaluator") {
          wf(config.outputFile, "## VERDICT: PASS\n");
        } else if (config.type === "fixer") {
          wf(config.outputFile, `<!-- STATUS: {"result": "PASS"} -->\n# Fix Report\n**Files Changed:** src/test.ts`);
        } else {
          wf(config.outputFile, `# Mock ${config.type}`);
        }
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runVerify(makeStory(), dirs, join(testDir, "plans", "execution-plan.json"), config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      // Fixer should have been called with step file as first input
      const fixerCall = spawnCalls.find((c) => c.type === "fixer");
      expect(fixerCall).toBeDefined();
      expect(fixerCall!.inputFiles[0]).toContain("US-99-test.md");
      // Step file is the canonical source — not US-99-ecs.md or acceptance-criteria.md
      expect(fixerCall!.inputFiles[0]).not.toContain("-ecs.md");
      expect(fixerCall!.inputFiles[0]).not.toContain("acceptance-criteria");
      // K5: Diagnostician should have run before fixer
      const diagCall = spawnCalls.find((c) => c.type === "diagnostician");
      expect(diagCall).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("diagnostician runs on every attempt (K5: no fast-path)", async () => {
    setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      let testerCallCount = 0;
      vi.mocked(mockSpawn).mockImplementation(async (config) => {
        spawnCalls.push({ type: config.type, inputFiles: [...config.inputFiles] });
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });
        if (config.type === "tester-exec") {
          testerCallCount++;
          if (testerCallCount === 1) {
            wf(config.outputFile, "## STATUS: FAIL\n| AC-0 | lint | npx eslint | FAIL | FAIL |");
          } else {
            wf(config.outputFile, "## STATUS: PASS\n");
          }
        } else if (config.type === "evaluator") {
          wf(config.outputFile, "## VERDICT: PASS\n");
        } else if (config.type === "fixer") {
          wf(config.outputFile, `<!-- STATUS: {"result": "PASS"} -->\n# Fix Report\n**Files Changed:** src/test.ts`);
        } else {
          wf(config.outputFile, `# Mock ${config.type}`);
        }
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await runVerify(makeStory(), dirs, join(testDir, "plans", "execution-plan.json"), config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      expect(result.passed).toBe(true);
      // K5: Diagnostician runs on attempt 1 (no fast-path)
      const diagCalls = spawnCalls.filter((c) => c.type === "diagnostician");
      expect(diagCalls.length).toBeGreaterThanOrEqual(1);
    } finally {
      cleanup();
    }
  });

  it("does not write to execution plan (plan writes removed for wave executor)", async () => {
    setup();
    try {
      const planPath = join(testDir, "plans", "execution-plan.json");
      const { readFileSync } = await import("node:fs");
      const planBefore = readFileSync(planPath, "utf-8");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runVerify(makeStory(), dirs, planPath, config);
      consoleSpy.mockRestore();

      const planAfter = readFileSync(planPath, "utf-8");
      expect(planAfter).toBe(planBefore);
    } finally {
      cleanup();
    }
  });

  it("post-fix verification logs warning when fix report missing status (K5)", async () => {
    setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      let testerCallCount = 0;
      vi.mocked(mockSpawn).mockImplementation(async (config) => {
        spawnCalls.push({ type: config.type, inputFiles: [...config.inputFiles] });
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });
        if (config.type === "tester-exec") {
          testerCallCount++;
          if (testerCallCount === 1) {
            wf(config.outputFile, "## STATUS: FAIL\n| AC-0 | lint | npx eslint | FAIL | FAIL |");
          } else {
            wf(config.outputFile, "## STATUS: PASS\n");
          }
        } else if (config.type === "evaluator") {
          wf(config.outputFile, "## VERDICT: PASS\n");
        } else if (config.type === "fixer") {
          // Fixer writes report WITHOUT STATUS block — should trigger warning
          wf(config.outputFile, `# Fix Report\nApplied some changes.`);
        } else {
          wf(config.outputFile, `# Mock ${config.type}`);
        }
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runVerify(makeStory(), dirs, join(testDir, "plans", "execution-plan.json"), config);

      // Should have logged a warning about unverified fix
      const warnCalls = warnSpy.mock.calls.map((c) => c[0]);
      expect(warnCalls.some((msg: string) => msg.includes("may not have applied changes"))).toBe(true);

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    } finally {
      cleanup();
    }
  });

  it("moduleCwd forwarded to agent configs", async () => {
    setup();
    vi.mocked(spawnAgentWithRetry).mockClear();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runVerify(makeStory(), dirs, join(testDir, "plans", "execution-plan.json"), config, undefined, undefined, undefined, "/external/repo");
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const testerCall = calls.find((c) => c[0].type === "tester-exec");
      const evalCall = calls.find((c) => c[0].type === "evaluator");
      expect(testerCall![0].cwd).toBe("/external/repo");
      expect(evalCall![0].cwd).toBe("/external/repo");
    } finally {
      cleanup();
    }
  });

  it("scratchDir passed to tester-exec and evaluator agent configs (K18)", async () => {
    setup();
    vi.mocked(spawnAgentWithRetry).mockClear();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runVerify(makeStory(), dirs, join(testDir, "plans", "execution-plan.json"), config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const testerCall = calls.find((c) => c[0].type === "tester-exec");
      const evalCall = calls.find((c) => c[0].type === "evaluator");
      // scratchDir should follow .hive-mind/tmp/{storyId} pattern
      expect(testerCall![0].scratchDir).toContain(join("tmp", "US-99"));
      expect(evalCall![0].scratchDir).toContain(join("tmp", "US-99"));
    } finally {
      cleanup();
    }
  });

  it("undefined moduleCwd — cwd defaults to process.cwd()", async () => {
    setup();
    vi.mocked(spawnAgentWithRetry).mockClear();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runVerify(makeStory(), dirs, join(testDir, "plans", "execution-plan.json"), config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const testerCall = calls.find((c) => c[0].type === "tester-exec");
      expect(testerCall).toBeDefined();
      expect(testerCall![0].cwd).toBe(process.cwd());
    } finally {
      cleanup();
    }
  });
});
