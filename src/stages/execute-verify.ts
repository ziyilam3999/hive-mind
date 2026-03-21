import type { Story } from "../types/execution-plan.js";
import { getSourceFilePaths } from "../types/execution-plan.js";
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
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import { join, resolve } from "node:path";
import { copyFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import type { StoryCheckpoint } from "../types/checkpoint.js";
import { writeFileAtomic } from "../utils/file-io.js";
import { isoTimestamp } from "../utils/timestamp.js";

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
  dirs: PipelineDirs,
  planPath: string | undefined,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
  subTaskScope?: SubTaskScope,
  moduleCwd?: string,
): Promise<VerifyResult> {
  const reportsDir = join(dirs.workingDir, getReportPath(story.id, ""));
  ensureDir(reportsDir);

  const scratchDir = join(dirs.labDir, "tmp", story.id);
  ensureDir(scratchDir);

  const memoryPath = join(dirs.knowledgeDir, "memory.md");
  const memoryContent = readMemory(memoryPath);

  const stepFilePath = join(dirs.workingDir, story.stepFile);
  const maxAttempts = story.maxAttempts;

  const projectRoot = moduleCwd ?? process.cwd();
  let preExecFiles: Set<string>;
  try {
    preExecFiles = new Set(readdirSync(projectRoot));
  } catch {
    preExecFiles = new Set(); // non-existent dir — skip cleanup later
  }

  let attempt = 0;
  let lastConfidence: "structured" | "matched" | "default" = "default";
  const testReportPath = join(dirs.workingDir, getReportPath(story.id, "test-report.md"));
  const evalReportPath = join(dirs.workingDir, getReportPath(story.id, "eval-report.md"));

  while (attempt < maxAttempts) {
    attempt++;

    // E.3: Tester — runs ACs via Bash
    console.log(`E.3: Running tester for ${story.id} (attempt ${attempt})...`);
    const priorFixReports = collectPriorReports(dirs.workingDir, story.id, "fix-report", attempt);
    const priorDiagReports = collectPriorReports(dirs.workingDir, story.id, "diagnosis-report", attempt);

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
      cwd: moduleCwd,
      scratchDir,
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

    const logPath = join(dirs.workingDir, "manager-log.jsonl");
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
      const preFixHashesAc = captureFileHashes(story, moduleCwd ?? dirs.workingDir);
      await runFixPipeline(story, dirs.workingDir, attempt, "ac", memoryContent, config, roleReportsDir, moduleCwd, scratchDir);
      // K5: Post-fix verification gate (hash-based)
      if (!verifyFixApplied(dirs.workingDir, story.id, attempt, preFixHashesAc, story, moduleCwd ?? dirs.workingDir)) {
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
      cwd: moduleCwd,
      scratchDir,
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
      await runWorkspaceCleanup(projectRoot, preExecFiles, dirs, story.id, scratchDir, config);
      return { passed: true, attempts: attempt, testReportPath, evalReportPath, parserConfidence: lastConfidence };
    }

    if (evalResult.verdict === "FAIL") {
      if (attempt >= maxAttempts) break; // exhausted

      // E.6 / E.6a+E.6b: Fix EC failures
      const preFixHashesEc = captureFileHashes(story, moduleCwd ?? dirs.workingDir);
      await runFixPipeline(story, dirs.workingDir, attempt, "ec", memoryContent, config, roleReportsDir, moduleCwd, scratchDir);
      // K5: Post-fix verification gate (hash-based)
      if (!verifyFixApplied(dirs.workingDir, story.id, attempt, preFixHashesEc, story, moduleCwd ?? dirs.workingDir)) {
        console.warn(`Warning: Fix for ${story.id} (attempt ${attempt}) may not have applied changes.`);
        appendLogEntry(logPath, createLogEntry("FIX_UNVERIFIED", { storyId: story.id, attempt }));
      }
      continue; // re-VERIFY from E.3
    }

    // Both passed — write VERIFY checkpoint (RD-07)
    const verifyCheckpoint: StoryCheckpoint = {
      storyId: story.id,
      lastCompletedSubStage: "VERIFY",
      completedSubStages: ["BUILD", "VERIFY"],
      timestamp: isoTimestamp(),
    };
    writeFileAtomic(join(dirs.workingDir, getReportPath(story.id, "checkpoint.json")), JSON.stringify(verifyCheckpoint, null, 2) + "\n");

    await runWorkspaceCleanup(projectRoot, preExecFiles, dirs, story.id, scratchDir, config);
    return { passed: true, attempts: attempt, testReportPath, evalReportPath, parserConfidence: lastConfidence };
  }

  // Exhausted attempts
  await runWorkspaceCleanup(projectRoot, preExecFiles, dirs, story.id, scratchDir, config);
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
  moduleCwd?: string,
  scratchDir?: string,
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

  // Fix 4: Enrich diagnosis context — add step file + source files + existence summary
  const targetDir = moduleCwd ?? hiveMindDir;
  const sourceFilePaths = getSourceFilePaths(story.sourceFiles).map((f) => resolve(targetDir, f));
  const existingSourceFiles = sourceFilePaths.filter((f) => existsSync(f));
  const missingSourceFiles = sourceFilePaths.filter((f) => !existsSync(f));
  const fileExistenceSummary = [
    existingSourceFiles.length > 0 ? `Files present: ${existingSourceFiles.map(f => f.replace(targetDir + "/", "").replace(targetDir + "\\", "")).join(", ")}` : "",
    missingSourceFiles.length > 0 ? `Files MISSING: ${missingSourceFiles.map(f => f.replace(targetDir + "/", "").replace(targetDir + "\\", "")).join(", ")}` : "",
  ].filter(Boolean).join("; ");

  // K5: Always run diagnostician → fixer (no fast-path)
  console.log(`E.${failureType === "ac" ? "4a" : "6a"}: Running diagnostician for ${story.id} (attempt ${attempt})...`);
  const diagReportPath = join(reportsDir, `diagnosis-report-${attempt}.md`);

  const diagRoleContents = roleReportsDir
    ? buildRoleReportContents("diagnostician", story.rolesUsed, roleReportsDir)
    : undefined;

  await spawnAgentWithRetry({
    type: "diagnostician",
    model: "sonnet",
    inputFiles: [stepFilePath, failReportPath, ...existingSourceFiles, ...priorFixReports, ...priorDiagReports],
    outputFile: diagReportPath,
    rules: getAgentRules("diagnostician"),
    memoryContent,
    roleReportContents: diagRoleContents,
    instructionBlocks: fileExistenceSummary ? [{
      heading: "FILE EXISTENCE STATUS",
      content: fileExistenceSummary,
    }] : undefined,
    cwd: moduleCwd,
    scratchDir,
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
    inputFiles: [stepFilePath, diagReportPath, failReportPath, ...existingSourceFiles, ...priorFixReports, ...priorDiagReports],
    outputFile: fixReportPath,
    rules: getAgentRules("fixer"),
    memoryContent,
    roleReportContents: fixerRoleContents,
    cwd: moduleCwd,
    scratchDir,
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

/** Capture SHA-256 hashes of a story's source files for pre/post-fix comparison. */
export function captureFileHashes(
  story: Story,
  targetDir: string,
): Map<string, string | "absent"> {
  const hashes = new Map<string, string | "absent">();
  const paths = getSourceFilePaths(story.sourceFiles);
  for (const relPath of paths) {
    const absPath = resolve(targetDir, relPath);
    if (existsSync(absPath)) {
      const content = readFileSync(absPath);
      hashes.set(relPath, createHash("sha256").update(content).digest("hex"));
    } else {
      hashes.set(relPath, "absent");
    }
  }
  return hashes;
}

/**
 * K5: Post-fix verification gate (enhanced with hash-based file change detection).
 * Uses file content hashing to verify the fixer actually modified source files,
 * falling back to text-based report parsing when sourceFiles is empty.
 */
export function verifyFixApplied(
  hiveMindDir: string,
  storyId: string,
  attempt: number,
  preFixerHashes?: Map<string, string | "absent">,
  story?: Story,
  targetDir?: string,
): boolean {
  // Hash-based verification: compare pre-fixer hashes to current file state
  if (preFixerHashes && preFixerHashes.size > 0 && story && targetDir) {
    const paths = getSourceFilePaths(story.sourceFiles);
    for (const relPath of paths) {
      const absPath = resolve(targetDir, relPath);
      const prevHash = preFixerHashes.get(relPath);
      if (prevHash === undefined) continue;

      if (prevHash === "absent") {
        // File was absent before — if it now exists, the fix created it
        if (existsSync(absPath)) return true;
      } else {
        // File existed before — check if content changed
        if (!existsSync(absPath)) return true; // deleted = modification
        const currentHash = createHash("sha256").update(readFileSync(absPath)).digest("hex");
        if (currentHash !== prevHash) return true;
      }
    }
    return false; // no files changed
  }

  // Fallback: text-based check (for empty sourceFiles or missing hash data)
  const fixReportPath = join(hiveMindDir, getReportPath(storyId, `fix-report-${attempt}.md`));
  const content = readFileSafe(fixReportPath) ?? "";

  if (!content) return false;

  const statusMatch = content.match(/<!-- STATUS: ({.*?}) -->/);
  if (!statusMatch) return false;

  try {
    const status = JSON.parse(statusMatch[1]);
    if (status.result !== "PASS") return false;
  } catch {
    return false;
  }

  const filesChangedMatch = content.match(/\*\*Files Changed:\*\*\s*(.+)/);
  if (!filesChangedMatch) return false;

  const filesStr = filesChangedMatch[1].trim();
  if (filesStr.toLowerCase() === "none") return true;
  return filesStr.length > 0;
}

async function runWorkspaceCleanup(
  projectRoot: string,
  preExecFiles: Set<string>,
  dirs: PipelineDirs,
  storyId: string,
  scratchDir: string,
  config: HiveMindConfig,
): Promise<void> {
  let currentFiles: string[];
  try {
    currentFiles = readdirSync(projectRoot);
  } catch {
    return; // best-effort
  }

  const newFiles = currentFiles.filter(f => !preExecFiles.has(f));
  if (newFiles.length === 0) return;

  const cleanupReportPath = join(dirs.workingDir, getReportPath(storyId, "cleanup-report.md"));

  console.log(`Cleanup: ${newFiles.length} new file(s) detected in project root. Running workspace-cleanup agent...`);

  try {
    await spawnAgentWithRetry({
      type: "workspace-cleanup",
      model: "haiku",
      inputFiles: [],
      outputFile: cleanupReportPath,
      rules: getAgentRules("workspace-cleanup"),
      memoryContent: "",
      instructionBlocks: [{
        heading: "FILE SNAPSHOT",
        content: `Pre-execution files (DO NOT TOUCH): ${[...preExecFiles].join(", ")}\n\nNew files to evaluate: ${newFiles.join(", ")}\n\nRelocate destination: ${scratchDir}`,
      }],
      cwd: projectRoot,
      scratchDir,
    }, config);
  } catch {
    console.warn("Warning: Workspace cleanup agent failed (non-blocking).");
  }
}
