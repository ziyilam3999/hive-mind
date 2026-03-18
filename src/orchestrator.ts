import type { Checkpoint } from "./types/checkpoint.js";
import type { ExecutionPlan } from "./types/execution-plan.js";
import { getSourceFilePaths } from "./types/execution-plan.js";
import type { HiveMindConfig } from "./config/schema.js";
import type { PipelineDirs } from "./types/pipeline-dirs.js";
import { fileExists, ensureDir, readFileSafe } from "./utils/file-io.js";
import { createMemoryFromTemplate } from "./memory/memory-manager.js";
import {
  writeCheckpoint,
  deleteCheckpoint,
  getCheckpointMessage,
} from "./state/checkpoint.js";
import type { Story } from "./types/execution-plan.js";
import {
  loadExecutionPlan,
  saveExecutionPlan,
  updateStoryStatus,
  markCommitted,
  validateDependencies,
  getReadyStories,
  resetCrashedStories,
  filterNonOverlapping,
  getModuleCwd,
} from "./state/execution-plan.js";
import { runWithConcurrency } from "./utils/concurrency.js";
import { appendLogEntry, createLogEntry } from "./state/manager-log.js";
import { isoTimestamp } from "./utils/timestamp.js";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { HiveMindError } from "./utils/errors.js";
import { notifyCheckpoint } from "./utils/notify.js";
import { CostTracker } from "./utils/cost-tracker.js";
import { runSpecStage as specStage } from "./stages/spec-stage.js";
import { runPlanStage as planStage } from "./stages/plan-stage.js";
import { runBuild } from "./stages/execute-build.js";
import { runVerify } from "./stages/execute-verify.js";
import { runCommit } from "./stages/execute-commit.js";
import { runLearn } from "./stages/execute-learn.js";
import { runComplianceCheck } from "./stages/execute-compliance.js";
import { parseRequiredTooling, detectAllTools } from "./tooling/detect.js";
import { runToolingSetup } from "./tooling/setup.js";
import { runReportStage as reportStage } from "./stages/report-stage.js";
import { runBaselineCheck } from "./stages/baseline-check.js";
import { updateManifest } from "./manifest/generator.js";
import { parseImplReport } from "./reports/parser.js";
import { getReportPath } from "./reports/templates.js";
import { runIntegrateVerify, buildIntegrationCheckpointMessage } from "./stages/integrate-verify.js";
import {
  runDiagnose,
  loadBugFixState,
  saveBugFixState,
  writePartialReport,
  type BugFixState,
} from "./stages/diagnose-stage.js";
import { runShell } from "./utils/shell.js";
import { writeFileAtomic } from "./utils/file-io.js";
import { spawnAgentWithRetry } from "./agents/spawner.js";
import { getAgentRules } from "./agents/prompts.js";

