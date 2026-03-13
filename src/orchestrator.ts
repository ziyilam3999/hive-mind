import type { Checkpoint } from "./types/checkpoint.js";
import type { ExecutionPlan, SubTask } from "./types/execution-plan.js";
import type { HiveMindConfig } from "./config/schema.js";
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
} from "./state/execution-plan.js";
import { runWithConcurrency } from "./utils/concurrency.js";
import { appendLogEntry, createLogEntry } from "./state/manager-log.js";
import { isoTimestamp } from "./utils/timestamp.js";
import { join } from "node:path";
import { HiveMindError } from "./utils/errors.js";
import { notifyCheckpoint } from "./utils/notify.js";
import { CostTracker } from "./utils/cost-tracker.js";
import { runSpecStage as specStage } from "./stages/spec-stage.js";
import { runPlanStage as planStage } from "./stages/plan-stage.js";
import { runBuild } from "./stages/execute-build.js";
import { runVerify, type VerifyResult } from "./stages/execute-verify.js";
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

async function safeUpdateManifest(hiveMindDir: string): Promise<void> {
  try {
    await updateManifest(hiveMindDir);
  } catch (err) {
    console.warn(`Warning: Manifest update failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function runPipeline(
  prdPath: string,
  hiveMindDir: string,
  config: HiveMindConfig,
  options?: { silent?: boolean; budget?: number; skipBaseline?: boolean },
): Promise<void> {
  if (!fileExists(prdPath)) {
    throw new HiveMindError(`PRD file not found: ${prdPath}`);
  }

  ensureDir(hiveMindDir);
  ensureDir(join(hiveMindDir, "spec"));
  ensureDir(join(hiveMindDir, "plans"));
  ensureDir(join(hiveMindDir, "reports"));

  const memoryPath = join(hiveMindDir, "memory.md");
  if (!fileExists(memoryPath)) {
    createMemoryFromTemplate(memoryPath);
  }

  await runSpecStage(prdPath, hiveMindDir, config);
  await safeUpdateManifest(hiveMindDir);

  const logPath0 = join(hiveMindDir, "manager-log.jsonl");
  const specDir = join(hiveMindDir, "spec");
  const specFiles = fileExists(specDir) ? (await import("node:fs")).readdirSync(specDir).filter((f: string) => f.endsWith(".md")) : [];
  appendLogEntry(logPath0, createLogEntry("SPEC_COMPLETE", {
    artifactCount: specFiles.length,
  }));

  writeCheckpoint(hiveMindDir, {
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
  hiveMindDir: string,
  config: HiveMindConfig,
  options?: { silent?: boolean; skipBaseline?: boolean },
): Promise<void> {
  const silent = options?.silent ?? false;
  const feedback = checkpoint.feedback ?? undefined;

  switch (checkpoint.awaiting) {
    case "approve-spec": {
      deleteCheckpoint(hiveMindDir);

      // Tooling detect/setup (US-11)
      const specPath = join(hiveMindDir, "spec", "SPEC-v1.0.md");
      const specContent = readFileSafe(specPath);
      if (specContent) {
        const requirements = parseRequiredTooling(specContent);
        if (requirements.length > 0) {
          const { allDetected } = await detectAllTools(requirements, config);
          if (!allDetected) {
            const setupOk = await runToolingSetup(requirements, hiveMindDir, config);
            if (!setupOk) {
              throw new HiveMindError("Tooling setup failed. Please install required tools manually.");
            }
          }
        }
      }

      await runPlanStage(hiveMindDir, config, feedback);
      await safeUpdateManifest(hiveMindDir);

      const planLogPath = join(hiveMindDir, "manager-log.jsonl");
      const planFilePath = join(hiveMindDir, "plans", "execution-plan.json");
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

      writeCheckpoint(hiveMindDir, {
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
      deleteCheckpoint(hiveMindDir);

      // Baseline check — verify codebase compiles and tests pass before burning agent tokens
      if (!options?.skipBaseline) {
        await runBaselineCheck(config);
      }

      const tracker = new CostTracker();
      await runExecuteStage(hiveMindDir, config, tracker);

      const summary = tracker.getSummary();
      if (summary.totalCostUsd > 0) {
        console.log(`\nCost summary: $${summary.totalCostUsd.toFixed(4)} total`);
        for (const [storyId, cost] of summary.perStory) {
          console.log(`  ${storyId}: $${cost.toFixed(4)}`);
        }
      }

      await runReportStage(hiveMindDir, config);
      await safeUpdateManifest(hiveMindDir);

      writeCheckpoint(hiveMindDir, {
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
    case "verify": {
      deleteCheckpoint(hiveMindDir);

      writeCheckpoint(hiveMindDir, {
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
      deleteCheckpoint(hiveMindDir);
      console.log("Pipeline complete.");
      break;
    }
  }
}

export async function runSpecStage(
  prdPath: string,
  hiveMindDir: string,
  config: HiveMindConfig,
  feedback?: string,
): Promise<void> {
  console.log("Running SPEC stage...");
  await specStage(prdPath, hiveMindDir, config, feedback);
}

export async function runPlanStage(
  hiveMindDir: string,
  config: HiveMindConfig,
  feedback?: string,
): Promise<void> {
  console.log("Running PLAN stage...");
  await planStage(hiveMindDir, config, feedback);
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
  hiveMindDir: string,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
): Promise<StoryExecutionResult> {
  // FW-01: If story has sub-tasks, execute per sub-task
  if (story.subTasks && story.subTasks.length > 0) {
    return executeStoryWithSubTasks(story, hiveMindDir, config, costTracker, roleReportsDir);
  }

  return executeWholeStory(story, hiveMindDir, config, costTracker, roleReportsDir);
}

/** Original whole-story execution path */
async function executeWholeStory(
  story: Story,
  hiveMindDir: string,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
): Promise<StoryExecutionResult> {
  const logPath = join(hiveMindDir, "manager-log.jsonl");

  // BUILD sub-pipeline (US-13)
  console.log(`[${story.id}] BUILD: Starting...`);
  await runBuild(story, hiveMindDir, config, costTracker, roleReportsDir);

  appendLogEntry(logPath, createLogEntry("BUILD_COMPLETE", {
    storyId: story.id,
  }));

  // COMPLIANCE check — between BUILD and VERIFY (ENH-17)
  // Non-fatal (P39): failure → proceed to VERIFY
  const complianceResult = await runComplianceCheck(story, hiveMindDir, config, costTracker, roleReportsDir);
  if (!complianceResult.skipped) {
    appendLogEntry(logPath, createLogEntry("COMPLIANCE_CHECK", {
      storyId: story.id,
      passed: complianceResult.passed,
      missing: complianceResult.result?.missing ?? 0,
      done: complianceResult.result?.done ?? 0,
    }));
  }

  // VERIFY sub-pipeline (US-14) — no plan writes (refactored in Step 5)
  console.log(`[${story.id}] VERIFY: Starting...`);
  const verifyResult = await runVerify(story, hiveMindDir, undefined, config, costTracker, roleReportsDir);

  return {
    storyId: story.id,
    passed: verifyResult.passed,
    attempts: verifyResult.attempts,
    errorMessage: verifyResult.passed ? undefined : "Verification failed after max attempts",
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
  hiveMindDir: string,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
): Promise<StoryExecutionResult> {
  const logPath = join(hiveMindDir, "manager-log.jsonl");
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
      await runBuild(story, hiveMindDir, config, costTracker, roleReportsDir, {
        sourceFiles: subTask.sourceFiles,
        title: subTask.title,
      });

      appendLogEntry(logPath, createLogEntry("BUILD_COMPLETE", {
        storyId: `${story.id}/${subTask.id}`,
      }));

      console.log(`[${story.id}/${subTask.id}] VERIFY: Starting...`);
      const verifyResult = await runVerify(story, hiveMindDir, undefined, config, costTracker, roleReportsDir, {
        sourceFiles: subTask.sourceFiles,
        title: subTask.title,
      });

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
  const complianceResult = await runComplianceCheck(story, hiveMindDir, config, costTracker, roleReportsDir);
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
  hiveMindDir: string,
  config: HiveMindConfig,
  costTracker?: CostTracker,
): Promise<void> {
  console.log("Running EXECUTE stage...");

  const planPath = join(hiveMindDir, "plans", "execution-plan.json");
  if (!fileExists(planPath)) {
    console.log("No execution plan found. Skipping EXECUTE stage.");
    return;
  }

  const logPath = join(hiveMindDir, "manager-log.jsonl");
  let plan: ExecutionPlan = loadExecutionPlan(planPath);

  validateDependencies(plan);

  // Crash recovery: reset any in-progress stories from prior crash/abort
  plan = resetCrashedStories(plan);
  if (plan.stories.some((s) => s.status === "not-started")) {
    saveExecutionPlan(planPath, plan);
  }

  const roleReportsDir = join(hiveMindDir, "plans", "role-reports");

  // Wave executor: process stories in waves of non-overlapping, dependency-ready stories
  while (true) {
    const ready = getReadyStories(plan);
    const wave = filterNonOverlapping(ready);
    if (wave.length === 0) break;

    console.log(`\nWave: executing ${wave.map((s) => s.id).join(", ")}`);

    // Mark wave stories as in-progress
    for (const s of wave) {
      plan = updateStoryStatus(plan, s.id, "in-progress");
    }
    saveExecutionPlan(planPath, plan);

    // Parallel BUILD+VERIFY (bounded by maxConcurrency)
    const tasks = wave.map((s) => () => executeOneStory(s, hiveMindDir, config, costTracker, roleReportsDir));
    const settled = await runWithConcurrency(tasks, config.maxConcurrency);

    // Post-BUILD conflict detection: warn if actual files modified overlap between wave stories
    if (wave.length > 1) {
      const storyFiles = new Map<string, string[]>();
      for (const s of wave) {
        const implPath = join(hiveMindDir, getReportPath(s.id, "impl-report.md"));
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
        console.log(`[${story.id}] COMMIT: Starting...`);
        const commitResult = await runCommit(story, hiveMindDir, {
          passed: true,
          attempts: result.value.attempts,
          testReportPath: join(hiveMindDir, `reports/${story.id}/test-report.md`),
          evalReportPath: join(hiveMindDir, `reports/${story.id}/eval-report.md`),
          parserConfidence: "default",
        }, config);
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
    await safeUpdateManifest(hiveMindDir);

    // Sequential LEARN — no memory.md races
    for (const story of wave) {
      console.log(`[${story.id}] LEARN: Starting...`);
      await runLearn(story, hiveMindDir, config, costTracker, roleReportsDir);
    }

    // Budget enforcement after wave (not per-story)
    costTracker?.enforceBudget();
  }

  // Check if all stories failed
  const allFailed = plan.stories.every((s) => s.status === "failed");
  if (allFailed) {
    console.error("All stories failed. Halting.");
  }
}

export async function runReportStage(
  hiveMindDir: string,
  config: HiveMindConfig,
): Promise<void> {
  console.log("Running REPORT stage...");
  await reportStage(hiveMindDir, config);
}
