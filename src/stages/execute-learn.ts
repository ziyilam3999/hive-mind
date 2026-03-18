import type { Story } from "../types/execution-plan.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules, buildRoleReportContents } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { fileExists, ensureDir } from "../utils/file-io.js";
import { getReportPath } from "../reports/templates.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { CostTracker } from "../utils/cost-tracker.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import { join } from "node:path";

const REPORT_FILES = [
  "impl-report.md",
  "refactor-report.md",
  "test-report.md",
  "eval-report.md",
];

export async function runLearn(
  story: Story,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
): Promise<string> {
  const reportsDir = join(dirs.workingDir, getReportPath(story.id, ""));
  ensureDir(reportsDir);

  const memoryPath = join(dirs.knowledgeDir, "memory.md");
  const memoryContent = readMemory(memoryPath);

  // Collect all report files for this story
  const inputFiles: string[] = [];

  for (const reportName of REPORT_FILES) {
    const reportPath = join(reportsDir, reportName);
    if (fileExists(reportPath)) {
      inputFiles.push(reportPath);
    }
  }

  // Also collect numbered reports (diagnosis-report-N.md, fix-report-N.md)
  for (let i = 1; i <= story.maxAttempts; i++) {
    const diagPath = join(reportsDir, `diagnosis-report-${i}.md`);
    if (fileExists(diagPath)) {
      inputFiles.push(diagPath);
    }
    const fixPath = join(reportsDir, `fix-report-${i}.md`);
    if (fileExists(fixPath)) {
      inputFiles.push(fixPath);
    }
  }

  const learningPath = join(reportsDir, "learning.md");

  const learnerRoleContents = roleReportsDir
    ? buildRoleReportContents("learner", story.rolesUsed, roleReportsDir)
    : undefined;

  console.log(`E.8: Running learner for ${story.id}...`);
  const learnResult = await spawnAgentWithRetry({
    type: "learner",
    model: "haiku",
    inputFiles,
    outputFile: learningPath,
    rules: getAgentRules("learner"),
    memoryContent,
    roleReportContents: learnerRoleContents,
  }, config);
  costTracker?.recordAgentCost(story.id, "learner", learnResult.costUsd, learnResult.durationMs);

  return learningPath;
}
