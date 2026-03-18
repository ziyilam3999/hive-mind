import { describe, it, expect, vi } from "vitest";
// Track spawned agent types
const spawnedTypes: string[] = [];

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { type: string; outputFile: string; inputFiles: string[] }) => {
    spawnedTypes.push(config.type);
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });

    if (config.type === "decomposer") {
      // Valid decomposer output matching the contract
      writeFileSync(config.outputFile, JSON.stringify({
        subTasks: [
          { id: "US-01.1", title: "Types", description: "Define type interfaces", sourceFiles: ["src/a.ts"] },
          { id: "US-01.2", title: "Logic", description: "Implement logic", sourceFiles: ["src/b.ts"] },
          { id: "US-01.3", title: "Utils", description: "Add utilities", sourceFiles: ["src/c.ts"] },
        ],
      }));
    } else {
      writeFileSync(config.outputFile, `# Mock ${config.type}`);
    }
    return { success: true, outputFile: config.outputFile };
  }),
  spawnAgentsParallel: vi.fn(async (configs: Array<{ outputFile: string; type: string }>) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    return configs.map((c) => {
      spawnedTypes.push(c.type);
      mkdirSync(dirname(c.outputFile), { recursive: true });
      writeFileSync(c.outputFile, `# Mock ${c.type}`);
      return { success: true, outputFile: c.outputFile };
    });
  }),
}));

import { runPlanStage } from "../../stages/plan-stage.js";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import { getAgentRules } from "../../agents/prompts.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

const config = getDefaultConfig();

