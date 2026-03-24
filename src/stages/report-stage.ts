import { spawnAgentsParallel } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory, writeMemory, checkMemorySize, appendToMemory } from "../memory/memory-manager.js";
import {
  identifyGraduationCandidates,
  formatForKnowledgeBase,
  appendToKnowledgeBase,
  removeGraduatedEntries,
  logGraduation,
  findNearDuplicate,
} from "../memory/graduation.js";
import { checkEli5Presence } from "../reports/parser.js";
import { readFileSafe, fileExists } from "../utils/file-io.js";
import { estimateWordCount } from "../utils/token-count.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import type { ExecutionPlan } from "../types/execution-plan.js";
import { getSourceFilePaths } from "../types/execution-plan.js";
import { join } from "node:path";
import { readdirSync, writeFileSync } from "node:fs";

export interface ReportStageResult {
  valid: boolean;
  missingFiles: string[];
}

export async function runReportStage(dirs: PipelineDirs, config: HiveMindConfig): Promise<ReportStageResult> {
  const reportsDir = join(dirs.workingDir, "reports");
  const memoryPath = join(dirs.knowledgeDir, "memory.md");
  const memoryContent = readMemory(memoryPath);
  const kbDir = join(dirs.knowledgeDir, "knowledge-base");

  // Batch 1: code-reviewer + log-summarizer (produce inputs for reporter)
  console.log("Running code-reviewer + log-summarizer in parallel...");
  const reportFiles = collectAllReportFiles(reportsDir);
  const planPath = join(dirs.workingDir, "plans", "execution-plan.json");

  const codeReviewReportPath = join(dirs.workingDir, "code-review-report.md");
  const logAnalysisPath = join(dirs.workingDir, "log-analysis.md");
  const managerLogPath = join(dirs.workingDir, "manager-log.jsonl");

  const implAndRefactorReports = collectImplAndRefactorReports(reportsDir);
  const changedSourceFiles = collectChangedSourceFiles(planPath);

  const batch1Configs = [];
  batch1Configs.push({
    type: "code-reviewer" as const,
    model: "sonnet" as const,
    inputFiles: [...implAndRefactorReports, ...changedSourceFiles],
    outputFile: codeReviewReportPath,
    rules: getAgentRules("code-reviewer"),
    memoryContent,
  });

  if (fileExists(managerLogPath)) {
    batch1Configs.push({
      type: "log-summarizer" as const,
      model: "haiku" as const,
      inputFiles: [managerLogPath],
      outputFile: logAnalysisPath,
      rules: getAgentRules("log-summarizer"),
      memoryContent,
    });
  }

  await spawnAgentsParallel(batch1Configs, config);

  // Batch 2: reporter + retrospective (after batch 1 completes)
  console.log("Running reporter + retrospective agents in parallel...");

  // Build authoritative status summary from execution-plan.json (deterministic, no LLM)
  const statusSummaryPath = join(dirs.workingDir, "story-status-summary.md");
  const summaryBuilt = buildStatusSummary(planPath, statusSummaryPath);

  const reporterInputs: string[] = [];
  if (summaryBuilt) {
    reporterInputs.push(statusSummaryPath);
  }
  reporterInputs.push(...reportFiles);
  if (fileExists(planPath)) {
    reporterInputs.push(planPath);
  }
  if (fileExists(codeReviewReportPath)) {
    reporterInputs.push(codeReviewReportPath);
  }
  if (fileExists(logAnalysisPath)) {
    reporterInputs.push(logAnalysisPath);
  }

  const learningFiles = collectLearningFiles(reportsDir);
  const kbFiles = collectKnowledgeBaseFiles(kbDir);

  const consolidatedPath = join(dirs.workingDir, "consolidated-report.md");
  const retrospectivePath = join(dirs.workingDir, "retrospective.md");

  await spawnAgentsParallel([
    {
      type: "reporter",
      model: "haiku",
      inputFiles: reporterInputs,
      outputFile: consolidatedPath,
      rules: getAgentRules("reporter"),
      memoryContent,
      instructionBlocks: summaryBuilt ? [{
        heading: "AUTHORITATIVE STATUS DATA",
        content: "The file story-status-summary.md was computed by the pipeline (not an LLM). Its pass/fail totals are CORRECT. Your Executive Summary MUST use these exact numbers. Do not derive totals from individual impl-reports.",
      }] : undefined,
    },
    {
      type: "retrospective",
      model: "sonnet",
      inputFiles: [...learningFiles, ...kbFiles],
      outputFile: retrospectivePath,
      rules: getAgentRules("retrospective"),
      memoryContent,
    },
  ], config);

  // ELI5 check on consolidated report
  const consolidatedContent = readFileSafe(consolidatedPath);
  if (consolidatedContent) {
    const eli5Check = checkEli5Presence(consolidatedContent);
    if (!eli5Check.hasEli5) {
      console.warn(
        `Warning: consolidated-report.md has ${eli5Check.sectionCount} sections but no ELI5 blockquotes.`,
      );
    }
  }

  // ELI5 check on retrospective
  const retrospectiveContent = readFileSafe(retrospectivePath);
  if (retrospectiveContent) {
    const eli5Check = checkEli5Presence(retrospectiveContent);
    if (!eli5Check.hasEli5) {
      console.warn(
        `Warning: retrospective.md has ${eli5Check.sectionCount} sections but no ELI5 blockquotes.`,
      );
    }
  }

  // 2b. Parse retrospective for memory updates and append to memory.md
  if (retrospectiveContent) {
    const memoryUpdates = parseMemoryUpdates(retrospectiveContent);
    if (memoryUpdates.totalEntries > 0) {
      for (const { section, entry } of memoryUpdates.entries) {
        try {
          appendToMemory(memoryPath, section, entry);
        } catch (err) {
          console.warn(`Warning: Failed to append to memory.md section "${section}": ${err}`);
        }
      }
      console.log(`Appended ${memoryUpdates.totalEntries} entries to memory.md from retrospective.`);
    } else {
      console.warn("Warning: Retrospective agent did not produce memory updates in expected format -- memory.md will not be updated this run.");
    }
  }

  // 3. Graduation check
  const { nearCap } = checkMemorySize(memoryPath, config);
  if (nearCap) {
    console.log("Memory approaching cap. Running graduation...");
    const currentMemory = readMemory(memoryPath);
    const candidates = identifyGraduationCandidates(currentMemory, config);

    if (candidates.length > 0) {
      let graduatedCount = 0;
      for (const candidate of candidates) {
        // RD-08: Check for near-duplicate before appending
        const kbFilePath = join(kbDir, candidate.targetFile);
        const kbContent = readFileSafe(kbFilePath) ?? "";
        const duplicate = findNearDuplicate(candidate.entry, kbContent);
        if (duplicate) {
          console.log(`Skipping near-duplicate: "${candidate.entry.slice(0, 60)}..." ≈ "${duplicate.slice(0, 60)}..."`);
          continue;
        }
        const formatted = formatForKnowledgeBase(candidate);
        appendToKnowledgeBase(kbDir, candidate, formatted);
        logGraduation(memoryPath, candidate);
        graduatedCount++;
      }

      const cleanedMemory = removeGraduatedEntries(readMemory(memoryPath), candidates);
      writeMemory(memoryPath, cleanedMemory);
      console.log(`Graduated ${graduatedCount} entries to knowledge-base (${candidates.length - graduatedCount} near-duplicates skipped).`);
    }
  }

  // 4. KB size warning
  const kbTotalWords = getKnowledgeBaseWordCount(kbDir);
  if (kbTotalWords > config.kbSizeWarningWords) {
    console.warn(
      `Warning: Knowledge base exceeds ${config.kbSizeWarningWords} words (${kbTotalWords}). Human review recommended.`,
    );
  }

  // Validate critical output files
  const criticalFiles = [
    { path: consolidatedPath, name: "consolidated-report.md" },
    { path: codeReviewReportPath, name: "code-review-report.md" },
    { path: retrospectivePath, name: "retrospective.md" },
  ];
  const missingFiles: string[] = [];
  for (const { path, name } of criticalFiles) {
    const content = readFileSafe(path);
    if (!content || content.trim().length === 0) {
      missingFiles.push(name);
    }
  }

  if (missingFiles.length > 0) {
    console.warn(`[REPORT] WARNING: Missing or empty critical files: ${missingFiles.join(", ")}`);
  }

  console.log("REPORT stage complete.");
  return { valid: missingFiles.length === 0, missingFiles };
}

