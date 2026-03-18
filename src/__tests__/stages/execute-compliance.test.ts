import { describe, it, expect, vi } from "vitest";
import type { Story } from "../../types/execution-plan.js";

// Track spawn calls
const spawnCalls: Array<{ type: string; inputFiles: string[] }> = [];

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string; inputFiles: string[] }) => {
    spawnCalls.push({ type: config.type, inputFiles: [...config.inputFiles] });
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });

    if (config.type === "compliance-reviewer") {
      writeFileSync(
        config.outputFile,
        `<!-- STATUS: {"result": "PASS", "done": 3, "missing": 0, "uncertain": 0} -->
# Compliance Report: US-99

## Instructions
| # | Instruction | Status | Evidence |
|---|------------|--------|----------|
| 1 | Implement feature | DONE | src/test.ts:1 |
| 2 | Add test | DONE | __tests__/test.ts:1 |
| 3 | Add doc | DONE | src/test.ts:5 |
`,
      );
    } else {
      writeFileSync(config.outputFile, `# Mock ${config.type} report`);
    }
    return { success: true, outputFile: config.outputFile };
  }),
}));

import { runComplianceCheck } from "../../stages/execute-compliance.js";
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

const config = getDefaultConfig();

describe("execute-compliance", () => {
  const testDir = join(process.cwd(), ".test-exec-compliance");
  const dirs: PipelineDirs = { workingDir: testDir, knowledgeDir: testDir, labDir: testDir };

  function setup() {
    spawnCalls.length = 0;
    mkdirSync(join(testDir, "plans", "steps"), { recursive: true });
    mkdirSync(join(testDir, "reports", "US-99"), { recursive: true });
    writeFileSync(
      join(testDir, "plans/steps/US-99-test.md"),
      "# US-99\n## ACCEPTANCE CRITERIA\n- AC-0: test\n## EXIT CRITERIA\n- EC-1: verify",
    );
    writeFileSync(
      join(testDir, "reports/US-99/impl-report.md"),
      "# Impl Report\n## STATUS: PASS",
    );
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("PASS report → passed=true, skipped=false", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = await runComplianceCheck(makeStory(), dirs, config);
      consoleSpy.mockRestore();

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.result).not.toBeNull();
      expect(result.result!.result).toBe("PASS");
      expect(result.result!.done).toBe(3);
    } finally {
      cleanup();
    }
  });

  it("reviewer FAIL → fixer runs → reviewer re-checks → PASS", async () => {
    setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      let reviewerCallCount = 0;
      vi.mocked(mockSpawn).mockImplementation(async (config) => {
        spawnCalls.push({ type: config.type, inputFiles: [...config.inputFiles] });
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });

        if (config.type === "compliance-reviewer") {
          reviewerCallCount++;
          if (reviewerCallCount === 1) {
            // First review: FAIL
            wf(config.outputFile, `<!-- STATUS: {"result": "FAIL", "done": 1, "missing": 2, "uncertain": 0} -->\n# Report`);
          } else {
            // Re-review after fix: PASS
            wf(config.outputFile, `<!-- STATUS: {"result": "PASS", "done": 3, "missing": 0, "uncertain": 0} -->\n# Report`);
          }
        } else if (config.type === "compliance-fixer") {
          wf(config.outputFile, `<!-- STATUS: {"result": "PASS", "itemsFixed": 2, "itemsRemaining": 0} -->\n# Fix Report`);
        } else {
          wf(config.outputFile, `# Mock ${config.type}`);
        }
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = await runComplianceCheck(makeStory(), dirs, config);
      consoleSpy.mockRestore();

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(false);
      // Verify the sequence: reviewer → fixer → reviewer
      const types = spawnCalls.map((c) => c.type);
      expect(types).toEqual(["compliance-reviewer", "compliance-fixer", "compliance-reviewer"]);
    } finally {
      cleanup();
    }
  });

  it("fixer crash → non-fatal, proceed to VERIFY (P39)", async () => {
    setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementation(async (config) => {
        spawnCalls.push({ type: config.type, inputFiles: [...config.inputFiles] });
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });

        if (config.type === "compliance-reviewer") {
          wf(config.outputFile, `<!-- STATUS: {"result": "FAIL", "done": 1, "missing": 2, "uncertain": 0} -->\n# Report`);
        } else if (config.type === "compliance-fixer") {
          throw new Error("Fixer agent crashed");
        }
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await runComplianceCheck(makeStory(), dirs, config);
      consoleSpy.mockRestore();

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Fixer crashed"));
      warnSpy.mockRestore();
    } finally {
      cleanup();
    }
  });

  it("fixer fixes 0 items → skip re-review (F39)", async () => {
    setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementation(async (config) => {
        spawnCalls.push({ type: config.type, inputFiles: [...config.inputFiles] });
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });

        if (config.type === "compliance-reviewer") {
          wf(config.outputFile, `<!-- STATUS: {"result": "FAIL", "done": 1, "missing": 2, "uncertain": 0} -->\n# Report`);
        } else if (config.type === "compliance-fixer") {
          // Fixed 0 items — couldn't implement anything
          wf(config.outputFile, `<!-- STATUS: {"result": "FAIL", "itemsFixed": 0, "itemsRemaining": 2} -->\n# Fix Report`);
        }
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await runComplianceCheck(makeStory(), dirs, config);
      consoleSpy.mockRestore();

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
      // Should NOT have re-run the reviewer (F39)
      const reviewerCalls = spawnCalls.filter((c) => c.type === "compliance-reviewer");
      expect(reviewerCalls.length).toBe(1); // only initial review, no re-review
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No items fixed"));
      warnSpy.mockRestore();
    } finally {
      cleanup();
    }
  });

  it("max 2 fix attempts → exhausted → proceed to VERIFY", async () => {
    setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementation(async (config) => {
        spawnCalls.push({ type: config.type, inputFiles: [...config.inputFiles] });
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });

        if (config.type === "compliance-reviewer") {
          // Always FAIL
          wf(config.outputFile, `<!-- STATUS: {"result": "FAIL", "done": 1, "missing": 2, "uncertain": 0} -->\n# Report`);
        } else if (config.type === "compliance-fixer") {
          // Fix 1 item but 1 remains
          wf(config.outputFile, `<!-- STATUS: {"result": "FAIL", "itemsFixed": 1, "itemsRemaining": 1} -->\n# Fix Report`);
        }
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await runComplianceCheck(makeStory(), dirs, config);
      consoleSpy.mockRestore();

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);

      // Should have: reviewer, fixer, reviewer, fixer, reviewer = 5 total
      const fixerCalls = spawnCalls.filter((c) => c.type === "compliance-fixer");
      expect(fixerCalls.length).toBe(2); // max 2 fix attempts
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Exhausted 2 fix attempts"));
      warnSpy.mockRestore();
    } finally {
      cleanup();
    }
  });

  it("reviewer crash → non-fatal, passed=true, skipped=true (P39)", async () => {
    setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementationOnce(async () => {
        throw new Error("Agent process crashed");
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await runComplianceCheck(makeStory(), dirs, config);
      consoleSpy.mockRestore();

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Agent crashed"));
      warnSpy.mockRestore();
    } finally {
      cleanup();
    }
  });

  it("corrupt output (no STATUS block) → non-fatal, skipped=true (P39)", async () => {
    setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockImplementationOnce(async (config) => {
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });
        wf(config.outputFile, "# Report\nAll looks good, PASS");
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await runComplianceCheck(makeStory(), dirs, config);
      consoleSpy.mockRestore();

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Corrupt output"));
      warnSpy.mockRestore();
    } finally {
      cleanup();
    }
  });

  it("compliance-reviewer gets OUTPUT_TOOLS, compliance-fixer gets DEV_TOOLS (P42)", async () => {
    const { getToolsForAgent } = await import("../../agents/tool-permissions.js");

    const reviewerTools = getToolsForAgent("compliance-reviewer");
    expect(reviewerTools).toContain("Write");
    expect(reviewerTools).toContain("Read");
    expect(reviewerTools).not.toContain("Bash"); // OUTPUT_TOOLS, not DEV

    const fixerTools = getToolsForAgent("compliance-fixer");
    expect(fixerTools).toContain("Write");
    expect(fixerTools).toContain("Edit");
    expect(fixerTools).toContain("Bash"); // DEV_TOOLS = full
  });

  it("compliance-fixer receives compliance-report as input", async () => {
    setup();
    try {
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      let reviewerCallCount = 0;
      vi.mocked(mockSpawn).mockImplementation(async (config) => {
        spawnCalls.push({ type: config.type, inputFiles: [...config.inputFiles] });
        const { writeFileSync: wf, mkdirSync: md } = await import("node:fs");
        const { dirname } = await import("node:path");
        md(dirname(config.outputFile), { recursive: true });

        if (config.type === "compliance-reviewer") {
          reviewerCallCount++;
          if (reviewerCallCount === 1) {
            wf(config.outputFile, `<!-- STATUS: {"result": "FAIL", "done": 1, "missing": 1, "uncertain": 0} -->\n# Report`);
          } else {
            wf(config.outputFile, `<!-- STATUS: {"result": "PASS", "done": 2, "missing": 0, "uncertain": 0} -->\n# Report`);
          }
        } else if (config.type === "compliance-fixer") {
          wf(config.outputFile, `<!-- STATUS: {"result": "PASS", "itemsFixed": 1, "itemsRemaining": 0} -->\n# Fix`);
        }
        return { success: true, outputFile: config.outputFile };
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runComplianceCheck(makeStory(), dirs, config);
      consoleSpy.mockRestore();

      // Verify fixer received compliance-report.md as input
      const fixerCall = spawnCalls.find((c) => c.type === "compliance-fixer");
      expect(fixerCall).toBeDefined();
      expect(fixerCall!.inputFiles.some((f) => f.includes("compliance-report.md"))).toBe(true);
      expect(fixerCall!.inputFiles.some((f) => f.includes("US-99-test.md"))).toBe(true);
    } finally {
      cleanup();
    }
  });
});
