import type { Story } from "../types/execution-plan.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules, buildRoleReportContents } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, ensureDir, fileExists } from "../utils/file-io.js";
import { getReportPath } from "../reports/templates.js";
import { parseTestReport, parseEvalReport } from "../reports/parser.js";
// Plan writes (incrementAttempts, saveExecutionPlan) removed from runVerify.
// Attempt tracking is now local; the wave executor owns all plan state mutations.
import { appendLogEntry, createLogEntry } from "../state/manager-log.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { CostTracker } from "../utils/cost-tracker.js";
import { join } from "node:path";
import { copyFileSync } from "node:fs";

export interface VerifyResult {
  passed: boolean;
  attempts: number;
  testReportPath: string;
  evalReportPath: string;
  parserConfidence: "structured" | "matched" | "default";
}

export interface SubTaskScope {
  sourceFiles: string[];
  title: string;
}

export async function runVerify(
  story: Story,
  hiveMindDir: string,
  planPath: string | undefined,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
  subTaskScope?: SubTaskScope,
): Promise<VerifyResult> {
  const reportsDir = join(hiveMindDir, getReportPath(story.id, ""));
  ensureDir(reportsDir);

  const memoryPath = join(hiveMindDir, "memory.md");
  const memoryContent = readMemory(memoryPath);

  const stepFilePath = join(hiveMindDir, story.stepFile);
  const maxAttempts = story.maxAttempts;

  let attempt = 0;
  let lastConfidence: "structured" | "matched" | "default" = "default";
  const testReportPath = join(hiveMindDir, getReportPath(story.id, "test-report.md"));
  const evalReportPath = join(hiveMindDir, getReportPath(story.id, "eval-report.md"));

  while (attempt < maxAttempts) {
    attempt++;

    // E.3: Tester — runs ACs via Bash
    console.log(`E.3: Running tester for ${story.id} (attempt ${attempt})...`);
    const priorFixReports = collectPriorReports(hiveMindDir, story.id, "fix-report", attempt);
    const priorDiagReports = collectPriorReports(hiveMindDir, story.id, "diagnosis-report", attempt);

    const testerRoleContents = roleReportsDir
      ? buildRoleReportContents("tester-exec", story.rolesUsed, roleReportsDir)
      : undefined;

    const testerResult = await spawnAgentWithRetry({
      type: "tester-exec",
      model: "haiku",
      inputFiles: [stepFilePath, ...priorFixReports, ...priorDiagReports],
      outputFile: testReportPath,
      rules: getAgentRules("tester-exec"),
      memoryContent,
      roleReportContents: testerRoleContents,
    }, config);
    costTracker?.recordAgentCost(story.id, "tester-exec", testerResult.costUsd, testerResult.durationMs);

    const testContent = readFileSafe(testReportPath) ?? "";
    const testResult = parseTestReport(testContent);
    lastConfidence = testResult.confidence;

    // Bug 10: Archive test report per-attempt for post-mortem traceability
    // Skip archive on attempt 1 — it would be identical to test-report.md
    if (attempt > 1) {
      const testArchivePath = join(reportsDir, `test-report-${attempt}.md`);
      try { copyFileSync(testReportPath, testArchivePath); } catch { /* best-effort */ }
    }

    const logPath = join(hiveMindDir, "manager-log.jsonl");
    appendLogEntry(logPath, createLogEntry("VERIFY_ATTEMPT", {
      storyId: story.id,
      attempt,
      parsedStatus: testResult.status,
      parserConfidence: testResult.confidence,
      rawExcerpt: testContent.slice(0, config.reportExcerptLength),
    }));

    if (testResult.confidence === "default") {
      console.warn(`Warning: Parser could not confidently determine test status for ${story.id} (attempt ${attempt}). Defaulting to FAIL.`);
    }

    if (testResult.status === "FAIL") {
      if (attempt >= maxAttempts) break; // exhausted

      // E.4 / E.4a+E.4b: Fix AC failures
      await runFixPipeline(story, hiveMindDir, attempt, "ac", memoryContent, config, roleReportsDir);
      // K5: Post-fix verification gate
      if (!verifyFixApplied(hiveMindDir, story.id, attempt)) {
        console.warn(`Warning: Fix for ${story.id} (attempt ${attempt}) may not have applied changes.`);
        appendLogEntry(logPath, createLogEntry("FIX_UNVERIFIED", { storyId: story.id, attempt }));
      }
      continue; // re-VERIFY from E.3
    }

    // E.5: Evaluator — runs ECs via shell
    console.log(`E.5: Running evaluator for ${story.id} (attempt ${attempt})...`);
    const evalRoleContents = roleReportsDir
      ? buildRoleReportContents("evaluator", story.rolesUsed, roleReportsDir)
      : undefined;

    const evalSpawnResult = await spawnAgentWithRetry({
      type: "evaluator",
      model: "haiku",
      inputFiles: [stepFilePath],
      outputFile: evalReportPath,
      rules: getAgentRules("evaluator"),
      memoryContent,
      roleReportContents: evalRoleContents,
    }, config);
    costTracker?.recordAgentCost(story.id, "evaluator", evalSpawnResult.costUsd, evalSpawnResult.durationMs);

    const evalContent = readFileSafe(evalReportPath) ?? "";
    const evalResult = parseEvalReport(evalContent);

    // Bug 10: Archive eval report per-attempt
    if (attempt > 1) {
      const evalArchivePath = join(reportsDir, `eval-report-${attempt}.md`);
      try { copyFileSync(evalReportPath, evalArchivePath); } catch { /* best-effort */ }
    }

    // Bug 12: Log eval parse result for visibility
    appendLogEntry(logPath, createLogEntry("EVAL_ATTEMPT", {
      storyId: story.id,
      attempt,
      evalParsedStatus: evalResult.verdict,
      evalParserConfidence: evalResult.confidence,
      rawExcerpt: evalContent.slice(0, config.reportExcerptLength),
    }));

    // Bug 11: Short-circuit — if test passed with matched confidence and eval
    // parser couldn't determine status (default confidence), don't retry.
    // The test suite already confirmed correctness; an unparseable eval report
    // should not force unnecessary fix cycles.
    if (evalResult.verdict === "FAIL" && evalResult.confidence === "default" && (testResult.confidence === "matched" || testResult.confidence === "structured")) {
      console.warn(`Warning: Eval parser returned default confidence for ${story.id} (attempt ${attempt}). Test passed with matched confidence — treating as PASS.`);
      return { passed: true, attempts: attempt, testReportPath, evalReportPath, parserConfidence: lastConfidence };
    }

    if (evalResult.verdict === "FAIL") {
      if (attempt >= maxAttempts) break; // exhausted

      // E.6 / E.6a+E.6b: Fix EC failures
      await runFixPipeline(story, hiveMindDir, attempt, "ec", memoryContent, config, roleReportsDir);
      // K5: Post-fix verification gate
      if (!verifyFixApplied(hiveMindDir, story.id, attempt)) {
        console.warn(`Warning: Fix for ${story.id} (attempt ${attempt}) may not have applied changes.`);
        appendLogEntry(logPath, createLogEntry("FIX_UNVERIFIED", { storyId: story.id, attempt }));
      }
      continue; // re-VERIFY from E.3
    }

    // Both passed
    return { passed: true, attempts: attempt, testReportPath, evalReportPath, parserConfidence: lastConfidence };
  }

  // Exhausted attempts
  return { passed: false, attempts: attempt, testReportPath, evalReportPath, parserConfidence: lastConfidence };
}

