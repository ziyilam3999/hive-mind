import { readFileSafe, writeFileAtomic, fileExists, ensureDir } from "../utils/file-io.js";
import { isoTimestamp } from "../utils/timestamp.js";
import { join } from "node:path";
import { appendFileSync } from "node:fs";

export interface GraduationCandidate {
  entry: string;
  section: string;
  targetFile: string;
  targetSeries: string;
}

const KB_FILE_MAP: Record<string, { file: string; series: string }> = {
  PATTERNS: { file: "01-proven-patterns.md", series: "P25+" },
  MISTAKES: { file: "02-anti-patterns.md", series: "F31+" },
  DISCOVERIES: { file: "06-process-patterns.md", series: "unnumbered" },
};

export function identifyGraduationCandidates(
  memoryContent: string,
): GraduationCandidate[] {
  const candidates: GraduationCandidate[] = [];
  const sections = ["PATTERNS", "MISTAKES", "DISCOVERIES"];

  for (const section of sections) {
    const sectionHeader = `## ${section}`;
    const nextHeader = memoryContent.indexOf("## ", memoryContent.indexOf(sectionHeader) + sectionHeader.length);
    const sectionStart = memoryContent.indexOf(sectionHeader);
    if (sectionStart === -1) continue;

    const sectionContent = nextHeader === -1
      ? memoryContent.slice(sectionStart + sectionHeader.length)
      : memoryContent.slice(sectionStart + sectionHeader.length, nextHeader);

    const entries = sectionContent
      .split("\n")
      .filter((line) => line.trim().startsWith("- "));

    for (const entry of entries) {
      // Stability: check for date pattern suggesting 3+ runs
      const dateMatches = entry.match(/\d{4}-\d{2}-\d{2}/g);
      const hasStability = dateMatches !== null && dateMatches.length >= 1;

      // Evidence: cites 2+ story IDs
      const storyRefs = entry.match(/US-\d+/g);
      const hasEvidence = storyRefs !== null && new Set(storyRefs).size >= 2;

      // Generalizability: no hardcoded paths
      const hasHardcodedPaths = /[A-Z]:\\|\/home\/|\/Users\//.test(entry);

      if (hasStability && hasEvidence && !hasHardcodedPaths) {
        const mapping = KB_FILE_MAP[section];
        if (mapping) {
          candidates.push({
            entry: entry.trim(),
            section,
            targetFile: mapping.file,
            targetSeries: mapping.series,
          });
        }
      }
    }
  }

  return candidates;
}

export function formatForKnowledgeBase(candidate: GraduationCandidate): string {
  const entryText = candidate.entry.replace(/^-\s*/, "").replace(/^\d{4}-\d{2}-\d{2}:\s*/, "");
  return `
### ${candidate.targetSeries} -- [Graduated from memory.md]
- WHAT: ${entryText}
- WHY IT WORKS/FAILS: Observed across multiple stories
- EVIDENCE: Graduated from memory.md (${candidate.section})
- DESIGN IMPLICATION: Apply this pattern/lesson in future work
`;
}

export function appendToKnowledgeBase(
  kbDir: string,
  candidate: GraduationCandidate,
  formatted: string,
): void {
  ensureDir(kbDir);
  const filePath = join(kbDir, candidate.targetFile);
  if (!fileExists(filePath)) {
    writeFileAtomic(filePath, `# ${candidate.targetFile}\n`);
  }
  appendFileSync(filePath, formatted + "\n");
}

export function removeGraduatedEntries(
  memoryContent: string,
  candidates: GraduationCandidate[],
): string {
  let result = memoryContent;
  for (const candidate of candidates) {
    result = result.replace(candidate.entry + "\n", "");
    result = result.replace(candidate.entry, "");
  }
  return result;
}

export function logGraduation(
  memoryPath: string,
  candidate: GraduationCandidate,
): void {
  const content = readFileSafe(memoryPath) ?? "";
  const logHeader = "## GRADUATION LOG";
  const idx = content.indexOf(logHeader);
  if (idx === -1) return;
  const insertPos = idx + logHeader.length;
  const logEntry = `\n- ${isoTimestamp()}: Graduated to knowledge-base/${candidate.targetFile} as ${candidate.targetSeries}: ${candidate.entry.slice(0, 80)}`;
  const updated = content.slice(0, insertPos) + logEntry + content.slice(insertPos);
  writeFileAtomic(memoryPath, updated);
}
