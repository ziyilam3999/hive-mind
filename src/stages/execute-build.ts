import type { Story } from "../types/execution-plan.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules, buildRoleReportContents } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, ensureDir } from "../utils/file-io.js";
import { getReportPath } from "../reports/templates.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { CostTracker } from "../utils/cost-tracker.js";
import { join } from "node:path";

export async function runBuild(
  story: Story,
  hiveMindDir: string,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
): Promise<{ implReportPath: string; refactorReportPath: string }> {
  const reportsDir = join(hiveMindDir, getReportPath(story.id, ""));
  ensureDir(reportsDir);

  const memoryPath = join(hiveMindDir, "memory.md");
  const memoryContent = readMemory(memoryPath);

  const stepFilePath = join(hiveMindDir, story.stepFile);
  const stepFileContent = readFileSafe(stepFilePath);
  if (!stepFileContent) {
    throw new Error(`Step file not found: ${stepFilePath}`);
  }

  // E.1: Implementer — receives ONLY step file + memory (P16: self-contained)
  const implReportPath = join(hiveMindDir, getReportPath(story.id, "impl-report.md"));
  console.log(`E.1: Running implementer for ${story.id}...`);

  const implRoleContents = roleReportsDir
    ? buildRoleReportContents("implementer", story.rolesUsed, roleReportsDir)
    : undefined;

  const implResult = await spawnAgentWithRetry({
    type: "implementer",
    model: "opus",
    inputFiles: [stepFilePath],
    outputFile: implReportPath,
    rules: getAgentRules("implementer"),
    memoryContent,
    roleReportContents: implRoleContents,
  }, config);
  costTracker?.recordAgentCost(story.id, "implementer", implResult.costUsd, implResult.durationMs);

  // E.2: Refactorer — receives source code + impl-report + memory
  const refactorReportPath = join(hiveMindDir, getReportPath(story.id, "refactor-report.md"));
  console.log(`E.2: Running refactorer for ${story.id}...`);

  const sourceFiles = story.sourceFiles.map((f) => join(hiveMindDir, f));
  const refactorRoleContents = roleReportsDir
    ? buildRoleReportContents("refactorer", story.rolesUsed, roleReportsDir)
    : undefined;

  const refactorResult = await spawnAgentWithRetry({
    type: "refactorer",
    model: "sonnet",
    inputFiles: [...sourceFiles, implReportPath],
    outputFile: refactorReportPath,
    rules: getAgentRules("refactorer"),
    memoryContent,
    roleReportContents: refactorRoleContents,
  }, config);
  costTracker?.recordAgentCost(story.id, "refactorer", refactorResult.costUsd, refactorResult.durationMs);

  return { implReportPath, refactorReportPath };
}
