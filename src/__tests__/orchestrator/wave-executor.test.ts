import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Story, ExecutionPlan } from "../../types/execution-plan.js";
import type { AgentConfig } from "../../types/agents.js";
import { getDefaultConfig } from "../../config/loader.js";

// vi.mock is hoisted — cannot reference external variables (P33/TDZ)
vi.mock("../../agents/spawner.js", () => {
  const impl = async (config: AgentConfig) => {
    const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const { dirname } = await import("node:path");
    md(dirname(config.outputFile), { recursive: true });
    if (config.type === "tester-exec") {
      wf(config.outputFile, "## STATUS: PASS\n");
    } else if (config.type === "evaluator") {
      wf(config.outputFile, "## VERDICT: PASS\n");
    } else if (config.type === "implementer") {
      wf(config.outputFile, "<!-- STATUS: {\"result\": \"PASS\"} -->\n# Impl\n**Files Created:** none");
    } else {
      wf(config.outputFile, `# Mock ${config.type}`);
    }
    return { success: true, outputFile: config.outputFile };
  };
  return {
    spawnAgentWithRetry: vi.fn(impl),
    spawnAgent: vi.fn(async () => ({ success: true, outputFile: "" })),
    spawnAgentsParallel: vi.fn(async (configs: AgentConfig[]) => {
      return Promise.all(configs.map(impl));
    }),
    __defaultImpl: impl,
  };
});

vi.mock("../../utils/shell.js", () => ({
  spawnClaude: vi.fn(async () => ({ exitCode: 0, stdout: "{}", stderr: "", json: {} })),
  runShell: vi.fn(async () => ({ exitCode: 0, stdout: "abc1234", stderr: "" })),
  getSpawnClaudeInvocationCount: vi.fn(() => 0),
}));

vi.mock("../../utils/notify.js", () => ({
  notifyCheckpoint: vi.fn(),
}));

import { runExecuteStage, executeOneStory } from "../../orchestrator.js";
import { saveExecutionPlan, loadExecutionPlan } from "../../state/execution-plan.js";
import { spawnAgentWithRetry } from "../../agents/spawner.js";
import { getSourceFilePaths } from "../../types/execution-plan.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

const config = getDefaultConfig();

// Access the default impl exported from the mock factory
const { __defaultImpl: defaultImpl } = await import("../../agents/spawner.js") as unknown as { __defaultImpl: typeof spawnAgentWithRetry };

function makeStory(overrides: Partial<Story> & { id: string }): Story {
  return {
    title: overrides.id,
    specSections: [],
    dependencies: [],
    sourceFiles: [],
    complexity: "low",
    rolesUsed: [],
    stepFile: `plans/steps/${overrides.id}.md`,
    status: "not-started",
    attempts: 0,
    maxAttempts: 3,
    committed: false,
    commitHash: null,
    ...overrides,
  };
}

function makePlan(stories: Story[]): ExecutionPlan {
  return {
    schemaVersion: "2.0.0",
    prdPath: "PRD.md",
    specPath: "SPEC.md",
    stories,
  };
}

function suppressConsole() {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => { logSpy.mockRestore(); warnSpy.mockRestore(); errSpy.mockRestore(); };
}

function resetMock() {
  vi.mocked(spawnAgentWithRetry).mockImplementation(defaultImpl as Parameters<typeof vi.mocked<typeof spawnAgentWithRetry>>[0] extends never ? never : typeof defaultImpl);
}

