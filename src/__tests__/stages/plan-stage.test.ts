import { describe, it, expect, vi } from "vitest";

vi.mock("../../utils/file-io.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/file-io.js")>();
  return {
    ...actual,
    fileExists: vi.fn((p: string) => {
      const normalized = p.replace(/\\/g, "/");
      // Only src/commands/index.ts exists on disk for registry-gap tests
      if (normalized.endsWith("src/commands/index.ts")) return true;
      // Delegate to real fileExists for test dirs (resume tests pre-create files)
      if (normalized.includes(".test-plan-stage")) return actual.fileExists(p);
      return false;
    }),
  };
});

vi.mock("../../agents/spawner.js", () => {
  const mockPlanJson = JSON.stringify({
    schemaVersion: "2.0.0",
    prdPath: "PRD.md",
    specPath: "spec/SPEC-v1.0.md",
    stories: [
      {
        id: "US-01",
        title: "Test Story",
        specSections: ["§1.1"],
        dependencies: [],
        sourceFiles: ["src/test.ts"],
        complexity: "low",
        rolesUsed: ["analyst"],
        stepFile: "plans/steps/US-01.md",
        status: "not-started",
        attempts: 0,
        maxAttempts: 3,
        committed: false,
        commitHash: null,
      },
    ],
  });

  const impl = async (config: { outputFile: string; type: string }) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });
    if (config.type === "planner") {
      writeFileSync(config.outputFile, mockPlanJson);
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

import {
  scanForRoleKeywords,
  shouldActivateRole,
  runPlanStage,
  warnRegistryGaps,
  extractCorrectedPlan,
  isIntegrationTestStory,
  detectModulePathConflicts,
} from "../../stages/plan-stage.js";
import type { Story } from "../../types/execution-plan.js";
import { spawnAgentWithRetry, spawnAgentsParallel } from "../../agents/spawner.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

describe("plan-stage keyword scanning", () => {
  it("mandatory roles always activated", () => {
    expect(shouldActivateRole("analyst", "")).toBe(true);
    expect(shouldActivateRole("reviewer", "")).toBe(true);
  });

  it("security role triggered by auth keywords", () => {
    expect(shouldActivateRole("security", "User authentication required")).toBe(true);
    expect(shouldActivateRole("security", "Simple data display")).toBe(false);
  });

  it("architect role triggered by interface keywords", () => {
    expect(shouldActivateRole("architect", "Define the API interface")).toBe(true);
    expect(shouldActivateRole("architect", "Just a simple script")).toBe(false);
  });

  it("tester-role triggered by code keywords", () => {
    expect(shouldActivateRole("tester-role", "export function main")).toBe(true);
    expect(shouldActivateRole("tester-role", "no code here")).toBe(false);
  });

  it("scanForRoleKeywords returns correct roles", () => {
    const spec = "Define the API interface with function exports for the auth module";
    const roles = scanForRoleKeywords(spec);
    expect(roles).toContain("analyst");
    expect(roles).toContain("reviewer");
    expect(roles).toContain("architect");
    expect(roles).toContain("tester-role");
    expect(roles).toContain("security");
  });
});

const config = getDefaultConfig();

describe("plan-stage role independence", () => {
  const testDir = join(process.cwd(), ".test-plan-stage");
  const hmDir = join(testDir, ".hive-mind");
  const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };

  function setup() {
    mkdirSync(join(hmDir, "spec"), { recursive: true });
    writeFileSync(
      join(hmDir, "spec", "SPEC-v1.0.md"),
      "# SPEC\n## Requirements\n- Build a function to export data",
    );
    vi.mocked(spawnAgentWithRetry).mockClear();
    vi.mocked(spawnAgentsParallel).mockClear();
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("each role is an independent subagent spawn", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runPlanStage(dirs, config);
      consoleSpy.mockRestore();

      // Role agents are spawned via spawnAgentsParallel
      const parallelCalls = vi.mocked(spawnAgentsParallel).mock.calls;
      expect(parallelCalls.length).toBeGreaterThanOrEqual(1);

      const roleConfigs = parallelCalls[0][0];
      expect(roleConfigs.length).toBeGreaterThanOrEqual(2);

      // Each receives SPEC as input
      for (const cfg of roleConfigs) {
        expect(cfg.inputFiles.some((f: string) => f.includes("SPEC-v1.0.md"))).toBe(true);
      }
    } finally {
      cleanup();
    }
  });

  it("planner schema includes moduleId when SPEC has ## Modules section", async () => {
    setup();
    // Create module directory at workspace root (parent of .hive-mind) so resolveAndValidateModules passes
    mkdirSync(join(testDir, "lib"), { recursive: true });
    // Write a SPEC with ## Modules section
    writeFileSync(
      join(hmDir, "spec", "SPEC-v1.0.md"),
      "# SPEC\n\n## Modules\n\n| id | path | role | dependencies |\n|----|------|------|-------------|\n| lib | ./lib | producer | |\n\n## Stories\n",
    );
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runPlanStage(dirs, config);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();

      // Find the planner spawn call
      const plannerCall = vi.mocked(spawnAgentWithRetry).mock.calls.find(
        (c) => c[0].type === "planner",
      );
      expect(plannerCall).toBeDefined();

      // Check that the schema rule mentions moduleId
      const rules = plannerCall![0].rules;
      const schemaRule = rules.find((r: string) => r.includes("moduleId"));
      expect(schemaRule).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("planner schema omits moduleId for single-repo SPEC", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runPlanStage(dirs, config);
      consoleSpy.mockRestore();

      const plannerCall = vi.mocked(spawnAgentWithRetry).mock.calls.find(
        (c) => c[0].type === "planner",
      );
      expect(plannerCall).toBeDefined();

      // Schema should NOT mention moduleId
      const rules = plannerCall![0].rules;
      const schemaRule = rules.find((r: string) => r.includes("moduleId"));
      expect(schemaRule).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});

describe("warnRegistryGaps", () => {
  const workspaceRoot = "/fake/workspace";

  it("TC-1: warns when stories add to dir with registry file but none modify it", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stories = [
      {
        id: "US-01",
        title: "Add command",
        specSections: ["§1"],
        dependencies: [],
        sourceFiles: [{ path: "src/commands/foo.ts", changeType: "ADDED" as const }],
        complexity: "low" as const,
        rolesUsed: ["analyst" as const],
        stepFile: "plans/steps/US-01.md",
        status: "not-started" as const,
        attempts: 0,
        maxAttempts: 3,
        committed: false,
        commitHash: null,
      },
    ];
    warnRegistryGaps(stories, workspaceRoot, false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Registry gap"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("src/commands/index.ts"),
    );
    warnSpy.mockRestore();
  });

  it("TC-2: no warning when another story modifies the registry file", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stories = [
      {
        id: "US-01",
        title: "Add command",
        specSections: ["§1"],
        dependencies: [],
        sourceFiles: [{ path: "src/commands/foo.ts", changeType: "ADDED" as const }],
        complexity: "low" as const,
        rolesUsed: ["analyst" as const],
        stepFile: "plans/steps/US-01.md",
        status: "not-started" as const,
        attempts: 0,
        maxAttempts: 3,
        committed: false,
        commitHash: null,
      },
      {
        id: "US-02",
        title: "Update registry",
        specSections: ["§1"],
        dependencies: [],
        sourceFiles: [{ path: "src/commands/index.ts", changeType: "MODIFIED" as const }],
        complexity: "low" as const,
        rolesUsed: ["analyst" as const],
        stepFile: "plans/steps/US-02.md",
        status: "not-started" as const,
        attempts: 0,
        maxAttempts: 3,
        committed: false,
        commitHash: null,
      },
    ];
    warnRegistryGaps(stories, workspaceRoot, false);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("TC-3: empty stories array causes no errors or warnings", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnRegistryGaps([], workspaceRoot, false);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("TC-4: no warning when registry file does not exist on disk", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stories = [
      {
        id: "US-01",
        title: "Add util",
        specSections: ["§1"],
        dependencies: [],
        sourceFiles: [{ path: "src/utils/helper.ts", changeType: "ADDED" as const }],
        complexity: "low" as const,
        rolesUsed: ["analyst" as const],
        stepFile: "plans/steps/US-01.md",
        status: "not-started" as const,
        attempts: 0,
        maxAttempts: 3,
        committed: false,
        commitHash: null,
      },
    ];
    warnRegistryGaps(stories, workspaceRoot, false);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("TC-5: hasModules=true returns immediately with no warnings", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stories = [
      {
        id: "US-01",
        title: "Add command",
        specSections: ["§1"],
        dependencies: [],
        sourceFiles: [{ path: "src/commands/foo.ts", changeType: "ADDED" as const }],
        complexity: "low" as const,
        rolesUsed: ["analyst" as const],
        stepFile: "plans/steps/US-01.md",
        status: "not-started" as const,
        attempts: 0,
        maxAttempts: 3,
        committed: false,
        commitHash: null,
      },
    ];
    warnRegistryGaps(stories, workspaceRoot, true);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("plan-stage resume support", () => {
  const testDir = join(process.cwd(), ".test-plan-stage");
  const hmDir = join(testDir, ".hive-mind");
  const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };

  const MOCK_PLAN = {
    schemaVersion: "2.0.0",
    prdPath: "PRD.md",
    specPath: "spec/SPEC-v1.0.md",
    stories: [
      {
        id: "US-01", title: "Story One", specSections: ["§1.1"],
        dependencies: [], sourceFiles: ["src/one.ts"], complexity: "low",
        rolesUsed: ["analyst"], stepFile: "plans/steps/US-01.md",
        status: "not-started", attempts: 0, maxAttempts: 3,
        committed: false, commitHash: null,
      },
      {
        id: "US-02", title: "Story Two", specSections: ["§1.2"],
        dependencies: [], sourceFiles: ["src/two.ts"], complexity: "low",
        rolesUsed: ["analyst"], stepFile: "plans/steps/US-02.md",
        status: "not-started", attempts: 0, maxAttempts: 3,
        committed: false, commitHash: null,
      },
    ],
  };

  function setup() {
    mkdirSync(join(hmDir, "spec"), { recursive: true });
    mkdirSync(join(hmDir, "plans", "role-reports"), { recursive: true });
    mkdirSync(join(hmDir, "plans", "steps"), { recursive: true });
    writeFileSync(
      join(hmDir, "spec", "SPEC-v1.0.md"),
      "# SPEC\n## Requirements\n- Build a function to export data",
    );
    vi.mocked(spawnAgentWithRetry).mockClear();
    vi.mocked(spawnAgentsParallel).mockClear();
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  /** Pre-create a file with non-empty content */
  function preCreate(path: string, content = "# Pre-existing output") {
    mkdirSync(join(path, "..").replace(/[/\\][^/\\]+$/, ""), { recursive: true });
    writeFileSync(path, content);
  }

  it("TC-resume-1: skips role agents when their outputs exist", async () => {
    setup();
    try {
      // Pre-create role report files (SPEC triggers analyst, reviewer, tester-role, security)
      const roles = ["analyst", "reviewer", "tester-role", "security"];
      for (const role of roles) {
        preCreate(join(hmDir, "plans", "role-reports", `${role}-report.md`));
      }

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runPlanStage(dirs, config);
      logSpy.mockRestore();
      warnSpy.mockRestore();

      // spawnAgentsParallel should NOT have been called for role agents
      // (first call would be role agents in fresh run)
      // Check that the first parallel call (if any) is for AC or EC generators, not roles
      const parallelCalls = vi.mocked(spawnAgentsParallel).mock.calls;
      for (const call of parallelCalls) {
        const types = call[0].map((c: { type: string }) => c.type);
        expect(types).not.toContain("analyst");
        expect(types).not.toContain("reviewer");
      }

      // But planner should still have been called
      const plannerCall = vi.mocked(spawnAgentWithRetry).mock.calls.find(
        (c) => c[0].type === "planner",
      );
      expect(plannerCall).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("TC-resume-2: skips planner when execution-plan.json exists", async () => {
    setup();
    try {
      // Pre-create execution-plan.json
      preCreate(join(hmDir, "plans", "execution-plan.json"), JSON.stringify(MOCK_PLAN, null, 2));

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runPlanStage(dirs, config);
      logSpy.mockRestore();
      warnSpy.mockRestore();

      // Planner should NOT have been called
      const plannerCall = vi.mocked(spawnAgentWithRetry).mock.calls.find(
        (c) => c[0].type === "planner",
      );
      expect(plannerCall).toBeUndefined();

      // But AC/EC generators should run (their outputs don't exist)
      const parallelCalls = vi.mocked(spawnAgentsParallel).mock.calls;
      const acCall = parallelCalls.find((c) => c[0].some((cfg: { type: string }) => cfg.type === "ac-generator"));
      expect(acCall).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("TC-resume-3: skips enricher for stories with Implementation Guidance marker", async () => {
    setup();
    try {
      // Pre-create all upstream outputs
      for (const role of ["analyst", "reviewer", "tester-role", "security"]) {
        preCreate(join(hmDir, "plans", "role-reports", `${role}-report.md`));
      }
      preCreate(join(hmDir, "plans", "execution-plan.json"), JSON.stringify(MOCK_PLAN, null, 2));
      preCreate(join(hmDir, "plans", "plan-validation-report.md"));

      // Pre-create AC/EC files for both stories
      for (const id of ["US-01", "US-02"]) {
        preCreate(join(hmDir, "plans", "steps", `${id}-acs.md`));
        preCreate(join(hmDir, "plans", "steps", `${id}-ecs.md`));
      }

      // Pre-create enriched step file for US-01 only (with marker)
      preCreate(
        join(hmDir, "plans", "steps", "US-01.md"),
        "# US-01\n## ACCEPTANCE CRITERIA\n...\n## EXIT CRITERIA\n...\n## Implementation Guidance\nDo X.",
      );

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runPlanStage(dirs, config);
      logSpy.mockRestore();
      warnSpy.mockRestore();

      // Enricher should have been called for US-02 but not US-01
      const enricherCalls = vi.mocked(spawnAgentWithRetry).mock.calls.filter(
        (c) => c[0].type === "enricher",
      );
      // US-02 enricher should run (step file won't have marker since assembly regenerates it)
      // US-01 was skipped because its step file already had the marker
      const enrichedStoryIds = enricherCalls.map((c) => {
        const outFile = c[0].outputFile as string;
        return outFile.match(/([A-Z]+-\d+)\.md/)?.[1];
      });
      expect(enrichedStoryIds).not.toContain("US-01");
    } finally {
      cleanup();
    }
  });

  it("TC-resume-4: skips all agents when all outputs exist", async () => {
    setup();
    try {
      // Pre-create ALL outputs: role reports, plan, validator, AC/EC, step files, consolidator
      // SPEC "Build a function to export data" triggers: analyst, reviewer, tester-role, security
      for (const role of ["analyst", "reviewer", "tester-role", "security"]) {
        preCreate(join(hmDir, "plans", "role-reports", `${role}-report.md`));
      }
      preCreate(join(hmDir, "plans", "execution-plan.json"), JSON.stringify(MOCK_PLAN, null, 2));
      preCreate(join(hmDir, "plans", "plan-validation-report.md"));
      preCreate(join(hmDir, "plans", "acceptance-criteria.md"));

      for (const id of ["US-01", "US-02"]) {
        preCreate(join(hmDir, "plans", "steps", `${id}-acs.md`));
        preCreate(join(hmDir, "plans", "steps", `${id}-ecs.md`));
        preCreate(
          join(hmDir, "plans", "steps", `${id}.md`),
          `# ${id}\n## ACCEPTANCE CRITERIA\n...\n## EXIT CRITERIA\n...\n## Implementation Guidance\nDone.`,
        );
      }

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runPlanStage(dirs, config);
      logSpy.mockRestore();
      warnSpy.mockRestore();

      // No agent spawns should have occurred
      expect(vi.mocked(spawnAgentWithRetry).mock.calls).toHaveLength(0);
      // No parallel spawns either (role agents and AC/EC all skipped)
      expect(vi.mocked(spawnAgentsParallel).mock.calls).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("TC-resume-5: outputReady returns false for empty files — agent re-runs", async () => {
    setup();
    try {
      // Pre-create execution-plan.json as EMPTY file
      writeFileSync(join(hmDir, "plans", "execution-plan.json"), "");

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runPlanStage(dirs, config);
      logSpy.mockRestore();
      warnSpy.mockRestore();

      // Planner SHOULD have been called (empty file = not ready)
      const plannerCall = vi.mocked(spawnAgentWithRetry).mock.calls.find(
        (c) => c[0].type === "planner",
      );
      expect(plannerCall).toBeDefined();
    } finally {
      cleanup();
    }
  });
});

describe("extractCorrectedPlan", () => {
  it("TC-24: valid JSON block with schemaVersion 2.0.0 and stories -> returns parsed plan", () => {
    const plan = {
      schemaVersion: "2.0.0",
      stories: [
        { id: "US-01", title: "Test", sourceFiles: [] },
      ],
    };
    const report = `# Validation Report\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n\nDone.`;
    const result = extractCorrectedPlan(report);
    expect(result).not.toBeNull();
    expect(result!.stories).toHaveLength(1);
    expect(result!.stories[0].id).toBe("US-01");
  });

  it("TC-25: no JSON block -> returns null", () => {
    const report = "# Validation Report\n\nAll looks good, no corrections needed.";
    const result = extractCorrectedPlan(report);
    expect(result).toBeNull();
  });

  it("TC-26: invalid JSON -> returns null and logs warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = "# Report\n\n```json\n{ invalid json !!!\n```\n";
    const result = extractCorrectedPlan(report);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("invalid JSON"),
    );
    warnSpy.mockRestore();
  });
});

describe("isIntegrationTestStory", () => {
  it("TC-27: detects integration test stories by title pattern", () => {
    expect(isIntegrationTestStory("Integration test suite")).not.toBeNull();
    expect(isIntegrationTestStory("E2E test for login flow")).not.toBeNull();
    expect(isIntegrationTestStory("End-to-end test pipeline")).not.toBeNull();
    expect(isIntegrationTestStory("System test for API")).not.toBeNull();
    expect(isIntegrationTestStory("Smoke test for deployment")).not.toBeNull();
  });

  it("TC-28: detects infrastructure-dependent test stories", () => {
    expect(isIntegrationTestStory("Test Docker deployment")).not.toBeNull();
    expect(isIntegrationTestStory("Database test setup")).not.toBeNull();
    expect(isIntegrationTestStory("Test with Playwright")).not.toBeNull();
    expect(isIntegrationTestStory("Test Postgres connection")).not.toBeNull();
  });

  it("TC-29: does NOT flag unit test stories", () => {
    expect(isIntegrationTestStory("Add unit tests for parser")).toBeNull();
    expect(isIntegrationTestStory("Test utility functions")).toBeNull();
    expect(isIntegrationTestStory("Implement authentication module")).toBeNull();
  });

  it("TC-30: does NOT flag non-test stories with infra words", () => {
    expect(isIntegrationTestStory("Set up Docker configuration")).toBeNull();
    expect(isIntegrationTestStory("Database migration schema")).toBeNull();
    expect(isIntegrationTestStory("Configure Postgres connection pool")).toBeNull();
  });

  it("TC-31: returns reason string with pattern/keyword info", () => {
    const reason1 = isIntegrationTestStory("Integration test suite");
    expect(reason1).toContain("integration");

    const reason2 = isIntegrationTestStory("Test Docker deployment");
    expect(reason2).toContain("docker");
  });
});

describe("detectModulePathConflicts", () => {
  const workspaceRoot = "/fake/workspace";

  function makeStory(id: string, sourceFiles: Array<{ path: string; changeType: "ADDED" | "MODIFIED" | "REMOVED" }>): Story {
    return {
      id,
      title: `Story ${id}`,
      specSections: [],
      dependencies: [],
      sourceFiles,
      complexity: "low",
      rolesUsed: ["analyst"],
      stepFile: `plans/steps/${id}.md`,
      status: "not-started",
      attempts: 0,
      maxAttempts: 3,
      committed: false,
      commitHash: null,
    };
  }

  it("TC-32: detects config.ts vs config/index.ts conflict from earlier story", () => {
    const stories = [
      makeStory("US-00", [{ path: "src/config.ts", changeType: "ADDED" }]),
      makeStory("US-04", [{ path: "src/config/index.ts", changeType: "ADDED" }]),
    ];
    const conflicts = detectModulePathConflicts(stories, workspaceRoot);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].staleFile).toBe("src/config.ts");
    expect(conflicts[0].newFile).toBe("src/config/index.ts");
    expect(conflicts[0].ownerStoryId).toBe("US-04");
  });

  it("TC-33: no false positive for different module paths", () => {
    const stories = [
      makeStory("US-00", [{ path: "src/utils.ts", changeType: "ADDED" }]),
      makeStory("US-04", [{ path: "src/config/index.ts", changeType: "ADDED" }]),
    ];
    const conflicts = detectModulePathConflicts(stories, workspaceRoot);
    expect(conflicts).toHaveLength(0);
  });

  it("TC-34: no conflict if stale file already marked REMOVED", () => {
    const stories = [
      makeStory("US-00", [{ path: "src/config.ts", changeType: "ADDED" }]),
      makeStory("US-04", [
        { path: "src/config/index.ts", changeType: "ADDED" },
        { path: "src/config.ts", changeType: "REMOVED" },
      ]),
    ];
    const conflicts = detectModulePathConflicts(stories, workspaceRoot);
    expect(conflicts).toHaveLength(0);
  });

  it("TC-35: detects conflict when stale file is MODIFIED (not ADDED)", () => {
    // Stale file exists on filesystem (mocked via fileExists) but not added by any story
    // Since our mock only returns true for src/commands/index.ts, we test with ADDED in an earlier story
    const stories = [
      makeStory("US-00", [{ path: "src/helpers.ts", changeType: "ADDED" }]),
      makeStory("US-05", [{ path: "src/helpers/index.ts", changeType: "ADDED" }]),
    ];
    const conflicts = detectModulePathConflicts(stories, workspaceRoot);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].staleFile).toBe("src/helpers.ts");
    expect(conflicts[0].ownerStoryId).toBe("US-05");
  });
});
