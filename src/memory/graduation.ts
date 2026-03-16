import { readFileSafe, writeFileAtomic, fileExists, ensureDir } from "../utils/file-io.js";
import { isoTimestamp } from "../utils/timestamp.js";
import type { HiveMindConfig } from "../config/schema.js";
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
  config: HiveMindConfig,
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
      // Stability: check for date patterns
      const dateMatches = entry.match(/\d{4}-\d{2}-\d{2}/g);
      const hasStability = dateMatches !== null && dateMatches.length >= config.graduationMinDates;

      // Evidence: cites story IDs
      const storyRefs = entry.match(/US-\d+/g);
      const hasEvidence = storyRefs !== null && new Set(storyRefs).size >= config.graduationMinStoryRefs;

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

/**
 * RD-08: Find near-duplicate entries in knowledge base content using Jaccard similarity.
 * Returns the matching entry text if a near-duplicate is found, null otherwise.
 */
export function findNearDuplicate(
  candidateText: string,
  kbContent: string,
  threshold = 0.5,
): string | null {
  const candidateWords = tokenize(candidateText);
  if (candidateWords.size === 0) return null;

  // Extract WHAT entries from KB content
  const lines = kbContent.split("\n");
  for (const line of lines) {
    const whatMatch = line.match(/^-\s*WHAT:\s*(.+)/i);
    if (!whatMatch) continue;

    const entryWords = tokenize(whatMatch[1]);
    if (entryWords.size === 0) continue;

    // Jaccard similarity: |intersection| / |union|
    let intersection = 0;
    for (const w of candidateWords) {
      if (entryWords.has(w)) intersection++;
    }
    const union = new Set([...candidateWords, ...entryWords]).size;
    const similarity = union > 0 ? intersection / union : 0;

    if (similarity >= threshold) {
      return whatMatch[1].trim();
    }
  }

  return null;
}

/** Simple tokenizer with naive suffix stripping for fuzzy matching */
function tokenize(text: string): Set<string> {
  const STOP_WORDS = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "it", "this", "that",
    "and", "or", "but", "not", "should", "would", "could", "can", "will", "do", "does"]);
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .filter(w => !STOP_WORDS.has(w))
      .map(w => w.replace(/(tion|sion|ing|ed|ly|er|est|ment|ness|ity|ies|ous|ive|able|ible|ful|less|ize|ise|ated|ating)$/, "")),
  );
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