function collectAllReportFiles(reportsDir: string): string[] {
  if (!fileExists(reportsDir)) return [];
  const files: string[] = [];
  try {
    const storyDirs = readdirSync(reportsDir, { withFileTypes: true });
    for (const dir of storyDirs) {
      if (dir.isDirectory()) {
        const storyReportsDir = join(reportsDir, dir.name);
        const storyFiles = readdirSync(storyReportsDir);
        for (const f of storyFiles) {
          if (f.endsWith(".md")) {
            files.push(join(storyReportsDir, f));
          }
        }
      }
    }
  } catch {
    // Empty or missing directory
  }
  return files;
}

function collectLearningFiles(reportsDir: string): string[] {
  if (!fileExists(reportsDir)) return [];
  const files: string[] = [];
  try {
    const storyDirs = readdirSync(reportsDir, { withFileTypes: true });
    for (const dir of storyDirs) {
      if (dir.isDirectory()) {
        const learningPath = join(reportsDir, dir.name, "learning.md");
        if (fileExists(learningPath)) {
          files.push(learningPath);
        }
      }
    }
  } catch {
    // Empty or missing directory
  }
  return files;
}

function collectKnowledgeBaseFiles(kbDir: string): string[] {
  if (!fileExists(kbDir)) return [];
  try {
    return readdirSync(kbDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(kbDir, f));
  } catch {
    return [];
  }
}

