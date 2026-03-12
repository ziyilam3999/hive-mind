import { readFileSafe, writeFileAtomic, fileExists } from "../utils/file-io.js";
import { estimateWordCount } from "../utils/token-count.js";
import type { HiveMindConfig } from "../config/schema.js";

const MEMORY_TEMPLATE = `# Hive Mind Persist Memory

## PATTERNS

## MISTAKES

## DISCOVERIES

## GRADUATION LOG
`;

export function readMemory(memoryPath: string): string {
  if (!fileExists(memoryPath)) {
    createMemoryFromTemplate(memoryPath);
    return MEMORY_TEMPLATE;
  }
  return readFileSafe(memoryPath) ?? MEMORY_TEMPLATE;
}

export function writeMemory(memoryPath: string, content: string): void {
  writeFileAtomic(memoryPath, content);
}

export function appendToMemory(
  memoryPath: string,
  section: string,
  entry: string,
): void {
  const content = readMemory(memoryPath);
  const sectionHeader = `## ${section.toUpperCase()}`;
  const idx = content.indexOf(sectionHeader);
  if (idx === -1) {
    throw new Error(`Section not found in memory.md: ${section}`);
  }
  const insertPos = idx + sectionHeader.length;
  const updated = content.slice(0, insertPos) + "\n" + entry + content.slice(insertPos);
  writeMemory(memoryPath, updated);
}

export function checkMemorySize(
  memoryPath: string,
  config: HiveMindConfig,
): { words: number; overCap: boolean; nearCap: boolean } {
  const content = readMemory(memoryPath);
  const words = estimateWordCount(content);
  return {
    words,
    overCap: words > config.memoryWordCap,
    nearCap: words > config.memoryGraduationThreshold,
  };
}

export function createMemoryFromTemplate(memoryPath: string): void {
  writeFileAtomic(memoryPath, MEMORY_TEMPLATE);
}
