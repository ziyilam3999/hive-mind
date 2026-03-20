import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

const mockSpawnParallel = vi.fn();

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentsParallel: (...args: unknown[]) => mockSpawnParallel(...args),
}));

const config = getDefaultConfig();

describe("scorecard", () => {
  const testDir = join(process.cwd(), ".test-scorecard");
  const hmDir = join(testDir, ".hive-mind");
  const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };

  beforeEach(() => {
    vi.clearAllMocks();
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(join(hmDir, "normalize"), { recursive: true });
    mkdirSync(join(hmDir, "spec"), { recursive: true });
    mkdirSync(join(hmDir, "plans"), { recursive: true });
    writeFileSync(join(hmDir, "memory.md"), "# Memory");
    mockSpawnParallel.mockResolvedValue([{ success: true, outputFile: "" }]);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("normalize: spawns scorecard agent with normalized-prd.md as input", async () => {
    writeFileSync(join(hmDir, "normalize", "normalized-prd.md"), "# Normalized PRD");

    const { runScorecard } = await import("../../stages/scorecard.js");
    await runScorecard("normalize", dirs, config);

    expect(mockSpawnParallel).toHaveBeenCalledOnce();
    const [configs] = mockSpawnParallel.mock.calls[0];
    expect(configs).toHaveLength(1);
    expect(configs[0].type).toBe("scorecard");
    expect(configs[0].model).toBe("haiku");
    expect(configs[0].inputFiles).toContain(join(hmDir, "normalize", "normalized-prd.md"));
  });

  it("plan: includes execution-plan.json", async () => {
    writeFileSync(join(hmDir, "plans", "execution-plan.json"), "{}");

    const { runScorecard } = await import("../../stages/scorecard.js");
    await runScorecard("plan", dirs, config);

    const [configs] = mockSpawnParallel.mock.calls[0];
    expect(configs[0].inputFiles).toContain(join(hmDir, "plans", "execution-plan.json"));
  });

  it("execute-wave: includes plan + cost-log + manager-log", async () => {
    writeFileSync(join(hmDir, "plans", "execution-plan.json"), "{}");
    writeFileSync(join(hmDir, "cost-log.jsonl"), "{}");
    writeFileSync(join(hmDir, "manager-log.jsonl"), "{}");

    const { runScorecard } = await import("../../stages/scorecard.js");
    await runScorecard("execute-wave", dirs, config);

    const [configs] = mockSpawnParallel.mock.calls[0];
    expect(configs[0].inputFiles).toContain(join(hmDir, "plans", "execution-plan.json"));
    expect(configs[0].inputFiles).toContain(join(hmDir, "cost-log.jsonl"));
    expect(configs[0].inputFiles).toContain(join(hmDir, "manager-log.jsonl"));
  });

  it("report: includes all report artifacts and FINAL stage instruction", async () => {
    writeFileSync(join(hmDir, "plans", "execution-plan.json"), "{}");
    writeFileSync(join(hmDir, "consolidated-report.md"), "# Report");
    writeFileSync(join(hmDir, "timing-report.md"), "# Timing");

    const { runScorecard } = await import("../../stages/scorecard.js");
    await runScorecard("report", dirs, config);

    const [configs] = mockSpawnParallel.mock.calls[0];
    expect(configs[0].inputFiles).toContain(join(hmDir, "plans", "execution-plan.json"));
    expect(configs[0].inputFiles).toContain(join(hmDir, "consolidated-report.md"));
    expect(configs[0].inputFiles).toContain(join(hmDir, "timing-report.md"));
    expect(configs[0].instructionBlocks[0].content).toContain("FINAL stage");
  });

  it("prior report-card.md is always included when it exists", async () => {
    writeFileSync(join(hmDir, "report-card.md"), "# Prior report card");
    writeFileSync(join(hmDir, "normalize", "normalized-prd.md"), "# Normalized PRD");

    const { runScorecard } = await import("../../stages/scorecard.js");
    await runScorecard("normalize", dirs, config);

    const [configs] = mockSpawnParallel.mock.calls[0];
    expect(configs[0].inputFiles).toContain(join(hmDir, "report-card.md"));
  });

  it("skips gracefully when no input files available", async () => {
    const consoleSpy = vi.spyOn(console, "log");

    const { runScorecard } = await import("../../stages/scorecard.js");
    await runScorecard("normalize", dirs, config);

    expect(mockSpawnParallel).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("skipping"));
    consoleSpy.mockRestore();
  });

  it("extraContext is included in instruction block", async () => {
    writeFileSync(join(hmDir, "plans", "execution-plan.json"), "{}");
    writeFileSync(join(hmDir, "cost-log.jsonl"), "{}");

    const { runScorecard } = await import("../../stages/scorecard.js");
    await runScorecard("execute-wave", dirs, config, "Wave 2 of 4 just completed.");

    const [configs] = mockSpawnParallel.mock.calls[0];
    expect(configs[0].instructionBlocks[0].content).toContain("Wave 2 of 4 just completed.");
  });
});
