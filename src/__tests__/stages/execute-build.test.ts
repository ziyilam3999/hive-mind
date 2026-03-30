import { describe, it, expect, vi } from "vitest";
import type { Story } from "../../types/execution-plan.js";
import { BuildPipelineError } from "../../utils/errors.js";

// Track tsc mock behavior — default: pass (no typescript dep detected)
let tscMockError: Error | null = null;

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: (...args: unknown[]) => {
      const cmdArgs = args[1] as string[];
      const cb = args[args.length - 1] as (err: Error | null, stdout: string, stderr: string) => void;
      if (cmdArgs?.[0] === "tsc" && tscMockError) {
        cb(tscMockError, "", "");
        return;
      }
      // For non-tsc calls, use real execFile
      return actual.execFile(...(args as Parameters<typeof actual.execFile>));
    },
  };
});

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string; cwd?: string }) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });
    writeFileSync(config.outputFile, `# Mock ${config.type} report`);
    // Simulate implementer creating source files on disk
    if (config.type === "implementer") {
      const targetDir = config.cwd ?? dirname(dirname(config.outputFile));
      const srcDir = join(targetDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "test.ts"), "// mock source file");
    }
    return { success: true, outputFile: config.outputFile };
  }),
}));

import { runBuild } from "../../stages/execute-build.js";
import { spawnAgentWithRetry } from "../../agents/spawner.js";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

const testStory: Story = {
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
};

const config = getDefaultConfig();

describe("execute-build", () => {
  const testDir = join(process.cwd(), ".test-exec-build");
  const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  function setup() {
    mkdirSync(join(testDir, "plans", "steps"), { recursive: true });
    // Pre-create source files so the post-BUILD file existence gate passes
    mkdirSync(join(testDir, "src"), { recursive: true });
    writeFileSync(join(testDir, "src", "test.ts"), "// mock source");
    writeFileSync(
      join(testDir, testStory.stepFile),
      "# US-99: Test Story\n## OUTPUT\nsrc/test.ts\n## ACCEPTANCE CRITERIA\n- AC-0: lint",
    );
    // Sandbox process.cwd() so cwd fallback resolves to testDir
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testDir);
    vi.mocked(spawnAgentWithRetry).mockClear();
  }

  function cleanup() {
    cwdSpy?.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  }

  it("implementer receives step file as input (P16)", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, dirs, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const implCall = calls.find((c) => c[0].type === "implementer");
      expect(implCall).toBeDefined();
      expect(implCall![0].inputFiles).toEqual([join(testDir, testStory.stepFile)]);
    } finally {
      cleanup();
    }
  });

  it("reports written to reports/{storyId}/ directory", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = await runBuild(testStory, dirs, config);
      consoleSpy.mockRestore();

      expect(result.implReportPath).toMatch(/reports[/\\]US-99[/\\]impl-report\.md/);
      expect(result.refactorReportPath).toMatch(/reports[/\\]US-99[/\\]refactor-report\.md/);
      expect(existsSync(result.implReportPath)).toBe(true);
      expect(existsSync(result.refactorReportPath)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("implementer prompt includes OUTPUT-CONTRACT rule", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, dirs, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const implCall = calls.find((c) => c[0].type === "implementer");
      expect(implCall![0].rules.some((r: string) => r.includes("OUTPUT-CONTRACT"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("roleReportsDir threaded — role-report content in agent config", async () => {
    setup();
    // Create role-reports directory with an analyst report
    const roleReportsDir = join(testDir, "plans", "role-reports");
    mkdirSync(roleReportsDir, { recursive: true });
    writeFileSync(join(roleReportsDir, "analyst-report.md"), "# Analyst findings");
    writeFileSync(join(roleReportsDir, "architect-report.md"), "# Architect findings");

    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, dirs, config, undefined, roleReportsDir);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const implCall = calls.find((c) => c[0].type === "implementer");
      // implementer maps to ["architect", "security", "analyst"] but story only has rolesUsed: ["analyst"]
      expect(implCall![0].roleReportContents).toBeDefined();
      expect(implCall![0].roleReportContents).toContain("analyst");
    } finally {
      cleanup();
    }
  });

  it("missing roleReportsDir — no injection (backward compatible)", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, dirs, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const implCall = calls.find((c) => c[0].type === "implementer");
      expect(implCall![0].roleReportContents).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("moduleCwd forwarded to agent configs", async () => {
    setup();
    const extDir = join(process.cwd(), ".test-exec-build-ext");
    mkdirSync(extDir, { recursive: true });
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, dirs, config, undefined, undefined, undefined, extDir);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const implCall = calls.find((c) => c[0].type === "implementer");
      const refactorCall = calls.find((c) => c[0].type === "refactorer");
      expect(implCall![0].cwd).toBe(extDir);
      expect(refactorCall![0].cwd).toBe(extDir);
    } finally {
      cleanup();
      rmSync(extDir, { recursive: true, force: true });
    }
  });

  it("undefined moduleCwd — cwd defaults to process.cwd()", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, dirs, config);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const implCall = calls.find((c) => c[0].type === "implementer");
      const refactorCall = calls.find((c) => c[0].type === "refactorer");
      // With fix: cwd falls back to process.cwd() (spied to testDir), not undefined
      expect(implCall).toBeDefined();
      expect(refactorCall).toBeDefined();
      expect(implCall![0].cwd).toBe(testDir);
      expect(refactorCall![0].cwd).toBe(testDir);
    } finally {
      cleanup();
    }
  });

  it("sourceFiles resolved against moduleCwd when present", async () => {
    setup();
    const extDir = join(process.cwd(), ".test-exec-build-ext2");
    mkdirSync(extDir, { recursive: true });
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runBuild(testStory, dirs, config, undefined, undefined, undefined, extDir);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      const refactorCall = calls.find((c) => c[0].type === "refactorer");
      // sourceFiles should be joined with moduleCwd, not hiveMindDir
      expect(refactorCall![0].inputFiles[0]).toBe(join(extDir, "src/test.ts"));
    } finally {
      cleanup();
      rmSync(extDir, { recursive: true, force: true });
    }
  });

  it("TC7: tsc gate passes when all errors are in foreign files", async () => {
    setup();
    // Add package.json with typescript dep so tsc gate activates
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }));
    // Mock tsc to fail with errors only in files outside story scope
    const foreignError = Object.assign(new Error("tsc failed"), {
      stdout: "src/other.ts(3,5): error TS2304: Cannot find name 'X'.\nsrc/another.ts(1,1): error TS1005: ';' expected.",
      stderr: "",
      code: 2,
    });
    tscMockError = foreignError;
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      // Should NOT throw — foreign errors are ignored
      await runBuild(testStory, dirs, config);
      consoleSpy.mockRestore();
      debugSpy.mockRestore();
    } finally {
      tscMockError = null;
      cleanup();
    }
  });

  it("TC8: tsc gate throws when errors are in owned files", async () => {
    setup();
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }));
    // Mock tsc to fail with errors in story's owned file (src/test.ts)
    const ownedError = Object.assign(new Error("tsc failed"), {
      stdout: "src/test.ts(3,5): error TS2304: Cannot find name 'X'.",
      stderr: "",
      code: 2,
    });
    tscMockError = ownedError;
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await expect(runBuild(testStory, dirs, config)).rejects.toThrow(BuildPipelineError);
      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    } finally {
      tscMockError = null;
      cleanup();
    }
  });
});
