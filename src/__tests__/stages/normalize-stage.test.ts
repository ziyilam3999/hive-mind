import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";

const mockSpawn = vi.fn();

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: (...args: unknown[]) => mockSpawn(...args),
}));

vi.mock("../../memory/memory-manager.js", () => ({
  readMemory: vi.fn(() => "# Memory"),
  createMemoryFromTemplate: vi.fn(),
}));

vi.mock("../../config/loader.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../config/loader.js")>();
  return {
    ...original,
    loadConstitution: vi.fn(() => "# Constitution content"),
  };
});

const config = getDefaultConfig();

describe("normalize-stage", () => {
  const testDir = join(process.cwd(), ".test-normalize-stage");
  const hmDir = join(testDir, ".hive-mind");
  const dirs: PipelineDirs = { workingDir: hmDir, knowledgeDir: hmDir, labDir: hmDir };
  const prdPath = join(testDir, "PRD.md");

  beforeEach(() => {
    vi.clearAllMocks();
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    writeFileSync(prdPath, "# Test PRD\nSome content");
    mockSpawn.mockResolvedValue({ success: true, outputFile: join(hmDir, "normalize", "normalized-prd.md") });
  });

  it("spawns normalizer agent with correct config", async () => {
    const { runNormalizeStage } = await import("../../stages/normalize-stage.js");
    await runNormalizeStage(prdPath, dirs, config);

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [agentConfig] = mockSpawn.mock.calls[0];
    expect(agentConfig.type).toBe("normalizer");
    expect(agentConfig.model).toBe("sonnet");
    expect(agentConfig.inputFiles).toEqual([prdPath]);
    expect(agentConfig.outputFile).toBe(join(hmDir, "normalize", "normalized-prd.md"));
    expect(agentConfig.rules.length).toBeGreaterThan(0);
    expect(agentConfig.constitutionContent).toBe("# Constitution content");
  });

  it("appends feedback as rule when provided", async () => {
    const { runNormalizeStage } = await import("../../stages/normalize-stage.js");
    await runNormalizeStage(prdPath, dirs, config, "Missing auth requirements");

    const [agentConfig] = mockSpawn.mock.calls[0];
    expect(agentConfig.rules.some((r: string) => r.includes("Missing auth requirements"))).toBe(true);
  });

  it("throws on missing input file", async () => {
    const { runNormalizeStage } = await import("../../stages/normalize-stage.js");
    const missingPath = join(testDir, "nonexistent.md");

    await expect(runNormalizeStage(missingPath, dirs, config)).rejects.toThrow("Input document not found or empty");
  });

  it("throws on agent failure", async () => {
    mockSpawn.mockResolvedValue({ success: false, outputFile: "", error: "Agent crashed" });

    const { runNormalizeStage } = await import("../../stages/normalize-stage.js");
    await expect(runNormalizeStage(prdPath, dirs, config)).rejects.toThrow("Normalizer agent failed");
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });
});
