import type { Story } from "../types/execution-plan.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules, buildRoleReportContents } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, ensureDir } from "../utils/file-io.js";
import { getReportPath } from "../reports/templates.js";
import { parseComplianceReport, parseComplianceFixReport, type ComplianceResult } from "../reports/parser.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { CostTracker } from "../utils/cost-tracker.js";
import { join } from "node:path";

const MAX_COMPLIANCE_FIX_ATTEMPTS = 2;

export interface ComplianceCheckResult {
  passed: boolean;
  skipped: boolean;
  result: ComplianceResult | null;
  reportPath: string;
}

/**
 * Run the compliance-reviewer agent after BUILD, before VERIFY.
 * Checks that every instruction in the step file has a corresponding implementation.
 *
 * Non-fatal (P39): crash, missing output, or corrupt report → skip compliance check,
 * log warning, proceed to VERIFY.
 */
export async function runComplianceCheck(
  story: Story,
  hiveMindDir: string,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
): Promise<ComplianceCheckResult> {
  const reportsDir = join(hiveMindDir, getReportPath(story.id, ""));
  ensureDir(reportsDir);

  const reportPath = join(hiveMindDir, getReportPath(story.id, "compliance-report.md"));
  const stepFilePath = join(hiveMindDir, story.stepFile);
  const implReportPath = join(hiveMindDir, getReportPath(story.id, "impl-report.md"));

  const memoryPath = join(hiveMindDir, "memory.md");
  const memoryContent = readMemory(memoryPath);

  const sourceFiles = story.sourceFiles.map((f) => join(hiveMindDir, f));

  const reviewerRoleContents = roleReportsDir
    ? buildRoleReportContents("compliance-reviewer", story.rolesUsed, roleReportsDir)
    : undefined;

  // Run initial compliance review
  const reviewResult = await spawnComplianceReviewer(
    story, stepFilePath, implReportPath, sourceFiles, reportPath,
    memoryContent, reviewerRoleContents, config, costTracker,
  );

  if (reviewResult.skipped || reviewResult.passed) {
    return reviewResult;
  }

  // FAIL → run compliance-fixer loop (ENH-18)
  for (let fixAttempt = 1; fixAttempt <= MAX_COMPLIANCE_FIX_ATTEMPTS; fixAttempt++) {
    const fixResult = await runComplianceFixer(
      story, hiveMindDir, stepFilePath, reportPath, implReportPath, sourceFiles,
      memoryContent, fixAttempt, config, costTracker, roleReportsDir,
    );

    if (fixResult.skipped) {
      // P39: fixer crashed → proceed to VERIFY
      console.warn(`[${story.id}] COMPLIANCE-FIX: Fixer crashed on attempt ${fixAttempt} — proceeding to VERIFY (P39)`);
      return { passed: true, skipped: true, result: reviewResult.result, reportPath };
    }

    // F39: Skip re-review if fixer made no changes
    if (fixResult.itemsFixed === 0) {
      console.warn(`[${story.id}] COMPLIANCE-FIX: No items fixed on attempt ${fixAttempt} — skipping re-review (F39)`);
      return { passed: true, skipped: true, result: reviewResult.result, reportPath };
    }

    // Re-run compliance reviewer after fix
    const reReviewResult = await spawnComplianceReviewer(
      story, stepFilePath, implReportPath, sourceFiles, reportPath,
      memoryContent, reviewerRoleContents, config, costTracker,
    );

    if (reReviewResult.skipped || reReviewResult.passed) {
      return reReviewResult;
    }

    // Still failing — continue fix loop if attempts remain
  }

  // Exhausted fix attempts — proceed to VERIFY with warning
  console.warn(`[${story.id}] COMPLIANCE: Exhausted ${MAX_COMPLIANCE_FIX_ATTEMPTS} fix attempts — proceeding to VERIFY`);
  return { passed: true, skipped: true, result: reviewResult.result, reportPath };
}

/**
 * Spawn the compliance-reviewer agent and parse its output.
 * Returns a ComplianceCheckResult.
 */
