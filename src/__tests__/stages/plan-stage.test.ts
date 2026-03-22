import { describe, it, expect, vi } from "vitest";

vi.mock("../../utils/file-io.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/file-io.js")>();
  return {
    ...actual,
    fileExists: vi.fn((p: string) => {
      const normalized = p.replace(/\\/g, "/");
      // Only src/commands/index.ts exists on disk for registry-gap tests
      if (normalized.endsWith("src/commands/index.ts")) return true;
      // Let plan-stage's own fileExists calls for execution-plan.json pass
      if (normalized.endsWith("execution-plan.json")) return actual.fileExists(p);
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
} from "../../stages/plan-stage.js";
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