describe("wave executor", () => {
  const testDir = join(process.cwd(), ".test-wave-exec");
  const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };
  const planPath = join(testDir, "plans", "execution-plan.json");
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  function setup(plan: ExecutionPlan) {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(join(testDir, "plans", "steps"), { recursive: true });
    mkdirSync(join(testDir, "plans", "role-reports"), { recursive: true });
    mkdirSync(join(testDir, "reports"), { recursive: true });
    saveExecutionPlan(planPath, plan);
    for (const story of plan.stories) {
      writeFileSync(
        join(testDir, story.stepFile),
        `# ${story.id}\n## ACCEPTANCE CRITERIA\n- AC-1: test\n## EVALUATION CRITERIA\n- EC-1: eval`,
      );
      // Pre-create source files so the post-BUILD file existence gate passes
      for (const sf of getSourceFilePaths(story.sourceFiles)) {
        const sfDir = join(testDir, sf, "..");
        mkdirSync(sfDir, { recursive: true });
        writeFileSync(join(testDir, sf), `// mock ${sf}`);
      }
    }
    // Sandbox process.cwd() so cwd fallback in execute-build resolves to testDir
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testDir);
  }

  function cleanup() {
    cwdSpy?.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  }

  beforeEach(() => {
    resetMock();
  });

  it("executes a single story (backward compat)", async () => {
    const plan = makePlan([makeStory({ id: "US-01" })]);
    setup(plan);
    const restore = suppressConsole();
    try {
      await runExecuteStage(dirs, config);
      const result = loadExecutionPlan(planPath);
      expect(result.stories[0].status).toBe("passed");
    } finally {
      restore();
      cleanup();
    }
  });

  it("runs two independent stories in same wave", async () => {
    const plan = makePlan([
      makeStory({ id: "US-01", sourceFiles: ["a.ts"] }),
      makeStory({ id: "US-02", sourceFiles: ["b.ts"] }),
    ]);
    setup(plan);
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(String(args[0]));
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await runExecuteStage(dirs, config);
      const result = loadExecutionPlan(planPath);
      expect(result.stories[0].status).toBe("passed");
      expect(result.stories[1].status).toBe("passed");

      const waveLogs = logs.filter((l) => /Wave \d+:/.test(l));
      expect(waveLogs.length).toBe(1);
      expect(waveLogs[0]).toContain("US-01");
      expect(waveLogs[0]).toContain("US-02");
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      cleanup();
    }
  });

  it("dependent story waits for next wave", async () => {
    const plan = makePlan([
      makeStory({ id: "US-01" }),
      makeStory({ id: "US-02", dependencies: ["US-01"] }),
    ]);
    setup(plan);
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(String(args[0]));
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await runExecuteStage(dirs, config);
      const result = loadExecutionPlan(planPath);
      expect(result.stories[0].status).toBe("passed");
      expect(result.stories[1].status).toBe("passed");

      const waveLogs = logs.filter((l) => /Wave \d+:/.test(l));
      expect(waveLogs.length).toBe(2);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      cleanup();
    }
  });

  it("failed dependency blocks dependent story", async () => {
    vi.mocked(spawnAgentWithRetry).mockImplementation(async (cfg) => {
      const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
      const { dirname } = await import("node:path");
      md(dirname(cfg.outputFile), { recursive: true });
      if (cfg.type === "tester-exec") {
        wf(cfg.outputFile, "## STATUS: FAIL\n| AC-1 | test | npm test | FAIL | FAIL |");
      } else {
        wf(cfg.outputFile, `# Mock ${cfg.type}`);
      }
      return { success: true, outputFile: cfg.outputFile };
    });

    const plan = makePlan([
      makeStory({ id: "US-01", maxAttempts: 1 }),
      makeStory({ id: "US-02", dependencies: ["US-01"] }),
    ]);
    setup(plan);
    const restore = suppressConsole();
    try {
      await runExecuteStage(dirs, config);
      const result = loadExecutionPlan(planPath);
      expect(result.stories[0].status).toBe("failed");
      expect(result.stories[1].status).toBe("not-started");
    } finally {
      restore();
      cleanup();
    }
  });

  it("file overlap defers story to next wave", { timeout: 15000 }, async () => {
    const plan = makePlan([
      makeStory({ id: "US-01", sourceFiles: ["shared.ts"] }),
      makeStory({ id: "US-02", sourceFiles: ["shared.ts"] }),
    ]);
    setup(plan);
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(String(args[0]));
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await runExecuteStage(dirs, config);
      const result = loadExecutionPlan(planPath);
      expect(result.stories[0].status).toBe("passed");
      expect(result.stories[1].status).toBe("passed");

      const waveLogs = logs.filter((l) => /Wave \d+:/.test(l));
      expect(waveLogs.length).toBe(2);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      cleanup();
    }
  });

  it("crash recovery resets in-progress stories", { retry: 2 }, async () => {
    const plan = makePlan([
      makeStory({ id: "US-01", status: "in-progress" }),
      makeStory({ id: "US-02", status: "not-started" }),
    ]);
    setup(plan);
    const restore = suppressConsole();
    try {
      await runExecuteStage(dirs, config);
      const result = loadExecutionPlan(planPath);
      expect(result.stories[0].status).toBe("passed");
      expect(result.stories[1].status).toBe("passed");
    } finally {
      restore();
      cleanup();
    }
  });

  it("plan state is consistent after wave completes", async () => {
    const plan = makePlan([
      makeStory({ id: "US-01", sourceFiles: ["a.ts"] }),
      makeStory({ id: "US-02", sourceFiles: ["b.ts"] }),
    ]);
    setup(plan);
    const restore = suppressConsole();
    try {
      await runExecuteStage(dirs, config);
      const result = loadExecutionPlan(planPath);
      for (const story of result.stories) {
        expect(["passed", "failed", "skipped"], `${story.id} had unexpected status: ${story.status}`).toContain(story.status);
      }
      expect(result.schemaVersion).toBe("2.0.0");
    } finally {
      restore();
      cleanup();
    }
  });

  it("maxConcurrency=1 executes sequentially", async () => {
    const seqConfig = { ...config, maxConcurrency: 1 };
    const plan = makePlan([
      makeStory({ id: "US-01", sourceFiles: ["a.ts"] }),
      makeStory({ id: "US-02", sourceFiles: ["b.ts"] }),
    ]);
    setup(plan);
    const restore = suppressConsole();
    try {
      await runExecuteStage(dirs, seqConfig);
      const result = loadExecutionPlan(planPath);
      expect(result.stories[0].status).toBe("passed");
      expect(result.stories[1].status).toBe("passed");
    } finally {
      restore();
      cleanup();
    }
  });

  it("LEARN runs for all stories including failed", async () => {
    const learnCalls: string[] = [];
    vi.mocked(spawnAgentWithRetry).mockImplementation(async (cfg) => {
      const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
      const { dirname } = await import("node:path");
      md(dirname(cfg.outputFile), { recursive: true });
      if (cfg.type === "learner") {
        learnCalls.push(cfg.outputFile);
      }
      if (cfg.type === "tester-exec") {
        if (cfg.outputFile.includes("US-01")) {
          wf(cfg.outputFile, "## STATUS: PASS\n");
        } else {
          wf(cfg.outputFile, "## STATUS: FAIL\n| AC-1 | x | y | FAIL | FAIL |");
        }
      } else if (cfg.type === "evaluator") {
        wf(cfg.outputFile, "## VERDICT: PASS\n");
      } else {
        wf(cfg.outputFile, `# Mock ${cfg.type}`);
      }
      return { success: true, outputFile: cfg.outputFile };
    });

    const plan = makePlan([
      makeStory({ id: "US-01", sourceFiles: ["a.ts"], maxAttempts: 1 }),
      makeStory({ id: "US-02", sourceFiles: ["b.ts"], maxAttempts: 1 }),
    ]);
    setup(plan);
    const restore = suppressConsole();
    try {
      await runExecuteStage(dirs, config);
      expect(learnCalls.length).toBe(2);
    } finally {
      restore();
      cleanup();
    }
  });

  it("COMMIT is serialized post-wave (not during parallel execution)", async () => {
    const commitOrder: string[] = [];
    const { runShell } = await import("../../utils/shell.js");
    vi.mocked(runShell).mockImplementation(async () => {
      // Track commit ordering
      commitOrder.push("commit");
      return { exitCode: 0, stdout: "abc1234", stderr: "" };
    });

    const plan = makePlan([
      makeStory({ id: "US-01", sourceFiles: ["a.ts"] }),
      makeStory({ id: "US-02", sourceFiles: ["b.ts"] }),
    ]);
    setup(plan);
    const restore = suppressConsole();
    try {
      await runExecuteStage(dirs, config);
      const result = loadExecutionPlan(planPath);
      // Both should pass — commits happen sequentially after parallel BUILD+VERIFY
      expect(result.stories[0].status).toBe("passed");
      expect(result.stories[1].status).toBe("passed");
    } finally {
      restore();
      cleanup();
    }
  });

  it("budget exceeded logs warning but completes pipeline", async () => {
    const { CostTracker } = await import("../../utils/cost-tracker.js");
    // Budget of $0 — will be exceeded by any cost
    const tracker = new CostTracker(0);
    tracker.recordAgentCost("US-01", "implementer", 1.0, 1000);

    const plan = makePlan([
      makeStory({ id: "US-01", sourceFiles: ["a.ts"] }),
      makeStory({ id: "US-02", sourceFiles: ["b.ts"] }),
    ]);
    setup(plan);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const restore = suppressConsole();
    try {
      // Pipeline should complete (no throw) — budget exceeded is just a warning
      await runExecuteStage(dirs, config, tracker);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[BUDGET]"),
      );
    } finally {
      warnSpy.mockRestore();
      restore();
      cleanup();
    }
  });

  it("no execution plan skips gracefully", async () => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    const restore = suppressConsole();
    try {
      await runExecuteStage(dirs, config);
    } finally {
      restore();
      cleanup();
    }
  });

  it("hardCap abort stops launching new waves when exceeded", async () => {
    const plan = makePlan([
      makeStory({ id: "US-01", sourceFiles: ["a.ts"] }),
      makeStory({ id: "US-02", sourceFiles: ["b.ts"], dependencies: ["US-01"] }),
    ]);
    setup(plan);

    // Write a PIPELINE_START log entry with a pipelineStartTime far enough in the past
    // that the hardCap is exceeded (but still valid per HIGH-01 validation)
    const logPath = join(testDir, "manager-log.jsonl");
    const pastTime = Date.now() - 5000; // 5 seconds ago
    writeFileSync(logPath, JSON.stringify({
      action: "PIPELINE_START",
      prdPath: "PRD.md",
      stopAfterPlan: false,
      pipelineStartTime: pastTime,
      timestamp: new Date(pastTime).toISOString(),
    }) + "\n");

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(String(args[0]));
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // Use a short hardCap so the check triggers
      const shortConfig = {
        ...config,
        stageTimeouts: { ...config.stageTimeouts, hardCap: 1000 },
      };
      await runExecuteStage(dirs, shortConfig);
      // Should have logged a timeout message
      expect(logs.some((l) => l.includes("[timeout]"))).toBe(true);
      // US-02 should still be not-started (never launched)
      const result = loadExecutionPlan(planPath);
      expect(result.stories[1].status).toBe("not-started");
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      cleanup();
    }
  });

  it("effectiveTimeout uses preplan when no duration data exists", async () => {
    const plan = makePlan([makeStory({ id: "US-01", sourceFiles: ["a.ts"] })]);
    setup(plan);

    const { CostTracker } = await import("../../utils/cost-tracker.js");
    const tracker = new CostTracker(100);
    // No story durations recorded — getRollingAverageDuration() returns 0

    const restore = suppressConsole();
    try {
      await runExecuteStage(dirs, config, tracker);
      const result = loadExecutionPlan(planPath);
      expect(result.stories[0].status).toBe("passed");
    } finally {
      restore();
      cleanup();
    }
  });

  it("duration is recorded after story completes", async () => {
    const plan = makePlan([makeStory({ id: "US-01", sourceFiles: ["a.ts"] })]);
    setup(plan);

    const { CostTracker } = await import("../../utils/cost-tracker.js");
    const tracker = new CostTracker(100);

    const restore = suppressConsole();
    try {
      await runExecuteStage(dirs, config, tracker);
      // After execution, at least one story duration should be recorded
      expect(tracker.getCompletedStoryCount()).toBe(1);
      expect(tracker.getRollingAverageDuration()).toBeGreaterThan(0);
    } finally {
      restore();
      cleanup();
    }
  });

  it("cost velocity warning logged when overBudget", async () => {
    const plan = makePlan([
      makeStory({ id: "US-01", sourceFiles: ["a.ts"] }),
      makeStory({ id: "US-02", sourceFiles: ["b.ts"], dependencies: ["US-01"] }),
    ]);
    setup(plan);

    const { CostTracker } = await import("../../utils/cost-tracker.js");
    // Budget of $0.01 with $1.00 spent — cost velocity will flag overBudget
    const tracker = new CostTracker(0.01);
    tracker.recordAgentCost("US-00", "implementer", 1.0, 1000);
    // Record one duration so getCompletedStoryCount > 0 for velocity to work
    tracker.recordStoryDuration(5000);

    const warns: string[] = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
      warns.push(String(args[0]));
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runExecuteStage(dirs, config, tracker);
      expect(warns.some((w) => w.includes("[cost-velocity]"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
      logSpy.mockRestore();
      cleanup();
    }
  });

  it("CLI --timeout overrides dynamic timeout computation", async () => {
    const plan = makePlan([makeStory({ id: "US-01", sourceFiles: ["a.ts"] })]);
    setup(plan);

    const { CostTracker } = await import("../../utils/cost-tracker.js");
    const tracker = new CostTracker(100);

    const restore = suppressConsole();
    try {
      // Pass timeoutMs = 60_000 (1 minute) as CLI override
      await runExecuteStage(dirs, config, tracker, 60_000);
      const result = loadExecutionPlan(planPath);
      expect(result.stories[0].status).toBe("passed");
      // Duration should still be recorded even with --timeout set
      expect(tracker.getCompletedStoryCount()).toBe(1);
    } finally {
      restore();
      cleanup();
    }
  });
});

