import type { Story } from "../types/execution-plan.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { fileExists, ensureDir } from "../utils/file-io.js";
import { getReportPath } from "../reports/templates.js";
import type { HiveMindConfig } from "../config/schema.js";
import { join } from "node:path";

const REPORT_FILES = [
  "impl-report.md",
  "refactor-report.md",
  "test-report.md",
  "eval-report.md",
];

export async function runLearn(
  story: Story,
  hiveMindDir: string,
  config: HiveMindConfig,
): Promise<string> {
  const reportsDir = join(hiveMindDir, getReportPath(story.id, ""));
  ensureDir(reportsDir);

  const memoryPath = join(hiveMindDir, "memory.md");
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

  console.log(`E.8: Running learner for ${story.id}...`);
  await spawnAgentWithRetry({
    type: "learner",
    model: "haiku",
    inputFiles,
    outputFile: learningPath,
    rules: getAgentRules("learner"),
    memoryContent,
  }, config);

  return learningPath;
}