describe("plan-stage decomposition (FW-01)", () => {
  const testDir = join(process.cwd(), ".test-plan-subtask");
  const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };

  function setup() {
    spawnedTypes.length = 0;
    mkdirSync(join(testDir, "spec"), { recursive: true });
    mkdirSync(join(testDir, "plans", "steps"), { recursive: true });
    writeFileSync(join(testDir, "memory.md"), "");
    // SPEC must contain keywords to activate roles
    writeFileSync(join(testDir, "spec", "SPEC-v1.0.md"), "# SPEC\n## §1 Auth module\nHandle authentication tokens.");
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("high-complexity story triggers decomposer after enrichment", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Override planner mock to produce a high-complexity story
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementation(async (cfg) => {
        spawnedTypes.push(cfg.type);
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(cfg.outputFile), { recursive: true });

        if (cfg.type === "planner") {
          wf(cfg.outputFile, JSON.stringify({
            schemaVersion: "2.0.0", prdPath: "PRD.md", specPath: "spec/SPEC-v1.0.md",
            stories: [{
              id: "US-01", title: "Complex", specSections: ["§1"], dependencies: [],
              sourceFiles: ["src/a.ts", "src/b.ts", "src/c.ts"], complexity: "high",
              rolesUsed: ["analyst"], stepFile: "plans/steps/US-01.md",
              status: "not-started", attempts: 0, maxAttempts: 3, committed: false, commitHash: null,
            }],
          }));
        } else if (cfg.type === "decomposer") {
          wf(cfg.outputFile, JSON.stringify({
            subTasks: [
              { id: "US-01.1", title: "Types", description: "Define types", sourceFiles: ["src/a.ts"] },
              { id: "US-01.2", title: "Logic", description: "Implement logic", sourceFiles: ["src/b.ts"] },
              { id: "US-01.3", title: "Utils", description: "Add utilities", sourceFiles: ["src/c.ts"] },
            ],
          }));
        } else {
          wf(cfg.outputFile, `# Mock ${cfg.type}`);
        }
        return { success: true, outputFile: cfg.outputFile };
      });

      await runPlanStage(dirs, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      // Decomposer should have been spawned
      expect(spawnedTypes).toContain("decomposer");

      // Verify enricher runs before decomposer in spawn sequence
      const enricherIdx = spawnedTypes.lastIndexOf("enricher");
      const decomposerIdx = spawnedTypes.indexOf("decomposer");
      expect(enricherIdx).toBeLessThan(decomposerIdx);

      // Plan should contain sub-tasks
      const planPath = join(testDir, "plans", "execution-plan.json");
      const plan = JSON.parse(readFileSync(planPath, "utf8"));
      expect(plan.stories[0].subTasks).toBeDefined();
      expect(plan.stories[0].subTasks.length).toBe(3);
      expect(plan.stories[0].subTasks[0].maxAttempts).toBe(3); // defaults to story's maxAttempts
    } finally {
      cleanup();
    }
  });

  it("low/medium complexity stories are NOT decomposed", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Override planner mock to produce only low-complexity stories
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementation(async (cfg) => {
        spawnedTypes.push(cfg.type);
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(cfg.outputFile), { recursive: true });

        if (cfg.type === "planner") {
          wf(cfg.outputFile, JSON.stringify({
            schemaVersion: "2.0.0", prdPath: "PRD.md", specPath: "spec/SPEC-v1.0.md",
            stories: [{
              id: "US-01", title: "Simple", specSections: ["§1"], dependencies: [],
              sourceFiles: ["src/a.ts"], complexity: "low", rolesUsed: ["analyst"],
              stepFile: "plans/steps/US-01.md", status: "not-started",
              attempts: 0, maxAttempts: 3, committed: false, commitHash: null,
            }],
          }));
        } else {
          wf(cfg.outputFile, `# Mock ${cfg.type}`);
        }
        return { success: true, outputFile: cfg.outputFile };
      });

      await runPlanStage(dirs, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      // Decomposer should NOT have been spawned
      expect(spawnedTypes).not.toContain("decomposer");
    } finally {
      cleanup();
    }
  });

  it("decomposer failure is non-fatal (P39) — story proceeds without sub-tasks", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementation(async (cfg) => {
        spawnedTypes.push(cfg.type);
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(cfg.outputFile), { recursive: true });

        if (cfg.type === "planner") {
          wf(cfg.outputFile, JSON.stringify({
            schemaVersion: "2.0.0", prdPath: "PRD.md", specPath: "spec/SPEC-v1.0.md",
            stories: [{
              id: "US-01", title: "Complex", specSections: ["§1"], dependencies: [],
              sourceFiles: ["src/a.ts", "src/b.ts", "src/c.ts"], complexity: "high",
              rolesUsed: ["analyst"], stepFile: "plans/steps/US-01.md",
              status: "not-started", attempts: 0, maxAttempts: 3, committed: false, commitHash: null,
            }],
          }));
        } else if (cfg.type === "decomposer") {
          throw new Error("Decomposer crashed!");
        } else {
          wf(cfg.outputFile, `# Mock ${cfg.type}`);
        }
        return { success: true, outputFile: cfg.outputFile };
      });

      // Should NOT throw — decomposer failure is non-fatal
      await runPlanStage(dirs, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      // Plan should exist without sub-tasks
      const planPath = join(testDir, "plans", "execution-plan.json");
      const plan = JSON.parse(readFileSync(planPath, "utf8"));
      expect(plan.stories[0].subTasks).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("decomposer invalid JSON output is non-fatal (P44)", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementation(async (cfg) => {
        spawnedTypes.push(cfg.type);
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(cfg.outputFile), { recursive: true });

        if (cfg.type === "planner") {
          wf(cfg.outputFile, JSON.stringify({
            schemaVersion: "2.0.0", prdPath: "PRD.md", specPath: "spec/SPEC-v1.0.md",
            stories: [{
              id: "US-01", title: "Complex", specSections: ["§1"], dependencies: [],
              sourceFiles: ["src/a.ts", "src/b.ts", "src/c.ts"], complexity: "high",
              rolesUsed: ["analyst"], stepFile: "plans/steps/US-01.md",
              status: "not-started", attempts: 0, maxAttempts: 3, committed: false, commitHash: null,
            }],
          }));
        } else if (cfg.type === "decomposer") {
          // Write invalid JSON
          wf(cfg.outputFile, "not valid json {{{");
        } else {
          wf(cfg.outputFile, `# Mock ${cfg.type}`);
        }
        return { success: true, outputFile: cfg.outputFile };
      });

      // Should NOT throw
      await runPlanStage(dirs, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      // Plan should exist without sub-tasks
      const planPath = join(testDir, "plans", "execution-plan.json");
      const plan = JSON.parse(readFileSync(planPath, "utf8"));
      expect(plan.stories[0].subTasks).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("decomposer has correct rules", () => {
    const rules = getAgentRules("decomposer");
    expect(rules.some((r) => r.includes("FILE-BOUNDARY"))).toBe(true);
    expect(rules.some((r) => r.includes("SCOPE-SPLIT"))).toBe(true);
    expect(rules.some((r) => r.includes("STRUCTURED-OUTPUT"))).toBe(true);
    expect(rules.some((r) => r.includes("COMPLETE-COVERAGE"))).toBe(true);
  });
});