async function runFixPipeline(
  story: Story,
  hiveMindDir: string,
  attempt: number,
  failureType: "ac" | "ec",
  memoryContent: string,
  config: HiveMindConfig,
  roleReportsDir?: string,
): Promise<void> {
  const reportsDir = join(hiveMindDir, getReportPath(story.id, ""));
  const stepFilePath = join(hiveMindDir, story.stepFile);

  const failReportPath = failureType === "ac"
    ? join(reportsDir, "test-report.md")
    : join(reportsDir, "eval-report.md");

  const priorFixReports = collectPriorReports(hiveMindDir, story.id, "fix-report", attempt + 1);
  const priorDiagReports = collectPriorReports(hiveMindDir, story.id, "diagnosis-report", attempt + 1);

  const fixerRoleContents = roleReportsDir
    ? buildRoleReportContents("fixer", story.rolesUsed, roleReportsDir)
    : undefined;

  // K5: Always run diagnostician → fixer (no fast-path)
  console.log(`E.${failureType === "ac" ? "4a" : "6a"}: Running diagnostician for ${story.id} (attempt ${attempt})...`);
  const diagReportPath = join(reportsDir, `diagnosis-report-${attempt}.md`);

  const diagRoleContents = roleReportsDir
    ? buildRoleReportContents("diagnostician", story.rolesUsed, roleReportsDir)
    : undefined;

  await spawnAgentWithRetry({
    type: "diagnostician",
    model: "sonnet",
    inputFiles: [failReportPath, ...priorFixReports, ...priorDiagReports],
    outputFile: diagReportPath,
    rules: getAgentRules("diagnostician"),
    memoryContent,
    roleReportContents: diagRoleContents,
  }, config);

  // Verify diagnosis file exists before spawning fixer (P11/F11)
  if (!fileExists(diagReportPath)) {
    console.error(`Diagnosis report not found: ${diagReportPath}`);
  }

  console.log(`E.${failureType === "ac" ? "4b" : "6b"}: Running fixer for ${story.id} (attempt ${attempt})...`);
  const fixReportPath = join(reportsDir, `fix-report-${attempt}.md`);
  await spawnAgentWithRetry({
    type: "fixer",
    model: "sonnet",
    inputFiles: [stepFilePath, diagReportPath, failReportPath, ...priorFixReports, ...priorDiagReports],
    outputFile: fixReportPath,
    rules: getAgentRules("fixer"),
    memoryContent,
    roleReportContents: fixerRoleContents,
  }, config);
}