function getKnowledgeBaseWordCount(kbDir: string): number {
  const files = collectKnowledgeBaseFiles(kbDir);
  let totalWords = 0;
  for (const f of files) {
    const content = readFileSafe(f);
    if (content) {
      totalWords += estimateWordCount(content);
    }
  }
  return totalWords;
}

export function collectImplAndRefactorReports(reportsDir: string): string[] {
  if (!fileExists(reportsDir)) return [];
  const files: string[] = [];
  try {
    const storyDirs = readdirSync(reportsDir, { withFileTypes: true });
    for (const dir of storyDirs) {
      if (dir.isDirectory()) {
        const implPath = join(reportsDir, dir.name, "impl-report.md");
        const refactorPath = join(reportsDir, dir.name, "refactor-report.md");
        if (fileExists(implPath)) files.push(implPath);
        if (fileExists(refactorPath)) files.push(refactorPath);
      }
    }
  } catch {
    // Empty or missing directory
  }
  return files;
}

export function collectChangedSourceFiles(planPath: string): string[] {
  if (!fileExists(planPath)) return [];
  const content = readFileSafe(planPath);
  if (!content) return [];
  try {
    const plan: ExecutionPlan = JSON.parse(content);
    const uniqueFiles = new Set<string>();
    for (const story of plan.stories) {
      for (const f of getSourceFilePaths(story.sourceFiles)) {
        uniqueFiles.add(f);
      }
    }
    return [...uniqueFiles];
  } catch {
    return [];
  }
}

/**
 * Parse execution-plan.json and write a deterministic story-status-summary.md.
 * Returns true if the summary was written successfully.
 */
export function buildStatusSummary(planPath: string, outputPath: string): boolean {
  if (!fileExists(planPath)) return false;
  const content = readFileSafe(planPath);
  if (!content) return false;

  try {
    const plan: ExecutionPlan = JSON.parse(content);
    const stories = plan.stories;
    const total = stories.length;

    const counts: Record<string, number> = {};
    for (const story of stories) {
      counts[story.status] = (counts[story.status] ?? 0) + 1;
    }

    const passed = counts["passed"] ?? 0;
    const failed = counts["failed"] ?? 0;
    const pct = total > 0 ? ((passed / total) * 100).toFixed(1) : "0.0";

    const uncommittedPassed = stories.filter(s => s.status === "passed" && !s.committed).length;

    const rows = stories
      .map((s) => {
        const commitCol = s.status === "passed"
          ? (s.committed ? "YES" : "**NO** (!)")
          : "N/A";
        return `| ${s.id} | ${s.status} | ${s.attempts} | ${commitCol} |`;
      })
      .join("\n");

    const otherStatuses = Object.entries(counts)
      .filter(([status]) => status !== "passed" && status !== "failed")
      .map(([status, count]) => `- ${status}: ${count}`)
      .join("\n");

    const md = `# Story Status Summary (AUTHORITATIVE — computed from execution-plan.json)

| Story | Status | Attempts | Committed |
|-------|--------|----------|-----------|
${rows}

## Totals
- Total stories: ${total}
- Passed: ${passed} (${pct}%)
- Failed: ${failed}${otherStatuses ? "\n" + otherStatuses : ""}${uncommittedPassed > 0 ? `\n- **WARNING: ${uncommittedPassed} passed story(ies) NOT committed to git**` : ""}
`;

    writeFileSync(outputPath, md, "utf-8");
    console.log(`Wrote authoritative status summary: ${passed}/${total} passed (${pct}%)`);
    return true;
  } catch (err) {
    console.warn(`Warning: Failed to build status summary: ${err}`);
    return false;
  }
}

const MEMORY_SECTIONS = ["PATTERNS", "MISTAKES", "DISCOVERIES"] as const;

export function parseMemoryUpdates(
  retrospectiveContent: string,
): { entries: { section: string; entry: string }[]; totalEntries: number } {
  const entries: { section: string; entry: string }[] = [];

  const memorySection = retrospectiveContent.split("## MEMORY UPDATES")[1];
  if (!memorySection) return { entries, totalEntries: 0 };

  for (const section of MEMORY_SECTIONS) {
    const sectionHeader = `### ${section}`;
    const sectionStart = memorySection.indexOf(sectionHeader);
    if (sectionStart === -1) continue;

    // Extract text between this subsection and the next ### or end of ## MEMORY UPDATES
    const afterHeader = memorySection.slice(sectionStart + sectionHeader.length);
    const nextSection = afterHeader.search(/^###\s|^##\s/m);
    const sectionText = nextSection === -1 ? afterHeader : afterHeader.slice(0, nextSection);

    // Extract bullet items (lines starting with "- ")
    const bullets = sectionText.match(/^- .+$/gm);
    if (bullets) {
      for (const bullet of bullets) {
        entries.push({ section, entry: bullet });
      }
    }
  }

  return { entries, totalEntries: entries.length };
}
