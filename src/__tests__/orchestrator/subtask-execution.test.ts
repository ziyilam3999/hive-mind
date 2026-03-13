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
      { id: "T1", title: "Types", targetFiles: ["src/a.ts"], acceptanceCriteria: ["AC-1"], exitCriteria: ["EC-1"], status: "not-started", attempts: 0 },
      { id: "T2", title: "Logic", targetFiles: ["src/b.ts"], acceptanceCriteria: ["AC-2"], exitCriteria: ["EC-2"], status: "not-started", attempts: 0 },
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

  it("story with sub-tasks: executes BUILD+VERIFY per sub-task", async () => {
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

  it("story without sub-tasks: uses whole-story path", async () => {
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

  it("sub-task creates scoped step file with sub-task ACs/ECs", async () => {
    await setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await executeOneStory(makeStoryWithSubTasks(), testDir, config);
      consoleSpy.mockRestore();

      // Check that scoped step files were created
      const { readFileSync, existsSync } = await import("node:fs");
      const scopedPath = join(testDir, "plans/steps/US-01-T1.md");
      expect(existsSync(scopedPath)).toBe(true);
      const content = readFileSync(scopedPath, "utf8");
      expect(content).toContain("AC-1");
      expect(content).toContain("src/a.ts");
    } finally {
      cleanup();
    }
  });

  it("sub-task failure: returns failed result with sub-task ID", async () => {
    await setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementation(async (config) => {
        spawnCalls.push({ type: config.type, outputFile: config.outputFile });
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });

        if (config.type === "tester-exec") {
          wf(config.outputFile, `<!-- STATUS: {"status": "FAIL", "total": 1, "passed": 0, "failed": 1} -->\n# FAIL`);
        } else if (config.type === "diagnostician" || config.type === "fixer") {
          wf(config.outputFile, `<!-- STATUS: {"result": "PASS"} -->\n**Files Changed:** src/a.ts\n# Fix`);
        } else {
          wf(config.outputFile, `# Mock ${config.type}`);
        }
        return { success: true, outputFile: config.outputFile };
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
});
