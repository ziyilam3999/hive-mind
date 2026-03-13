import { describe, it, expect, vi } from "vitest";
import type { Story } from "../../types/execution-plan.js";

// Track spawned agents
const spawnCalls: Array<{ type: string; outputFile: string }> = [];

async function defaultMockSpawn(config: { type: string; outputFile: string }) {
  spawnCalls.push({ type: config.type, outputFile: config.outputFile });
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(config.outputFile), { recursive: true });

  if (config.type === "tester-exec") {
    writeFileSync(config.outputFile, `<!-- STATUS: {"result": "PASS", "total": 2, "passed": 2, "failed": 0} -->\n# Test Report\nAll passed`);
  } else if (config.type === "evaluator") {
    writeFileSync(config.outputFile, `<!-- STATUS: {"verdict": "PASS", "ecsPassed": 1, "ecsFailed": 0} -->\n# Eval Report\nAll passed`);
  } else if (config.type === "compliance-reviewer") {
    writeFileSync(config.outputFile, `<!-- STATUS: {"result": "PASS", "done": 3, "missing": 0, "uncertain": 0} -->\n# Compliance Report`);
  } else {
    writeFileSync(config.outputFile, `# Mock ${config.type} report`);
  }
  return { success: true, outputFile: config.outputFile };
}

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(defaultMockSpawn),
  spawnAgentsParallel: vi.fn(async () => []),
}));

import { executeOneStory } from "../../orchestrator.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";

const config = getDefaultConfig();

function makeStoryWithSubTasks(): Story {
  return {
    id: "US-01",
    title: "Test story with sub-tasks",
    specSections: ["§1"],
    dependencies: [],
    sourceFiles: ["src/a.ts", "src/b.ts"],
    complexity: "high",
    rolesUsed: ["analyst"],
    stepFile: "plans/steps/US-01.md",
    status: "in-progress",
    attempts: 0,
    maxAttempts: 3,
    committed: false,
    commitHash: null,
    subTasks: [
      { id: "T1", title: "Types", description: "Define type interfaces", sourceFiles: ["src/a.ts"], status: "not-started", attempts: 0, maxAttempts: 3 },
      { id: "T2", title: "Logic", description: "Implement logic", sourceFiles: ["src/b.ts"], status: "not-started", attempts: 0, maxAttempts: 3 },
    ],
  };
}

function makeStoryWithoutSubTasks(): Story {
  return {
    id: "US-02",
    title: "Simple story",
    specSections: ["§2"],
    dependencies: [],
    sourceFiles: ["src/c.ts"],
    complexity: "low",
    rolesUsed: ["analyst"],
    stepFile: "plans/steps/US-02.md",
    status: "in-progress",
    attempts: 0,
    maxAttempts: 3,
    committed: false,
    commitHash: null,
  };
}