async function spawnComplianceReviewer(
  story: Story,
  stepFilePath: string,
  implReportPath: string,
  sourceFiles: string[],
  reportPath: string,
  memoryContent: string,
  reviewerRoleContents: string | undefined,
  config: HiveMindConfig,
  costTracker?: CostTracker,
): Promise<ComplianceCheckResult> {
  try {
    console.log(`[${story.id}] COMPLIANCE: Running compliance-reviewer...`);

    const spawnResult = await spawnAgentWithRetry({
      type: "compliance-reviewer",
      model: "sonnet",
      inputFiles: [stepFilePath, implReportPath, ...sourceFiles],
      outputFile: reportPath,
      rules: getAgentRules("compliance-reviewer"),
      memoryContent,
      roleReportContents: reviewerRoleContents,
    }, config);
    costTracker?.recordAgentCost(story.id, "compliance-reviewer", spawnResult.costUsd, spawnResult.durationMs);

    const reportContent = readFileSafe(reportPath);
    if (!reportContent) {
      console.warn(`[${story.id}] COMPLIANCE: Output file not created — skipping compliance check (P39)`);
      return { passed: true, skipped: true, result: null, reportPath };
    }

    const result = parseComplianceReport(reportContent);

    if (result.confidence === "default") {
      console.warn(`[${story.id}] COMPLIANCE: Corrupt output (missing STATUS block) — skipping compliance check (P39)`);
      return { passed: true, skipped: true, result, reportPath };
    }

    if (result.result === "PASS") {
      console.log(`[${story.id}] COMPLIANCE: PASS (${result.done} done, ${result.uncertain} uncertain)`);
      return { passed: true, skipped: false, result, reportPath };
    }

    if (result.result === "FAIL") {
      console.log(`[${story.id}] COMPLIANCE: FAIL (${result.missing} missing, ${result.done} done, ${result.uncertain} uncertain)`);
      return { passed: false, skipped: false, result, reportPath };
    }

    console.warn(`[${story.id}] COMPLIANCE: Unknown result — skipping compliance check (P39)`);
    return { passed: true, skipped: true, result, reportPath };
  } catch (err) {
    console.warn(`[${story.id}] COMPLIANCE: Agent crashed — skipping compliance check (P39): ${err instanceof Error ? err.message : String(err)}`);
    return { passed: true, skipped: true, result: null, reportPath };
  }
}

interface ComplianceFixStepResult {
  skipped: boolean;
  itemsFixed: number;
}

/**
 * Run the compliance-fixer agent to implement MISSING instructions.
 * Non-fatal (P39): crash → skip and proceed.
 */
async function runComplianceFixer(
  story: Story,
  hiveMindDir: string,
  stepFilePath: string,
  complianceReportPath: string,
  implReportPath: string,
  sourceFiles: string[],
  memoryContent: string,
  attempt: number,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
): Promise<ComplianceFixStepResult> {
  const fixReportPath = join(hiveMindDir, getReportPath(story.id, `compliance-fix-report-${attempt}.md`));

  const fixerRoleContents = roleReportsDir
    ? buildRoleReportContents("compliance-fixer", story.rolesUsed, roleReportsDir)
    : undefined;

  try {
    console.log(`[${story.id}] COMPLIANCE-FIX: Running compliance-fixer (attempt ${attempt})...`);

    const spawnResult = await spawnAgentWithRetry({
      type: "compliance-fixer",
      model: "sonnet",
      inputFiles: [stepFilePath, complianceReportPath, implReportPath, ...sourceFiles],
      outputFile: fixReportPath,
      rules: getAgentRules("compliance-fixer"),
      memoryContent,
      roleReportContents: fixerRoleContents,
    }, config);
    costTracker?.recordAgentCost(story.id, "compliance-fixer", spawnResult.costUsd, spawnResult.durationMs);

    const fixContent = readFileSafe(fixReportPath);
    if (!fixContent) {
      console.warn(`[${story.id}] COMPLIANCE-FIX: Output file not created — skipping (P39)`);
      return { skipped: true, itemsFixed: 0 };
    }

    const fixResult = parseComplianceFixReport(fixContent);

    if (fixResult.confidence === "default") {
      console.warn(`[${story.id}] COMPLIANCE-FIX: Corrupt output (missing STATUS block) — skipping (P39)`);
      return { skipped: true, itemsFixed: 0 };
    }

    console.log(`[${story.id}] COMPLIANCE-FIX: Fixed ${fixResult.itemsFixed} items, ${fixResult.itemsRemaining} remaining`);
    return { skipped: false, itemsFixed: fixResult.itemsFixed };
  } catch (err) {
    console.warn(`[${story.id}] COMPLIANCE-FIX: Agent crashed — skipping (P39): ${err instanceof Error ? err.message : String(err)}`);
    return { skipped: true, itemsFixed: 0 };
  }
}
