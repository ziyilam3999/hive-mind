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

  it("adds COMPLIANT-FORMAT rule for document-guidelines PRDs", async () => {
    const compliantPrd = `# My Project — PRD
## 1. Problem Statement
Something is broken.
## 2. Objective
Fix it.
## 3. Requirements
REQ-01: Do the thing.
## 4. Non-Functional Requirements
Fast.
## 5. User Workflow
User clicks button.
## 6. Success Criteria
It works.
## 7. Out of Scope
Everything else.
## 8. Future Scope
Later.
## 9. Open Questions
None.
## 10. Evidence Base
We checked.`;
    writeFileSync(prdPath, compliantPrd);

    const { runNormalizeStage } = await import("../../stages/normalize-stage.js");
    await runNormalizeStage(prdPath, dirs, config);

    const [agentConfig] = mockSpawn.mock.calls[0];
    expect(agentConfig.rules.some((r: string) => r.includes("COMPLIANT-FORMAT"))).toBe(true);
  });

  it("does not add COMPLIANT-FORMAT rule for raw unstructured PRDs", async () => {
    writeFileSync(prdPath, "# My Idea\nI want to build a thing that does stuff.");

    const { runNormalizeStage } = await import("../../stages/normalize-stage.js");
    await runNormalizeStage(prdPath, dirs, config);

    const [agentConfig] = mockSpawn.mock.calls[0];
    expect(agentConfig.rules.some((r: string) => r.includes("COMPLIANT-FORMAT"))).toBe(false);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });
});

describe("detectCompliantFormat", () => {
  it("returns true for PRD with all required sections and REQ-IDs", async () => {
    const { detectCompliantFormat } = await import("../../stages/normalize-stage.js");
    const prd = `## 1. Problem Statement\n## 2. Objective\n## 3. Requirements\nREQ-01: Do X\n## 6. Success Criteria\n## 7. Out of Scope`;
    expect(detectCompliantFormat(prd)).toBe(true);
  });

  it("returns false for raw unstructured text", async () => {
    const { detectCompliantFormat } = await import("../../stages/normalize-stage.js");
    expect(detectCompliantFormat("Just some notes about what I want to build")).toBe(false);
  });

  it("returns false when missing required sections", async () => {
    const { detectCompliantFormat } = await import("../../stages/normalize-stage.js");
    const prd = `## 1. Problem Statement\n## 3. Requirements\nREQ-01: Do X`;
    expect(detectCompliantFormat(prd)).toBe(false);
  });

  it("returns false when sections present but no REQ-IDs", async () => {
    const { detectCompliantFormat } = await import("../../stages/normalize-stage.js");
    const prd = `## 1. Problem Statement\n## 2. Objective\n## 3. Requirements\nDo X\n## 6. Success Criteria\n## 7. Out of Scope`;
    expect(detectCompliantFormat(prd)).toBe(false);
  });
});
