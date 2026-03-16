import type { AgentResult } from "../types/agents.js";
import type { HiveMindConfig } from "../config/schema.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, writeFileAtomic, ensureDir, fileExists } from "../utils/file-io.js";
import { join } from "node:path";
import { loadConstitution } from "../config/loader.js";

const toSlash = (p: string): string => p.replace(/\\/g, "/");

export interface BugFixState {
  attemptNumber: number;
  checkpointFired: boolean;
  startedAt: string;
}

export interface DiagnoseResult {
  success: boolean;
  reportPath: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  shouldEscalate: boolean;
  escalationPrdPath?: string;
}

function parseDiagnosisReport(content: string): {
  confidence: "HIGH" | "MEDIUM" | "LOW" | undefined;
  shouldEscalate: boolean;
  affectedFileCount: number;
  topLevelDirCount: number;
} {
  // Keyword-anywhere scanning (Option B per F50)
  const hasRootCause = /^.*Root\s*Cause/im.test(content);
  const hasAffectedFiles = /^.*Affected\s*Files/im.test(content);
  const hasRecommendedFix = /^.*Recommended\s*Fix/im.test(content);
  const hasConfidence = /^.*Confidence/im.test(content);

  if (!hasRootCause || !hasAffectedFiles || !hasRecommendedFix || !hasConfidence) {
    console.warn("Diagnosis report missing mandatory sections:");
    if (!hasRootCause) console.warn("  - Root Cause");
    if (!hasAffectedFiles) console.warn("  - Affected Files");
    if (!hasRecommendedFix) console.warn("  - Recommended Fix");
    if (!hasConfidence) console.warn("  - Confidence");
  }

  // Parse confidence
  let confidence: "HIGH" | "MEDIUM" | "LOW" | undefined;
  const confMatch = content.match(/\b(HIGH|MEDIUM|LOW)\b/);
  if (confMatch) {
    confidence = confMatch[1] as "HIGH" | "MEDIUM" | "LOW";
  }

  // Count affected files and top-level dirs
  const fileMatches = content.match(/`([^`]+\.\w+):?\d*/g) ?? [];
  const uniqueFiles = new Set(fileMatches.map((m) => m.replace(/`/g, "").split(":")[0]));
  const topLevelDirs = new Set(
    [...uniqueFiles]
      .filter((f) => f.startsWith("src/"))
      .map((f) => f.split("/").slice(0, 2).join("/")),
  );

  const shouldEscalate = confidence === "LOW" && uniqueFiles.size > 5 && topLevelDirs.size > 2;

  return { confidence, shouldEscalate, affectedFileCount: uniqueFiles.size, topLevelDirCount: topLevelDirs.size };
}

export function loadBugFixState(bugFixDir: string): BugFixState | null {
  const statePath = join(bugFixDir, "bug-fix-state.json");
  const content = readFileSafe(statePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as BugFixState;
  } catch {
    return null;
  }
}

export function saveBugFixState(bugFixDir: string, state: BugFixState): void {
  writeFileAtomic(join(bugFixDir, "bug-fix-state.json"), JSON.stringify(state, null, 2) + "\n");
}

export async function runDiagnose(
  bugReportPath: string,
  hiveMindDir: string,
  config: HiveMindConfig,
  attemptNumber: number,
): Promise<DiagnoseResult> {
  const bugFixDir = join(hiveMindDir, "reports", "bug-fix");
  ensureDir(bugFixDir);

  const memoryPath = join(hiveMindDir, "memory.md");
  const memoryContent = readMemory(memoryPath);
  const constitutionContent = loadConstitution(hiveMindDir);

  const reportPath = join(bugFixDir, `diagnosis-report-attempt-${attemptNumber}.md`);

  // Build input files: bug report + previous diagnosis attempts
  const inputFiles = [bugReportPath];
  for (let i = 1; i < attemptNumber; i++) {
    const prevReport = join(bugFixDir, `diagnosis-report-attempt-${i}.md`);
    if (fileExists(prevReport)) {
      inputFiles.push(prevReport);
    }
  }

  console.log(`DIAGNOSE: Running diagnostician-bug (attempt ${attemptNumber})...`);

  const result: AgentResult = await spawnAgentWithRetry({
    type: "diagnostician-bug",
    model: "opus",
    inputFiles: inputFiles.map(toSlash),
    outputFile: toSlash(reportPath),
    rules: getAgentRules("diagnostician-bug"),
    memoryContent,
    constitutionContent,
  }, config);

  if (!result.success) {
    console.error(`Diagnostician-bug failed: ${result.error}`);
    return { success: false, reportPath, shouldEscalate: false };
  }

  // Parse diagnosis report
  const reportContent = readFileSafe(reportPath);
  if (!reportContent) {
    console.error("Diagnostician-bug produced no output");
    return { success: false, reportPath, shouldEscalate: false };
  }

  const parsed = parseDiagnosisReport(reportContent);

  // Handle escalation: write minimal PRD
  let escalationPrdPath: string | undefined;
  if (parsed.shouldEscalate) {
    const bugContent = readFileSafe(bugReportPath) ?? "";
    escalationPrdPath = join(hiveMindDir, "escalated-bug-PRD.md");
    const prd = buildEscalationPrd(bugContent, reportContent);
    writeFileAtomic(escalationPrdPath, prd);
    console.log("DIAGNOSE: Escalation recommended — wrote escalated-bug-PRD.md");
  }

  return {
    success: true,
    reportPath,
    confidence: parsed.confidence,
    shouldEscalate: parsed.shouldEscalate,
    escalationPrdPath,
  };
}

function buildEscalationPrd(bugContent: string, diagnosisContent: string): string {
  // Extract symptoms from bug report
  const symptomsMatch = bugContent.match(/## Symptoms\n([\s\S]*?)(?=\n##|$)/);
  const symptoms = symptomsMatch?.[1]?.trim() ?? "See original bug report.";

  const expectedMatch = bugContent.match(/## Expected Behavior\n([\s\S]*?)(?=\n##|$)/);
  const expected = expectedMatch?.[1]?.trim() ?? "See original bug report.";

  // Extract affected files from diagnosis
  const affectedMatch = diagnosisContent.match(/(?:##+ )?Affected\s*Files\n([\s\S]*?)(?=\n##|$)/i);
  const affected = affectedMatch?.[1]?.trim() ?? "See diagnosis report.";

  return `# PRD: Bug Escalation

## Problem Statement
${symptoms}

## Expected Behavior
${expected}

## Scope
${affected}

## Out of Scope
Anything not mentioned in the bug report.
`;
}

export function writePartialReport(
  bugFixDir: string,
  bugTitle: string,
  attempts: Array<{ diagnosisPath: string; verifyReason: string }>,
): void {
  const sections = attempts.map((a, i) => {
    const diagContent = readFileSafe(a.diagnosisPath) ?? "(diagnosis report not found)";
    // Extract Root Cause and Recommended Fix sections
    const rootCauseMatch = diagContent.match(/(?:##+ )?Root\s*Cause\n([\s\S]*?)(?=\n##|$)/i);
    const fixMatch = diagContent.match(/(?:##+ )?Recommended\s*Fix\n([\s\S]*?)(?=\n##|$)/i);

    return `## Attempt ${i + 1}
### Diagnosis
${rootCauseMatch?.[1]?.trim() ?? "(root cause not found in report)"}

${fixMatch?.[1]?.trim() ?? "(recommended fix not found in report)"}

### Outcome
VERIFY FAIL — ${a.verifyReason}`;
  }).join("\n\n");

  const report = `# Bug-Fix Partial Report — ${bugTitle}

## Summary
Max fix attempts (3) reached without a passing VERIFY. Manual intervention required.

${sections}

## Next Steps
Review each diagnosis attempt above. Fix manually or re-run with a more detailed bug report.
`;

  writeFileAtomic(join(bugFixDir, "partial-report.md"), report);
}
