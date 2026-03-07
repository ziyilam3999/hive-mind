import { describe, it, expect, vi } from "vitest";

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { outputFile: string; type: string }) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });
    writeFileSync(config.outputFile, `# Mock output for ${config.type}`);
    return { success: true, outputFile: config.outputFile };
  }),
}));

import { scanForRoleKeywords, shouldActivateRole, runPlanStage } from "../../stages/plan-stage.js";
import { spawnAgentWithRetry } from "../../agents/spawner.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

describe("plan-stage role independence", () => {
  const testDir = join(process.cwd(), ".test-plan-stage");
  const hmDir = join(testDir, ".hive-mind");

  function setup() {
    mkdirSync(join(hmDir, "spec"), { recursive: true });
    writeFileSync(
      join(hmDir, "spec", "SPEC-v1.0.md"),
      "# SPEC\n## Requirements\n- Build a function to export data",
    );
    vi.mocked(spawnAgentWithRetry).mockClear();
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true });
  }

  it("each role is an independent subagent spawn", async () => {
    setup();
    try {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runPlanStage(hmDir);
      consoleSpy.mockRestore();

      const calls = vi.mocked(spawnAgentWithRetry).mock.calls;
      // Filter role agent calls (not synthesizer)
      const roleCalls = calls.filter(
        (c) => !["synthesizer"].includes(c[0].type),
      );

      // Each role agent is a separate spawn call
      expect(roleCalls.length).toBeGreaterThanOrEqual(2);

      // Each receives SPEC as input
      for (const call of roleCalls) {
        expect(call[0].inputFiles.some((f: string) => f.includes("SPEC-v1.0.md"))).toBe(true);
      }
    } finally {
      cleanup();
    }
  });
});