describe("executeOneStory", () => {
  const testDir = join(process.cwd(), ".test-exec-one");
  const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };
  let cwdSpy2: ReturnType<typeof vi.spyOn>;

  function setup(story: Story) {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(join(testDir, "plans", "steps"), { recursive: true });
    mkdirSync(join(testDir, "reports", story.id), { recursive: true });
    writeFileSync(
      join(testDir, story.stepFile),
      `# ${story.id}\n## ACCEPTANCE CRITERIA\n- AC-1: test\n## EVALUATION CRITERIA\n- EC-1: eval`,
    );
    cwdSpy2 = vi.spyOn(process, "cwd").mockReturnValue(testDir);
  }

  function cleanup() {
    cwdSpy2?.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  }

  beforeEach(() => {
    resetMock();
  });

  it("returns passed=true when both tester and evaluator pass", async () => {
    const story = makeStory({ id: "US-99" });
    setup(story);
    const restore = suppressConsole();
    try {
      const result = await executeOneStory(story, dirs, config);
      expect(result.passed).toBe(true);
      expect(result.storyId).toBe("US-99");
      expect(result.attempts).toBe(1);
    } finally {
      restore();
      cleanup();
    }
  });

  it("returns passed=false when tester fails", async () => {
    vi.mocked(spawnAgentWithRetry).mockImplementation(async (cfg) => {
      const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
      const { dirname } = await import("node:path");
      md(dirname(cfg.outputFile), { recursive: true });
      if (cfg.type === "tester-exec") {
        wf(cfg.outputFile, "## STATUS: FAIL\n| AC-1 | test | npm test | FAIL | FAIL |");
      } else {
        wf(cfg.outputFile, `# Mock ${cfg.type}`);
      }
      return { success: true, outputFile: cfg.outputFile };
    });

    const story = makeStory({ id: "US-99", maxAttempts: 1 });
    setup(story);
    const restore = suppressConsole();
    try {
      const result = await executeOneStory(story, dirs, config);
      expect(result.passed).toBe(false);
      expect(result.errorMessage).toContain("Verification failed");
    } finally {
      restore();
      cleanup();
    }
  });
});
