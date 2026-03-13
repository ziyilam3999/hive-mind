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
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";

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
      const result = await runVerify(makeStory(), testDir, join(testDir, "plans", "execution-plan.json"), config);
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
      const result = await runVerify(makeStory(), testDir, join(testDir, "plans", "execution-plan.json"), config);
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
        } else {
          wf(config.outputFile, `# Mock ${config.type}`);
        }
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runVerify(makeStory(), testDir, join(testDir, "plans", "execution-plan.json"), config);
      consoleSpy.mockRestore();

      // Fixer should have been called with step file as first input
      const fixerCall = spawnCalls.find((c) => c.type === "fixer");
      expect(fixerCall).toBeDefined();
      expect(fixerCall!.inputFiles[0]).toContain("US-99-test.md");
      // Step file is the canonical source — not US-99-ecs.md or acceptance-criteria.md
      expect(fixerCall!.inputFiles[0]).not.toContain("-ecs.md");
      expect(fixerCall!.inputFiles[0]).not.toContain("acceptance-criteria");
    } finally {
      cleanup();
    }
  });

  it("attempt 1 = fast path (no diagnostician)", async () => {
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
        } else {
          wf(config.outputFile, `# Mock ${config.type}`);
        }
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = await runVerify(makeStory(), testDir, join(testDir, "plans", "execution-plan.json"), config);
      consoleSpy.mockRestore();

      expect(result.passed).toBe(true);
      // On attempt 1, fixer runs but diagnostician does NOT
      const diagCalls = spawnCalls.filter((c) => c.type === "diagnostician");
      expect(diagCalls.length).toBe(0);
    } finally {
      cleanup();
    }
  });
});