describe("sub-task execution (FW-01)", () => {
  const testDir = join(process.cwd(), ".test-subtask-exec");

  async function setup() {
    spawnCalls.length = 0;
    // Reset mock to default (test 4 overrides it)
    const { spawnAgentWithRetry } = await import("../../agents/spawner.js");
    vi.mocked(spawnAgentWithRetry).mockImplementation(defaultMockSpawn);

    mkdirSync(join(testDir, "plans", "steps"), { recursive: true });
    mkdirSync(join(testDir, "reports", "US-01"), { recursive: true });
    mkdirSync(join(testDir, "reports", "US-02"), { recursive: true });
    writeFileSync(join(testDir, "plans/steps/US-01.md"), "# US-01\n## ACCEPTANCE CRITERIA\n- AC-1\n## EXIT CRITERIA\n- EC-1");
    writeFileSync(join(testDir, "plans/steps/US-02.md"), "# US-02\n## ACCEPTANCE CRITERIA\n- AC-1\n## EXIT CRITERIA\n- EC-1");
    writeFileSync(join(testDir, "manager-log.jsonl"), "");
    writeFileSync(join(testDir, "memory.md"), "");
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("sequential sub-task execution: BUILD+VERIFY per sub-task", async () => {
    await setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = await executeOneStory(makeStoryWithSubTasks(), testDir, config);
      consoleSpy.mockRestore();

      expect(result.passed).toBe(true);
      // Should have: implementer×2 + refactorer×2 + tester×2 + evaluator×2 + compliance-reviewer×1
      const implementerCalls = spawnCalls.filter((c) => c.type === "implementer");
      expect(implementerCalls.length).toBe(2); // one per sub-task
      const testerCalls = spawnCalls.filter((c) => c.type === "tester-exec");
      expect(testerCalls.length).toBe(2); // one per sub-task
    } finally {
      cleanup();
    }
  });

  it("sub-task failure → story failure with sub-task ID in error", async () => {
    await setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementation(async (cfg) => {
        spawnCalls.push({ type: cfg.type, outputFile: cfg.outputFile });
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(cfg.outputFile), { recursive: true });

        if (cfg.type === "tester-exec") {
          wf(cfg.outputFile, `<!-- STATUS: {"result": "FAIL", "total": 1, "passed": 0, "failed": 1} -->\n# FAIL`);
        } else if (cfg.type === "diagnostician" || cfg.type === "fixer") {
          wf(cfg.outputFile, `<!-- STATUS: {"result": "PASS"} -->\n**Files Changed:** src/a.ts\n# Fix`);
        } else {
          wf(cfg.outputFile, `# Mock ${cfg.type}`);
        }
        return { success: true, outputFile: cfg.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await executeOneStory(makeStoryWithSubTasks(), testDir, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      expect(result.passed).toBe(false);
      expect(result.errorMessage).toContain("T1");
    } finally {
      cleanup();
    }
  });

  it("sub-task retry is independent — only failed sub-task retries", async () => {
    await setup();
    try {
      let testerCallCount = 0;
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementation(async (cfg) => {
        spawnCalls.push({ type: cfg.type, outputFile: cfg.outputFile });
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(cfg.outputFile), { recursive: true });

        if (cfg.type === "tester-exec") {
          testerCallCount++;
          // First tester call fails (T1 attempt 1), second passes (T1 attempt 2), third passes (T2)
          if (testerCallCount === 1) {
            wf(cfg.outputFile, `<!-- STATUS: {"result": "FAIL", "total": 1, "passed": 0, "failed": 1} -->\n# FAIL`);
          } else {
            wf(cfg.outputFile, `<!-- STATUS: {"result": "PASS", "total": 1, "passed": 1, "failed": 0} -->\n# PASS`);
          }
        } else if (cfg.type === "evaluator") {
          wf(cfg.outputFile, `<!-- STATUS: {"verdict": "PASS", "ecsPassed": 1, "ecsFailed": 0} -->\n# Eval PASS`);
        } else if (cfg.type === "diagnostician" || cfg.type === "fixer") {
          wf(cfg.outputFile, `<!-- STATUS: {"result": "PASS"} -->\n**Files Changed:** src/a.ts\n# Fix`);
        } else if (cfg.type === "compliance-reviewer") {
          wf(cfg.outputFile, `<!-- STATUS: {"result": "PASS", "done": 3, "missing": 0, "uncertain": 0} -->\n# Compliance`);
        } else {
          wf(cfg.outputFile, `# Mock ${cfg.type}`);
        }
        return { success: true, outputFile: cfg.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await executeOneStory(makeStoryWithSubTasks(), testDir, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      expect(result.passed).toBe(true);
      // T1 retried once (2 tester calls for T1) + T2 once = 3 total tester calls
      const testerCalls = spawnCalls.filter((c) => c.type === "tester-exec");
      expect(testerCalls.length).toBe(3);
    } finally {
      cleanup();
    }
  });

  it("no sub-tasks → existing whole-story behavior", async () => {
    await setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = await executeOneStory(makeStoryWithoutSubTasks(), testDir, config);
      consoleSpy.mockRestore();

      expect(result.passed).toBe(true);
      const implementerCalls = spawnCalls.filter((c) => c.type === "implementer");
      expect(implementerCalls.length).toBe(1); // whole story
    } finally {
      cleanup();
    }
  });

  it("compliance runs on whole story after all sub-tasks pass", async () => {
    await setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await executeOneStory(makeStoryWithSubTasks(), testDir, config);
      consoleSpy.mockRestore();

      const complianceCalls = spawnCalls.filter((c) => c.type === "compliance-reviewer");
      expect(complianceCalls.length).toBe(1); // runs once on whole story
    } finally {
      cleanup();
    }
  });

  it("sub-task exhausting maxAttempts fails the story", async () => {
    await setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementation(async (cfg) => {
        spawnCalls.push({ type: cfg.type, outputFile: cfg.outputFile });
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(cfg.outputFile), { recursive: true });

        if (cfg.type === "tester-exec") {
          // Always fail
          wf(cfg.outputFile, `<!-- STATUS: {"result": "FAIL", "total": 1, "passed": 0, "failed": 1} -->\n# FAIL`);
        } else if (cfg.type === "diagnostician" || cfg.type === "fixer") {
          wf(cfg.outputFile, `<!-- STATUS: {"result": "PASS"} -->\n**Files Changed:** src/a.ts\n# Fix`);
        } else {
          wf(cfg.outputFile, `# Mock ${cfg.type}`);
        }
        return { success: true, outputFile: cfg.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await executeOneStory(makeStoryWithSubTasks(), testDir, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      expect(result.passed).toBe(false);
      // Sub-task T1 should have exhausted maxAttempts (3)
      expect(result.attempts).toBe(3);
      expect(result.errorMessage).toContain("T1");
      // Compliance should NOT have run since sub-tasks failed
      const complianceCalls = spawnCalls.filter((c) => c.type === "compliance-reviewer");
      expect(complianceCalls.length).toBe(0);
    } finally {
      cleanup();
    }
  });
});