function collectPriorReports(
  hiveMindDir: string,
  storyId: string,
  prefix: string,
  upToAttempt: number,
): string[] {
  const paths: string[] = [];
  for (let i = 1; i < upToAttempt; i++) {
    const path = join(hiveMindDir, getReportPath(storyId, `${prefix}-${i}.md`));
    if (fileExists(path)) {
      paths.push(path);
    }
  }
  return paths;
}

/**
 * K5: Post-fix verification gate.
 * Checks that the fixer agent's fix-report indicates PASS and lists changed files.
 * Returns false if the fix-report is missing, unparseable, or doesn't list file changes.
 */
export function verifyFixApplied(
  hiveMindDir: string,
  storyId: string,
  attempt: number,
): boolean {
  const fixReportPath = join(hiveMindDir, getReportPath(storyId, `fix-report-${attempt}.md`));
  const content = readFileSafe(fixReportPath) ?? "";

  if (!content) return false;

  // Parse STATUS block from fix-report
  const statusMatch = content.match(/<!-- STATUS: ({.*?}) -->/);
  if (!statusMatch) return false;

  try {
    const status = JSON.parse(statusMatch[1]);
    if (status.result !== "PASS") return false;
  } catch {
    return false;
  }

  // Check "Files Changed" section exists and lists real files
  const filesChangedMatch = content.match(/\*\*Files Changed:\*\*\s*(.+)/);
  if (!filesChangedMatch) return false;

  const filesStr = filesChangedMatch[1].trim();
  // "None" is valid for fixes that only change EC commands (no source files)
  if (filesStr.toLowerCase() === "none") return true;

  // At least one file path listed — basic sanity check
  return filesStr.length > 0;
}