async function safeUpdateManifest(workingDir: string): Promise<void> {
  try {
    await updateManifest(workingDir);
  } catch (err) {
    console.warn(`Warning: Manifest update failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function runPipeline(
  prdPath: string,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  options?: { silent?: boolean; budget?: number; skipBaseline?: boolean; stopAfterPlan?: boolean },
): Promise<void> {
  if (!fileExists(prdPath)) {
    throw new HiveMindError(`PRD file not found: ${prdPath}`);
  }

  ensureDir(dirs.workingDir);
  ensureDir(join(dirs.workingDir, "spec"));
  ensureDir(join(dirs.workingDir, "plans"));
  ensureDir(join(dirs.workingDir, "reports"));
  ensureDir(dirs.knowledgeDir);

  const memoryPath = join(dirs.knowledgeDir, "memory.md");
  if (!fileExists(memoryPath)) {
    createMemoryFromTemplate(memoryPath);
  }

  await runSpecStage(prdPath, dirs, config);
  await safeUpdateManifest(dirs.workingDir);

  const logPath0 = join(dirs.workingDir, "manager-log.jsonl");
  const specDir = join(dirs.workingDir, "spec");
  const specFiles = fileExists(specDir) ? (await import("node:fs")).readdirSync(specDir).filter((f: string) => f.endsWith(".md")) : [];
  appendLogEntry(logPath0, createLogEntry("SPEC_COMPLETE", {
    artifactCount: specFiles.length,
  }));

  // --stop-after-plan: auto-approve SPEC, run PLAN, print summary, exit
  if (options?.stopAfterPlan) {
    await runPlanStage(dirs, config);
    await safeUpdateManifest(dirs.workingDir);

    const planFilePath = join(dirs.workingDir, "plans", "execution-plan.json");
    if (fileExists(planFilePath)) {
      const planData = loadExecutionPlan(planFilePath);
      console.log("\n--- Plan Preview (--stop-after-plan) ---");
      console.log(`Stories: ${planData.stories.length}`);
      for (const s of planData.stories) {
        const fileCount = getSourceFilePaths(s.sourceFiles).length;
        console.log(`  ${s.id}: ${s.title} (${fileCount} files)`);
      }
      console.log("\nPipeline stopped after PLAN. No EXECUTE agents were spawned.");
    }
    return;
  }

  writeCheckpoint(dirs.workingDir, {
    awaiting: "approve-spec",
    message: getCheckpointMessage("approve-spec"),
    timestamp: isoTimestamp(),
    feedback: null,
  });

  console.log("SPEC stage complete. Awaiting approval.");
  console.log(getCheckpointMessage("approve-spec"));
  notifyCheckpoint(options?.silent ?? false);
}

export async function resumeFromCheckpoint(
  checkpoint: Checkpoint,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  options?: { silent?: boolean; skipBaseline?: boolean },
): Promise<void> {
  const silent = options?.silent ?? false;
  const feedback = checkpoint.feedback ?? undefined;

  switch (checkpoint.awaiting) {
    case "approve-spec": {
      deleteCheckpoint(dirs.workingDir);

      // Tooling detect/setup (US-11)
      const specPath = join(dirs.workingDir, "spec", "SPEC-v1.0.md");
      const specContent = readFileSafe(specPath);
      if (specContent) {
        const requirements = parseRequiredTooling(specContent);
        if (requirements.length > 0) {
          const { allDetected } = await detectAllTools(requirements, config);
          if (!allDetected) {
            const setupOk = await runToolingSetup(requirements, dirs, config);
            if (!setupOk) {
              throw new HiveMindError("Tooling setup failed. Please install required tools manually.");
            }
          }
        }
      }

      await runPlanStage(dirs, config, feedback);
      await safeUpdateManifest(dirs.workingDir);

      const planLogPath = join(dirs.workingDir, "manager-log.jsonl");
      const planFilePath = join(dirs.workingDir, "plans", "execution-plan.json");
      if (fileExists(planFilePath)) {
        try {
          const planData = loadExecutionPlan(planFilePath);
          appendLogEntry(planLogPath, createLogEntry("PLAN_COMPLETE", {
            storyCount: planData.stories.length,
            storyIds: planData.stories.map((s) => s.id),
          }));
        } catch {
          console.warn("Warning: execution-plan.json is not valid JSON, skipping PLAN_COMPLETE log.");
        }
      }

      writeCheckpoint(dirs.workingDir, {
        awaiting: "approve-plan",
        message: getCheckpointMessage("approve-plan"),
        timestamp: isoTimestamp(),
        feedback: null,
      });

      console.log("PLAN stage complete. Awaiting approval.");
      console.log(getCheckpointMessage("approve-plan"));
      notifyCheckpoint(silent);
      break;
    }
    case "approve-plan": {
      deleteCheckpoint(dirs.workingDir);

      // Baseline check — verify codebase compiles and tests pass before burning agent tokens
      if (!options?.skipBaseline) {
        await runBaselineCheck(config);
      }

      const tracker = new CostTracker();
      await runExecuteStage(dirs, config, tracker);

      const summary = tracker.getSummary();
      if (summary.totalCostUsd > 0) {
        console.log(`\nCost summary: $${summary.totalCostUsd.toFixed(4)} total`);
        for (const [storyId, cost] of summary.perStory) {
          console.log(`  ${storyId}: $${cost.toFixed(4)}`);
        }
      }

      // Integration verification (Phase 6 — multi-repo only)
      const planPath2 = join(dirs.workingDir, "plans", "execution-plan.json");
      const plan2 = loadExecutionPlan(planPath2);
      const integResult = await runIntegrateVerify(plan2, dirs, config, tracker);

      if (!integResult.skipped) {
        const integMessage = buildIntegrationCheckpointMessage(integResult);
        console.log(integMessage);

        writeCheckpoint(dirs.workingDir, {
          awaiting: "approve-integration",
          message: integMessage,
          timestamp: isoTimestamp(),
          feedback: null,
        });

        console.log("Integration verification complete. Awaiting approval.");
        console.log(getCheckpointMessage("approve-integration"));
        notifyCheckpoint(silent);
        break;
      }

      await runReportStage(dirs, config);
      await safeUpdateManifest(dirs.workingDir);

      writeCheckpoint(dirs.workingDir, {
        awaiting: "verify",
        message: getCheckpointMessage("verify"),
        timestamp: isoTimestamp(),
        feedback: null,
      });

      console.log("EXECUTE + REPORT stages complete. Awaiting verification.");
      console.log(getCheckpointMessage("verify"));
      notifyCheckpoint(silent);
      break;
    }
    case "approve-diagnosis": {
      deleteCheckpoint(dirs.workingDir);

      const exitCode = await resumeBugFixPipeline(dirs, config, { silent });
      if (exitCode !== 0) {
        console.error("Bug fix pipeline failed.");
      } else {
        console.log("Bug fix pipeline complete.");
      }
      break;
    }
    case "approve-integration": {
      deleteCheckpoint(dirs.workingDir);

      await runReportStage(dirs, config);
      await safeUpdateManifest(dirs.workingDir);

      writeCheckpoint(dirs.workingDir, {
        awaiting: "verify",
        message: getCheckpointMessage("verify"),
        timestamp: isoTimestamp(),
        feedback: null,
      });

      console.log("REPORT stage complete. Awaiting verification.");
      console.log(getCheckpointMessage("verify"));
      notifyCheckpoint(silent);
      break;
    }
    case "verify": {
      deleteCheckpoint(dirs.workingDir);

      writeCheckpoint(dirs.workingDir, {
        awaiting: "ship",
        message: getCheckpointMessage("ship"),
        timestamp: isoTimestamp(),
        feedback: null,
      });

      console.log("Verification approved. Ready to ship.");
      console.log(getCheckpointMessage("ship"));
      notifyCheckpoint(silent);
      break;
    }
    case "ship": {
      deleteCheckpoint(dirs.workingDir);
      console.log("Pipeline complete.");
      break;
    }
  }
}

export async function runSpecStage(
  prdPath: string,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  feedback?: string,
): Promise<void> {
  console.log("Running SPEC stage...");
  await specStage(prdPath, dirs, config, feedback);
}

export async function runPlanStage(
  dirs: PipelineDirs,
  config: HiveMindConfig,
  feedback?: string,
): Promise<void> {
  console.log("Running PLAN stage...");
  await planStage(dirs, config, feedback);
}

export interface StoryExecutionResult {
  storyId: string;
  passed: boolean;
  commitHash?: string;
  errorMessage?: string;
  attempts: number;
}

/**
 * Executes a single story: BUILD → COMPLIANCE → VERIFY.
 * If story has sub-tasks (FW-01), iterates through each sub-task with
 * independent BUILD → VERIFY cycles. Sub-task exhausting maxAttempts fails the story.
 * Pure function — returns results, never writes to execution plan.
 * Plan state mutations are owned by the wave executor.
 */
export async function executeOneStory(
  story: Story,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
  moduleCwd?: string,
): Promise<StoryExecutionResult> {
  // FW-01: If story has sub-tasks, execute per sub-task
  if (story.subTasks && story.subTasks.length > 0) {
    return executeStoryWithSubTasks(story, dirs, config, costTracker, roleReportsDir, moduleCwd);
  }

  return executeWholeStory(story, dirs, config, costTracker, roleReportsDir, moduleCwd);
}

/** Original whole-story execution path */
async function executeWholeStory(
  story: Story,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
  moduleCwd?: string,
): Promise<StoryExecutionResult> {
  const logPath = join(dirs.workingDir, "manager-log.jsonl");

  // RD-07: Check for mid-story checkpoint — skip completed sub-stages
  const checkpointPath = join(dirs.workingDir, getReportPath(story.id, "checkpoint.json"));
  const checkpointContent = readFileSafe(checkpointPath);
  const completedSubStages = new Set<string>();
  if (checkpointContent) {
    try {
      const cp = JSON.parse(checkpointContent);
      if (Array.isArray(cp.completedSubStages)) {
        for (const s of cp.completedSubStages) completedSubStages.add(s);
        console.log(`[${story.id}] Resuming from checkpoint — skipping: ${[...completedSubStages].join(", ")}`);
      }
    } catch { /* ignore corrupt checkpoint */ }
  }

  // BUILD sub-pipeline (US-13)
  if (!completedSubStages.has("BUILD")) {
    console.log(`[${story.id}] BUILD: Starting...`);
    await runBuild(story, dirs, config, costTracker, roleReportsDir, undefined, moduleCwd);
  } else {
    console.log(`[${story.id}] BUILD: Skipped (checkpoint)`);
  }

  appendLogEntry(logPath, createLogEntry("BUILD_COMPLETE", {
    storyId: story.id,
  }));

  // COMPLIANCE check — between BUILD and VERIFY (ENH-17)
  // Non-fatal (P39): failure → proceed to VERIFY
  const complianceResult = await runComplianceCheck(story, dirs, config, costTracker, roleReportsDir, moduleCwd);
  if (!complianceResult.skipped) {
    appendLogEntry(logPath, createLogEntry("COMPLIANCE_CHECK", {
      storyId: story.id,
      passed: complianceResult.passed,
      missing: complianceResult.result?.missing ?? 0,
      done: complianceResult.result?.done ?? 0,
    }));
  }

  // VERIFY sub-pipeline (US-14) — no plan writes (refactored in Step 5)
  if (!completedSubStages.has("VERIFY")) {
    console.log(`[${story.id}] VERIFY: Starting...`);
    const verifyResult = await runVerify(story, dirs, undefined, config, costTracker, roleReportsDir, undefined, moduleCwd);

    return {
      storyId: story.id,
      passed: verifyResult.passed,
      attempts: verifyResult.attempts,
      errorMessage: verifyResult.passed ? undefined : "Verification failed after max attempts",
    };
  }

  console.log(`[${story.id}] VERIFY: Skipped (checkpoint)`);
  return {
    storyId: story.id,
    passed: true,
    attempts: 0,
  };
}

/**
 * FW-01: Execute a story with sub-tasks.
 * Each sub-task gets its own BUILD → VERIFY cycle.
 * Sub-tasks run sequentially (no parallelism — overlapping files).
 * Sub-task exhausting maxAttempts → story marked failed.
 * Story-level attempts unused when sub-tasks exist.
 */
async function executeStoryWithSubTasks(
  story: Story,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
  moduleCwd?: string,
): Promise<StoryExecutionResult> {
  const logPath = join(dirs.workingDir, "manager-log.jsonl");
  let totalAttempts = 0;

  console.log(`[${story.id}] SUB-TASK EXECUTION: ${story.subTasks!.length} sub-tasks`);

  for (const subTask of story.subTasks!) {
    if (subTask.status === "passed") continue; // already done (resume case)

    // Retry loop for this sub-task
    let passed = false;
    for (let attempt = 1; attempt <= subTask.maxAttempts; attempt++) {
      totalAttempts++;
      subTask.attempts = attempt;

      console.log(`[${story.id}/${subTask.id}] BUILD: Starting (attempt ${attempt})...`);
      await runBuild(story, dirs, config, costTracker, roleReportsDir, {
        sourceFiles: getSourceFilePaths(subTask.sourceFiles),
        title: subTask.title,
      }, moduleCwd);

      appendLogEntry(logPath, createLogEntry("BUILD_COMPLETE", {
        storyId: `${story.id}/${subTask.id}`,
      }));

      console.log(`[${story.id}/${subTask.id}] VERIFY: Starting...`);
      const verifyResult = await runVerify(story, dirs, undefined, config, costTracker, roleReportsDir, {
        sourceFiles: getSourceFilePaths(subTask.sourceFiles),
        title: subTask.title,
      }, moduleCwd);

      if (verifyResult.passed) {
        console.log(`[${story.id}/${subTask.id}] PASSED`);
        subTask.status = "passed";
        passed = true;
        break;
      }

      if (attempt >= subTask.maxAttempts) {
        console.warn(`[${story.id}/${subTask.id}] FAILED after ${attempt} attempts`);
        subTask.status = "failed";
      }
    }

    if (!passed) {
      return {
        storyId: story.id,
        passed: false,
        attempts: totalAttempts,
        errorMessage: `Sub-task ${subTask.id} failed after max attempts`,
      };
    }
  }

  // All sub-tasks passed — run compliance on the whole story
  const complianceResult = await runComplianceCheck(story, dirs, config, costTracker, roleReportsDir, moduleCwd);
  if (!complianceResult.skipped) {
    appendLogEntry(logPath, createLogEntry("COMPLIANCE_CHECK", {
      storyId: story.id,
      passed: complianceResult.passed,
      missing: complianceResult.result?.missing ?? 0,
      done: complianceResult.result?.done ?? 0,
    }));
  }

  return {
    storyId: story.id,
    passed: true,
    attempts: totalAttempts,
  };
}

export async function runExecuteStage(
  dirs: PipelineDirs,
  config: HiveMindConfig,
  costTracker?: CostTracker,
): Promise<void> {
  console.log("Running EXECUTE stage...");

  const planPath = join(dirs.workingDir, "plans", "execution-plan.json");
  if (!fileExists(planPath)) {
    console.log("No execution plan found. Skipping EXECUTE stage.");
    return;
  }

  const logPath = join(dirs.workingDir, "manager-log.jsonl");
  let plan: ExecutionPlan = loadExecutionPlan(planPath);

  validateDependencies(plan);

  // Crash recovery: reset any in-progress stories from prior crash/abort
  plan = resetCrashedStories(plan);
  if (plan.stories.some((s) => s.status === "not-started")) {
    saveExecutionPlan(planPath, plan);
  }

  const roleReportsDir = join(dirs.workingDir, "plans", "role-reports");

  // Wave executor: process stories in waves of non-overlapping, dependency-ready stories
  while (true) {
    const ready = getReadyStories(plan);
    const wave = filterNonOverlapping(ready, plan);
    if (wave.length === 0) break;

    console.log(`\nWave: executing ${wave.map((s) => s.id).join(", ")}`);

    // Mark wave stories as in-progress
    for (const s of wave) {
      plan = updateStoryStatus(plan, s.id, "in-progress");
    }
    saveExecutionPlan(planPath, plan);

    // Parallel BUILD+VERIFY (bounded by maxConcurrency)
    const tasks = wave.map((s) => () => {
      const moduleCwd = getModuleCwd(plan, s.moduleId);
      return executeOneStory(s, dirs, config, costTracker, roleReportsDir, moduleCwd);
    });
    const settled = await runWithConcurrency(tasks, config.maxConcurrency);

    // Post-BUILD conflict detection: warn if actual files modified overlap between wave stories
    if (wave.length > 1) {
      const storyFiles = new Map<string, string[]>();
      for (const s of wave) {
        const implPath = join(dirs.workingDir, getReportPath(s.id, "impl-report.md"));
        const implContent = readFileSafe(implPath);
        if (implContent) {
          const parsed = parseImplReport(implContent);
          if (parsed.filesCreated.length > 0) {
            storyFiles.set(s.id, parsed.filesCreated);
          }
        }
      }
      const allStoryIds = [...storyFiles.keys()];
      for (let a = 0; a < allStoryIds.length; a++) {
        for (let b = a + 1; b < allStoryIds.length; b++) {
          const filesA = new Set(storyFiles.get(allStoryIds[a])!);
          const filesB = storyFiles.get(allStoryIds[b])!;
          const overlap = filesB.filter((f) => filesA.has(f));
          if (overlap.length > 0) {
            console.warn(`[CONFLICT] Stories ${allStoryIds[a]} and ${allStoryIds[b]} both modified: ${overlap.join(", ")}`);
          }
        }
      }
    }

    // Sequential post-wave: COMMIT → plan update → save
    for (let i = 0; i < settled.length; i++) {
      const story = wave[i];
      const result = settled[i];

      if (result.status === "rejected") {
        // Unexpected error (e.g. agent crash)
        const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.error(`[${story.id}] Error:`, errorMessage);
        plan = updateStoryStatus(plan, story.id, "failed");
        plan = {
          ...plan,
          stories: plan.stories.map((s) =>
            s.id === story.id ? { ...s, errorMessage, lastFailedStage: "execute" } : s,
          ),
        };

        appendLogEntry(logPath, createLogEntry("FAILED", {
          cycle: 1,
          storyId: story.id,
          reason: errorMessage,
        }));
      } else if (result.value.passed) {
        // COMMIT sub-pipeline (US-15) — serialized, no git races
        const storyModuleCwd = getModuleCwd(plan, story.moduleId);
        console.log(`[${story.id}] COMMIT: Starting...`);
        const commitResult = await runCommit(story, dirs.workingDir, {
          passed: true,
          attempts: result.value.attempts,
          testReportPath: join(dirs.workingDir, `reports/${story.id}/test-report.md`),
          evalReportPath: join(dirs.workingDir, `reports/${story.id}/eval-report.md`),
          parserConfidence: "default",
        }, config, storyModuleCwd);
        plan = updateStoryStatus(plan, story.id, "passed");

        // Track attempts from verify
        for (let a = 0; a < result.value.attempts; a++) {
          plan = { ...plan, stories: plan.stories.map((s) => s.id === story.id ? { ...s, attempts: s.attempts + 1 } : s) };
        }

        if (commitResult.committed && commitResult.commitHash) {
          plan = markCommitted(plan, story.id, commitResult.commitHash);

          appendLogEntry(logPath, createLogEntry("COMMIT_COMPLETE", {
            storyId: story.id,
            commitHash: commitResult.commitHash,
          }));
        } else {
          console.warn(`[${story.id}] Warning: Commit failed: ${commitResult.error ?? "unknown error"}`);
          appendLogEntry(logPath, createLogEntry("COMMIT_FAILED", {
            storyId: story.id,
            error: commitResult.error ?? "unknown error",
          }));
        }

        appendLogEntry(logPath, createLogEntry("COMPLETED", {
          cycle: 1,
          storyId: story.id,
          testResults: { total: 0, passed: 0, failed: 0 },
          evalVerdict: "PASS",
          attempt: result.value.attempts,
        }));
      } else {
        // Verification failed after max attempts
        plan = updateStoryStatus(plan, story.id, "failed");
        plan = {
          ...plan,
          stories: plan.stories.map((s) =>
            s.id === story.id ? { ...s, errorMessage: result.value.errorMessage ?? "Verification failed", lastFailedStage: "verify", attempts: result.value.attempts } : s,
          ),
        };

        appendLogEntry(logPath, createLogEntry("FAILED", {
          cycle: 1,
          storyId: story.id,
          reason: result.value.errorMessage ?? "Verification failed after max attempts",
        }));
      }
    }

    // Single disk write per wave
    saveExecutionPlan(planPath, plan);
    await safeUpdateManifest(dirs.workingDir);

    // Sequential LEARN — no memory.md races
    for (const story of wave) {
      console.log(`[${story.id}] LEARN: Starting...`);
      await runLearn(story, dirs, config, costTracker, roleReportsDir);
    }

    // Budget enforcement after wave (not per-story)
    costTracker?.enforceBudget();
  }

  // K18: Best-effort cleanup of scratch directories
  try { rmSync(join(dirs.labDir, "tmp"), { recursive: true, force: true }); } catch { /* best-effort */ }

  // Check if all stories failed
  const allFailed = plan.stories.every((s) => s.status === "failed");
  if (allFailed) {
    console.error("All stories failed. Halting.");
  }
}

export async function runReportStage(
  dirs: PipelineDirs,
  config: HiveMindConfig,
): Promise<void> {
  console.log("Running REPORT stage...");
  await reportStage(dirs, config);
}

/**
 * Bug-fix pipeline: BASELINE → DIAGNOSE → checkpoint → FIX → VERIFY (max 3 attempts)
 * Returns exit code: 0 = fix verified, 1 = max attempts exceeded
 */
export async function runBugFixPipeline(
  bugReportPath: string,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  options?: { silent?: boolean; skipBaseline?: boolean },
): Promise<number> {
  const bugFixDir = join(dirs.workingDir, "reports", "bug-fix");
  ensureDir(dirs.workingDir);
  ensureDir(join(dirs.workingDir, "reports"));
  ensureDir(bugFixDir);

  const logPath = join(dirs.workingDir, "manager-log.jsonl");
  const maxAttempts = 3;

  // Read bug report
  const bugContent = readFileSafe(bugReportPath);
  if (!bugContent) {
    throw new HiveMindError(`Bug report not found: ${bugReportPath}`);
  }

  // BASELINE capture
  if (!options?.skipBaseline) {
    console.log("BASELINE: Capturing pre-fix test results...");
    const baselineResult = await runShell(config.baselineTestCommand, { timeout: config.shellTimeout });
    const totalMatch = baselineResult.stdout.match(/Tests?\s+(\d+)/i);
    const passMatch = baselineResult.stdout.match(/(\d+)\s+pass/i);
    const failMatch = baselineResult.stdout.match(/(\d+)\s+fail/i);

    // Parse failing test names (vitest/jest format)
    const failingNames: string[] = [];
    const failNameRegex = /[✗×✘]\s+(.+)/g;
    let match;
    while ((match = failNameRegex.exec(baselineResult.stdout)) !== null) {
      failingNames.push(match[1].trim());
    }

    const baseline = {
      capturedAt: isoTimestamp(),
      totalTests: totalMatch ? parseInt(totalMatch[1]) : 0,
      passed: passMatch ? parseInt(passMatch[1]) : 0,
      failed: failMatch ? parseInt(failMatch[1]) : 0,
      failingTestNames: failingNames,
    };

    writeFileAtomic(join(bugFixDir, "baseline.json"), JSON.stringify(baseline, null, 2) + "\n");
    console.log(`BASELINE: ${baseline.totalTests} tests (${baseline.passed} pass, ${baseline.failed} fail)`);
  } else {
    console.log("BASELINE: Skipped (--skip-baseline)");
  }

  // Initialize or load bug-fix state
  let state: BugFixState = loadBugFixState(bugFixDir) ?? {
    attemptNumber: 1,
    checkpointFired: false,
    startedAt: isoTimestamp(),
  };
  saveBugFixState(bugFixDir, state);

  const attempts: Array<{ diagnosisPath: string; verifyReason: string }> = [];

  // Fix loop: DIAGNOSE → checkpoint → FIX → VERIFY (max 3 attempts)
  for (let attempt = state.attemptNumber; attempt <= maxAttempts; attempt++) {
    state.attemptNumber = attempt;
    saveBugFixState(bugFixDir, state);

    // DIAGNOSE
    const diagResult = await runDiagnose(bugReportPath, dirs, config, attempt);

    if (!diagResult.success) {
      console.error(`DIAGNOSE failed on attempt ${attempt}`);
      attempts.push({ diagnosisPath: diagResult.reportPath, verifyReason: "Diagnosis failed" });
      continue;
    }

    appendLogEntry(logPath, createLogEntry("DIAGNOSE_COMPLETE", {
      attempt,
      confidence: diagResult.confidence,
      shouldEscalate: diagResult.shouldEscalate,
    }));

    // Human checkpoint (first pass only)
    if (!state.checkpointFired) {
      state.checkpointFired = true;
      saveBugFixState(bugFixDir, state);

      writeCheckpoint(dirs.workingDir, {
        awaiting: "approve-diagnosis",
        message: getCheckpointMessage("approve-diagnosis"),
        timestamp: isoTimestamp(),
        feedback: null,
      });

      console.log("DIAGNOSE complete. Awaiting approval.");
      console.log(getCheckpointMessage("approve-diagnosis"));
      notifyCheckpoint(options?.silent ?? false);
      return 0; // Pipeline pauses here — resumed via approve command
    }

    // FIX stage — spawn fixer agent
    console.log(`FIX: Running fixer (attempt ${attempt})...`);
    const fixReportPath = join(bugFixDir, `fix-report-attempt-${attempt}.md`);

    const toSlash = (p: string): string => p.replace(/\\/g, "/");
    await spawnAgentWithRetry({
      type: "fixer",
      model: "sonnet",
      inputFiles: [toSlash(diagResult.reportPath), toSlash(bugReportPath)],
      outputFile: toSlash(fixReportPath),
      rules: getAgentRules("fixer"),
      memoryContent: readFileSafe(join(dirs.knowledgeDir, "memory.md")) ?? "",
    }, config);

    appendLogEntry(logPath, createLogEntry("FIX_COMPLETE", { attempt }));

    // VERIFY — run test suite and check for regressions
    console.log(`VERIFY: Running tests (attempt ${attempt})...`);
    const verifyResult = await runShell(config.baselineTestCommand, { timeout: config.shellTimeout });

    // Check for regressions against baseline
    const baselineContent = readFileSafe(join(bugFixDir, "baseline.json"));
    let verifyPassed = verifyResult.exitCode === 0;
    let verifyReason = verifyPassed ? "PASS" : "Tests failed";

    if (baselineContent && verifyResult.exitCode !== 0) {
      try {
        const baseline = JSON.parse(baselineContent);
        const preExistingFails = new Set(baseline.failingTestNames ?? []);
        // Check if all failures are pre-existing
        const failNameRegex = /[✗×✘]\s+(.+)/g;
        let match;
        const newFailures: string[] = [];
        while ((match = failNameRegex.exec(verifyResult.stdout)) !== null) {
          const name = match[1].trim();
          if (!preExistingFails.has(name)) {
            newFailures.push(name);
          }
        }
        if (newFailures.length === 0) {
          verifyPassed = true;
          verifyReason = "PASS (only pre-existing failures)";
        } else {
          verifyReason = `New regressions: ${newFailures.slice(0, 3).join(", ")}`;
        }
      } catch {
        verifyReason = "Tests failed (baseline parse error)";
      }
    }

    appendLogEntry(logPath, createLogEntry("VERIFY_COMPLETE", {
      attempt,
      passed: verifyPassed,
      reason: verifyReason,
    }));

    if (verifyPassed) {
      console.log(`VERIFY: PASS (attempt ${attempt})`);

      // COMMIT
      console.log("COMMIT: Committing fix...");
      const commitResult = await runShell(
        `git add -A && git commit -m "fix: bug fix applied by hive-mind bug pipeline"`,
        { timeout: config.shellTimeout },
      );

      if (commitResult.exitCode === 0) {
        console.log("Bug fix committed successfully.");
        appendLogEntry(logPath, createLogEntry("BUG_FIX_COMPLETE", { attempt }));
      } else {
        console.warn(`Commit failed: ${commitResult.stderr}`);
      }

      return 0;
    }

    console.warn(`VERIFY: FAIL (attempt ${attempt}) — ${verifyReason}`);
    attempts.push({ diagnosisPath: diagResult.reportPath, verifyReason });
  }

  // Max attempts exceeded
  writePartialReport(bugFixDir, "Bug Fix", attempts);
  console.error("Max fix attempts reached — review partial-report.md and fix manually");
  appendLogEntry(logPath, createLogEntry("BUG_FIX_EXHAUSTED", { attempts: maxAttempts }));
  return 1;
}

/**
 * Resume bug-fix pipeline after diagnosis approval.
 * Continues from FIX stage.
 */
export async function resumeBugFixPipeline(
  dirs: PipelineDirs,
  config: HiveMindConfig,
  _options?: { silent?: boolean },
): Promise<number> {
  const bugFixDir = join(dirs.workingDir, "reports", "bug-fix");
  const state = loadBugFixState(bugFixDir);
  if (!state) {
    throw new HiveMindError("No bug-fix state found. Run 'hive-mind bug --report <path>' first.");
  }

  // Find the bug report path from state directory
  const bugReportPaths = [
    join(dirs.workingDir, "..", "bug-report.md"),
    join(dirs.workingDir, "bug-report.md"),
  ];
  let bugReportPath: string | undefined;
  for (const p of bugReportPaths) {
    if (fileExists(p)) {
      bugReportPath = p;
      break;
    }
  }

  const logPath = join(dirs.workingDir, "manager-log.jsonl");
  const maxAttempts = 3;
  const attempts: Array<{ diagnosisPath: string; verifyReason: string }> = [];

  const toSlash = (p: string): string => p.replace(/\\/g, "/");

  for (let attempt = state.attemptNumber; attempt <= maxAttempts; attempt++) {
    state.attemptNumber = attempt;
    saveBugFixState(bugFixDir, state);

    const currentDiagPath = join(bugFixDir, `diagnosis-report-attempt-${attempt}.md`);

    // On first resume, diagnosis is already done (from before checkpoint)
    // On subsequent attempts, run diagnosis again
    if (attempt > state.attemptNumber || !fileExists(currentDiagPath)) {
      if (bugReportPath) {
        await runDiagnose(bugReportPath, dirs, config, attempt);
      }
    }

    // FIX stage
    console.log(`FIX: Running fixer (attempt ${attempt})...`);
    const fixReportPath = join(bugFixDir, `fix-report-attempt-${attempt}.md`);

    const fixInputFiles = [toSlash(currentDiagPath)];
    if (bugReportPath) fixInputFiles.push(toSlash(bugReportPath));

    await spawnAgentWithRetry({
      type: "fixer",
      model: "sonnet",
      inputFiles: fixInputFiles,
      outputFile: toSlash(fixReportPath),
      rules: getAgentRules("fixer"),
      memoryContent: readFileSafe(join(dirs.knowledgeDir, "memory.md")) ?? "",
    }, config);

    appendLogEntry(logPath, createLogEntry("FIX_COMPLETE", { attempt }));

    // VERIFY
    console.log(`VERIFY: Running tests (attempt ${attempt})...`);
    const verifyResult = await runShell(config.baselineTestCommand, { timeout: config.shellTimeout });

    const baselineContent = readFileSafe(join(bugFixDir, "baseline.json"));
    let verifyPassed = verifyResult.exitCode === 0;
    let verifyReason = verifyPassed ? "PASS" : "Tests failed";

    if (baselineContent && verifyResult.exitCode !== 0) {
      try {
        const baseline = JSON.parse(baselineContent);
        const preExistingFails = new Set(baseline.failingTestNames ?? []);
        const failNameRegex = /[✗×✘]\s+(.+)/g;
        let match;
        const newFailures: string[] = [];
        while ((match = failNameRegex.exec(verifyResult.stdout)) !== null) {
          const name = match[1].trim();
          if (!preExistingFails.has(name)) {
            newFailures.push(name);
          }
        }
        if (newFailures.length === 0) {
          verifyPassed = true;
          verifyReason = "PASS (only pre-existing failures)";
        } else {
          verifyReason = `New regressions: ${newFailures.slice(0, 3).join(", ")}`;
        }
      } catch {
        verifyReason = "Tests failed (baseline parse error)";
      }
    }

    appendLogEntry(logPath, createLogEntry("VERIFY_COMPLETE", {
      attempt,
      passed: verifyPassed,
      reason: verifyReason,
    }));

    if (verifyPassed) {
      console.log(`VERIFY: PASS (attempt ${attempt})`);
      const commitResult = await runShell(
        `git add -A && git commit -m "fix: bug fix applied by hive-mind bug pipeline"`,
        { timeout: config.shellTimeout },
      );
      if (commitResult.exitCode === 0) {
        console.log("Bug fix committed successfully.");
      }
      return 0;
    }

    console.warn(`VERIFY: FAIL (attempt ${attempt}) — ${verifyReason}`);
    attempts.push({ diagnosisPath: currentDiagPath, verifyReason });
  }

  writePartialReport(bugFixDir, "Bug Fix", attempts);
  console.error("Max fix attempts reached — review partial-report.md and fix manually");
  return 1;
}
