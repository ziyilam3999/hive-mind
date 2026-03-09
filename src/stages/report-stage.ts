import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory, writeMemory, checkMemorySize, appendToMemory } from "../memory/memory-manager.js";
import {
  identifyGraduationCandidates,
  formatForKnowledgeBase,
  appendToKnowledgeBase,
  removeGraduatedEntries,
  logGraduation,
} from "../memory/graduation.js";
import { checkEli5Presence } from "../reports/parser.js";
import { readFileSafe, fileExists } from "../utils/file-io.js";
import { estimateWordCount } from "../utils/token-count.js";
import { join } from "node:path";
import { readdirSync } from "node:fs";

const KB_SIZE_WARNING_WORDS = 5000;

export async function runReportStage(hiveMindDir: string): Promise<void> {
  const reportsDir = join(hiveMindDir, "reports");
  const memoryPath = join(hiveMindDir, "memory.md");
  const memoryContent = readMemory(memoryPath);
  const kbDir = join(hiveMindDir, "knowledge-base");

  // 1. Reporter agent — consolidated-report.md
  console.log("Running reporter agent...");
  const reportFiles = collectAllReportFiles(reportsDir);
  const planPath = join(hiveMindDir, "plans", "execution-plan.json");
  const reporterInputs = [...reportFiles];
  if (fileExists(planPath)) {
    reporterInputs.push(planPath);
  }

  const consolidatedPath = join(hiveMindDir, "consolidated-report.md");
  await spawnAgentWithRetry({
    type: "reporter",
    model: "haiku",
    inputFiles: reporterInputs,
    outputFile: consolidatedPath,
    rules: getAgentRules("reporter"),
    memoryContent,
  });

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

  // 2. Retrospective agent — retrospective.md + memory updates
  console.log("Running retrospective agent...");
  const learningFiles = collectLearningFiles(reportsDir);
  const kbFiles = collectKnowledgeBaseFiles(kbDir);

  const retrospectivePath = join(hiveMindDir, "retrospective.md");
  await spawnAgentWithRetry({
    type: "retrospective",
    model: "sonnet",
    inputFiles: [...learningFiles, ...kbFiles],
    outputFile: retrospectivePath,
    rules: getAgentRules("retrospective"),
    memoryContent,
  });

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
  const { nearCap } = checkMemorySize(memoryPath);
  if (nearCap) {
    console.log("Memory approaching cap. Running graduation...");
    const currentMemory = readMemory(memoryPath);
    const candidates = identifyGraduationCandidates(currentMemory);

    if (candidates.length > 0) {
      for (const candidate of candidates) {
        const formatted = formatForKnowledgeBase(candidate);
        appendToKnowledgeBase(kbDir, candidate, formatted);
        logGraduation(memoryPath, candidate);
      }

      const cleanedMemory = removeGraduatedEntries(readMemory(memoryPath), candidates);
      writeMemory(memoryPath, cleanedMemory);
      console.log(`Graduated ${candidates.length} entries to knowledge-base.`);
    }
  }

  // 4. KB size warning
  const kbTotalWords = getKnowledgeBaseWordCount(kbDir);
  if (kbTotalWords > KB_SIZE_WARNING_WORDS) {
    console.warn(
      `Warning: Knowledge base exceeds ${KB_SIZE_WARNING_WORDS} words (${kbTotalWords}). Human review recommended.`,
    );
  }

  console.log("REPORT stage complete.");
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
