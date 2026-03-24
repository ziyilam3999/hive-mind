import type { Checkpoint } from "./types/checkpoint.js";
import type { ExecutionPlan, SourceFileEntry } from "./types/execution-plan.js";
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
import { join, resolve, dirname } from "node:path";
import { rmSync, readdirSync, writeFileSync, copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { basename } from "node:path";
import { HiveMindError } from "./utils/errors.js";
import { notifyCheckpoint } from "./utils/notify.js";
import { CostTracker, estimatePipelineCost } from "./utils/cost-tracker.js";
import { runSpecStage as specStage } from "./stages/spec-stage.js";
import { runPlanStage as planStage } from "./stages/plan-stage.js";
import { runBuild } from "./stages/execute-build.js";
import { runVerify } from "./stages/execute-verify.js";
import { runCommit } from "./stages/execute-commit.js";
import { runLearn } from "./stages/execute-learn.js";
import { runComplianceCheck } from "./stages/execute-compliance.js";
import { parseRequiredTooling, detectAllTools, scanStepFileForTools, detectToolBySpawn } from "./tooling/detect.js";
import { runToolingSetup } from "./tooling/setup.js";
import { runReportStage as reportStage } from "./stages/report-stage.js";
import { updateLiveReport } from "./reports/live-report.js";
import { runBaselineCheck } from "./stages/baseline-check.js";
import { runNormalizeStage } from "./stages/normalize-stage.js";
import { updateManifest } from "./manifest/generator.js";
import { parseImplReport, parseRefactorReport } from "./reports/parser.js";
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
import { runScorecard } from "./stages/scorecard.js";
import { startDashboard } from "./dashboard/server.js";

function printTimingSummary(tracker: CostTracker): void {
  const timing = tracker.getTimingSummary();
  if (timing.agentCount > 0) {
    console.log(`\nTiming summary (${timing.agentCount} agents, ${(timing.totalDurationMs / 1000).toFixed(1)}s total):`);
    console.log(`  Fastest: ${timing.fastest!.agentType} (${timing.fastest!.storyId}) — ${(timing.fastest!.durationMs / 1000).toFixed(1)}s`);
    console.log(`  Median:  ${timing.median!.agentType} (${timing.median!.storyId}) — ${(timing.median!.durationMs / 1000).toFixed(1)}s`);
    console.log(`  Slowest: ${timing.slowest!.agentType} (${timing.slowest!.storyId}) — ${(timing.slowest!.durationMs / 1000).toFixed(1)}s`);
  }
}

function writeTimingReport(tracker: CostTracker, workingDir: string): void {
  const timing = tracker.getTimingSummary();
  if (timing.agentCount === 0) return;

  const lines: string[] = [
    "# Agent Timing Report",
    "",
    "## Summary",
    `- Total agents: ${timing.agentCount}`,
    `- Total duration: ${(timing.totalDurationMs / 1000).toFixed(1)}s`,
    `- Fastest: ${timing.fastest!.agentType} (${timing.fastest!.storyId}) — ${(timing.fastest!.durationMs / 1000).toFixed(1)}s`,
    `- Median: ${timing.median!.agentType} (${timing.median!.storyId}) — ${(timing.median!.durationMs / 1000).toFixed(1)}s`,
    `- Slowest: ${timing.slowest!.agentType} (${timing.slowest!.storyId}) — ${(timing.slowest!.durationMs / 1000).toFixed(1)}s`,
    "",
    "## All Agents (sorted by duration)",
    "| # | Stage | Agent | Duration | Cost |",
    "|---|-------|-------|----------|------|",
  ];

  timing.perAgent.forEach((entry, i) => {
    lines.push(`| ${i + 1} | ${entry.storyId} | ${entry.agentType} | ${(entry.durationMs / 1000).toFixed(1)}s | $${entry.costUsd.toFixed(4)} |`);
  });

  lines.push("");
  writeFileAtomic(join(workingDir, "timing-report.md"), lines.join("\n"));
  console.log(`Timing report written to ${join(workingDir, "timing-report.md")}`);
}

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
  options?: { silent?: boolean; budget?: number; skipBaseline?: boolean; stopAfterPlan?: boolean; skipNormalize?: boolean; greenfield?: boolean; noDashboard?: boolean },
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

  // Dashboard lifecycle — non-fatal observer (DESIGN-01)
  let dashboardHandle: { stop: () => void; url: string; signalShutdown: (shutdownAt: number) => void } | null = null;
  if (!options?.noDashboard) {
    try {
      dashboardHandle = await startDashboard(dirs, config);
    } catch (err) {
      process.stderr.write(`Dashboard server error: ${err instanceof Error ? err.message : String(err)}\n`);
      dashboardHandle = null;
    }
  }

  try {
    // Log original PRD path and flags for rejection-loop recovery
    const logPath0 = join(dirs.workingDir, "manager-log.jsonl");
    appendLogEntry(logPath0, createLogEntry("PIPELINE_START", { prdPath, stopAfterPlan: options?.stopAfterPlan ?? false, budget: options?.budget, greenfield: options?.greenfield }));
    if (config.liveReport) updateLiveReport(dirs.workingDir, "NORMALIZE", "Pipeline started");

    const skipNormalize = options?.skipNormalize ?? config.skipNormalize;

    if (!skipNormalize) {
      console.log("Running NORMALIZE stage...");
      await runNormalizeStage(prdPath, dirs, config);
      await runScorecard("normalize", dirs, config);
      if (config.liveReport) updateLiveReport(dirs.workingDir, "NORMALIZE", "Normalize complete, awaiting approval");
      console.log("NORMALIZE stage complete. Awaiting approval.");

      writeCheckpoint(dirs.workingDir, {
        awaiting: "approve-normalize",
        message: getCheckpointMessage("approve-normalize"),
        timestamp: isoTimestamp(),
        feedback: null,
      });

      console.log(getCheckpointMessage("approve-normalize"));
      notifyCheckpoint(options?.silent ?? false, "Normalize complete. Review and approve to continue.");
      return;
    }

    // skipNormalize — proceed directly to SPEC with original PRD
    const costLogPath = join(dirs.workingDir, "cost-log.jsonl");
    const tracker = new CostTracker(options?.budget, costLogPath);
    await runSpecThenCheckpoint(prdPath, dirs, config, options?.silent ?? false, options?.stopAfterPlan, options?.greenfield, tracker);
  } finally {
    const handle = dashboardHandle;
    if (handle) {
      handle.signalShutdown(Date.now() + 60_000);
      setTimeout(() => handle.stop(), 60_000);
    }
  }
}

async function runSpecThenCheckpoint(
  prdPath: string,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  silent: boolean,
  stopAfterPlan?: boolean,
  greenfield?: boolean,
  tracker?: CostTracker,
): Promise<void> {
  appendLogEntry(join(dirs.workingDir, "manager-log.jsonl"), createLogEntry("SPEC_START", {}));
  console.log("Running SPEC stage...");
  await specStage(prdPath, dirs, config, undefined, greenfield, tracker);
  await safeUpdateManifest(dirs.workingDir);
  await runScorecard("spec", dirs, config);

  const specLogPath = join(dirs.workingDir, "manager-log.jsonl");
  const specDir = join(dirs.workingDir, "spec");
  const specFiles = fileExists(specDir) ? readdirSync(specDir).filter((f: string) => f.endsWith(".md")) : [];
  appendLogEntry(specLogPath, createLogEntry("SPEC_COMPLETE", {
    artifactCount: specFiles.length,
  }));
  if (config.liveReport) updateLiveReport(dirs.workingDir, "SPEC", "Spec complete, awaiting approval");

  // --stop-after-plan: auto-approve SPEC, run PLAN, print summary, exit
  if (stopAfterPlan) {
    const planResult = await runPlanStage(dirs, config, undefined, greenfield, tracker);
    await safeUpdateManifest(dirs.workingDir);

    // Emit REGISTRY_GAP_FIXED log entries from plan-stage metadata
    for (const gap of planResult.registryGapsFixed) {
      appendLogEntry(specLogPath, createLogEntry("REGISTRY_GAP_FIXED", {
        registryFile: gap.registryFile,
        storyId: gap.storyId,
      }));
    }

    const planFilePath = join(dirs.workingDir, "plans", "execution-plan.json");
    if (fileExists(planFilePath)) {
      const planData = loadExecutionPlan(planFilePath);
      if (config.liveReport) updateLiveReport(dirs.workingDir, "PLAN", `Plan complete — ${planData.stories.length} stories`);
      console.log("\n--- Plan Preview (--stop-after-plan) ---");
      console.log(`Stories: ${planData.stories.length}`);
      for (const s of planData.stories) {
        const fileCount = getSourceFilePaths(s.sourceFiles).length;
        console.log(`  ${s.id}: ${s.title} (${fileCount} files)`);
      }
      console.log("\nPipeline stopped after PLAN. No EXECUTE agents were spawned.");
    }

    if (config.liveReport) updateLiveReport(dirs.workingDir, "COMPLETE", "Pipeline stopped after PLAN");

    if (tracker) {
      printTimingSummary(tracker);
      writeTimingReport(tracker, dirs.workingDir);
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
  notifyCheckpoint(silent);
}

function getPipelineStartData(workingDir: string): { prdPath: string; stopAfterPlan: boolean; budget?: number; greenfield?: boolean } {
  const logPath = join(workingDir, "manager-log.jsonl");
  const logContent = readFileSafe(logPath);
  if (!logContent) {
    throw new HiveMindError("manager-log.jsonl not found — cannot determine original PRD path");
  }

  // Parse JSONL: find the LAST PIPELINE_START entry (last-wins for append-only log)
  const lines = logContent.trim().split("\n");
  let lastData: { prdPath: string; stopAfterPlan: boolean; budget?: number; greenfield?: boolean } | undefined;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.action === "PIPELINE_START" && entry.prdPath) {
        lastData = {
          prdPath: entry.prdPath,
          stopAfterPlan: entry.stopAfterPlan ?? false,
          budget: entry.budget,
          greenfield: entry.greenfield,
        };
      }
    } catch {
      continue; // skip malformed lines
    }
  }

  if (!lastData) {
    throw new HiveMindError("PIPELINE_START entry not found in manager-log.jsonl — cannot determine original PRD path for re-normalization");
  }

  return lastData;
}

export async function resumeFromCheckpoint(
  checkpoint: Checkpoint,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  options?: { silent?: boolean; skipBaseline?: boolean; stopAfterPlan?: boolean; noDashboard?: boolean },
): Promise<void> {
  const silent = options?.silent ?? false;
  const feedback = checkpoint.feedback ?? undefined;

  switch (checkpoint.awaiting) {
    case "approve-normalize": {
      deleteCheckpoint(dirs.workingDir);

      const normalizedPrd = join(dirs.workingDir, "normalize", "normalized-prd.md");
      const normalizedContent = readFileSafe(normalizedPrd);
      if (normalizedContent === null) {
        throw new HiveMindError("normalized-prd.md not found — re-run normalize stage");
      }
      if (normalizedContent.trim() === "") {
        throw new HiveMindError("normalized-prd.md is empty — re-run normalize stage");
      }

      const startData = getPipelineStartData(dirs.workingDir);

      if (feedback) {
        console.log(`Re-running NORMALIZE with feedback...`);
        await runNormalizeStage(startData.prdPath, dirs, config, feedback);

        writeCheckpoint(dirs.workingDir, {
          awaiting: "approve-normalize",
          message: getCheckpointMessage("approve-normalize"),
          timestamp: isoTimestamp(),
          feedback: null,
        });

        if (config.liveReport) updateLiveReport(dirs.workingDir, "NORMALIZE", "NORMALIZE re-run with feedback complete, awaiting approval");
        console.log("NORMALIZE stage updated. Review again.");
        console.log(getCheckpointMessage("approve-normalize"));
        notifyCheckpoint(silent);
        return;
      }

      // Approved — proceed to SPEC with normalized PRD
      const normCostLogPath = join(dirs.workingDir, "cost-log.jsonl");
      const normalizeTracker = CostTracker.loadFromDisk(normCostLogPath, startData.budget);
      await runSpecThenCheckpoint(normalizedPrd, dirs, config, silent, startData.stopAfterPlan, startData.greenfield, normalizeTracker);
      break;
    }
    case "approve-spec": {
      deleteCheckpoint(dirs.workingDir);
      const startDataSpec = getPipelineStartData(dirs.workingDir);

      if (feedback) {
        // REQ-08: Re-run spec from feature drafter onward (reuse S.0/S.1/S.2 artifacts)
        const specCostLogPathFb = join(dirs.workingDir, "cost-log.jsonl");
        const specTrackerFb = CostTracker.loadFromDisk(specCostLogPathFb, startDataSpec.budget);
        const prdPath = startDataSpec.prdPath;
        await specStage(prdPath, dirs, config, feedback, startDataSpec.greenfield, specTrackerFb, "drafter");
        await safeUpdateManifest(dirs.workingDir);

        writeCheckpoint(dirs.workingDir, {
          awaiting: "approve-spec",
          message: getCheckpointMessage("approve-spec"),
          timestamp: isoTimestamp(),
          feedback: null,
        });
        if (config.liveReport) updateLiveReport(dirs.workingDir, "SPEC", "SPEC re-run with feedback complete, awaiting approval");
        console.log("SPEC stage updated with feedback. Review again.");
        notifyCheckpoint(silent);
        return;
      }

      // No feedback = approved. Proceed to plan.

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

      const specCostLogPath = join(dirs.workingDir, "cost-log.jsonl");
      const specTracker = CostTracker.loadFromDisk(specCostLogPath, startDataSpec.budget);
      appendLogEntry(join(dirs.workingDir, "manager-log.jsonl"), createLogEntry("PLAN_START", {}));
      const planResult = await runPlanStage(dirs, config, undefined, startDataSpec.greenfield, specTracker);
      await safeUpdateManifest(dirs.workingDir);

      const planLogPath = join(dirs.workingDir, "manager-log.jsonl");
      const planFilePath = join(dirs.workingDir, "plans", "execution-plan.json");

      // Emit REGISTRY_GAP_FIXED log entries from plan-stage metadata
      for (const gap of planResult.registryGapsFixed) {
        appendLogEntry(planLogPath, createLogEntry("REGISTRY_GAP_FIXED", {
          registryFile: gap.registryFile,
          storyId: gap.storyId,
        }));
      }

      if (fileExists(planFilePath)) {
        try {
          const planData = loadExecutionPlan(planFilePath);
          appendLogEntry(planLogPath, createLogEntry("PLAN_COMPLETE", {
            storyCount: planData.stories.length,
            storyIds: planData.stories.map((s) => s.id),
          }));
          if (config.liveReport) updateLiveReport(dirs.workingDir, "PLAN", `Plan complete — ${planData.stories.length} stories`);
        } catch {
          console.warn("Warning: execution-plan.json is not valid JSON, skipping PLAN_COMPLETE log.");
        }
      }

      await runScorecard("plan", dirs, config);

      // Honor stopAfterPlan from persisted start data
      if (startDataSpec.stopAfterPlan) {
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

        if (config.liveReport) updateLiveReport(dirs.workingDir, "COMPLETE", "Pipeline stopped after PLAN");
        printTimingSummary(specTracker);
        writeTimingReport(specTracker, dirs.workingDir);
        break;
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
      const startDataPlan = getPipelineStartData(dirs.workingDir);

      // Baseline check FIRST — checkpoint preserved on failure so user can re-approve
      // Greenfield projects skip baseline automatically (no existing code to check)
      if (!options?.skipBaseline && !startDataPlan.greenfield) {
        await runBaselineCheck(config);
      }
      deleteCheckpoint(dirs.workingDir);

      const execCostLogPath = join(dirs.workingDir, "cost-log.jsonl");
      const tracker = CostTracker.loadFromDisk(execCostLogPath, startDataPlan.budget);
      appendLogEntry(join(dirs.workingDir, "manager-log.jsonl"), createLogEntry("EXECUTE_START", {}));
      await runExecuteStage(dirs, config, tracker);

      const summary = tracker.getSummary();
      if (summary.totalCostUsd > 0) {
        console.log(`\nCost summary: $${summary.totalCostUsd.toFixed(4)} total`);
        for (const [storyId, cost] of summary.perStory) {
          console.log(`  ${storyId}: $${cost.toFixed(4)}`);
        }
      }

      printTimingSummary(tracker);
      writeTimingReport(tracker, dirs.workingDir);

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
      await runScorecard("report", dirs, config);
      if (config.liveReport) updateLiveReport(dirs.workingDir, "REPORT", "Report stage complete");

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
      await runScorecard("report", dirs, config);
      if (config.liveReport) updateLiveReport(dirs.workingDir, "REPORT", "Report stage complete");

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
      if (config.liveReport) updateLiveReport(dirs.workingDir, "COMPLETE", "Pipeline complete");
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
  greenfield?: boolean,
  tracker?: CostTracker,
): Promise<void> {
  console.log("Running SPEC stage...");
  await specStage(prdPath, dirs, config, feedback, greenfield, tracker);
}

export async function runPlanStage(
  dirs: PipelineDirs,
  config: HiveMindConfig,
  feedback?: string,
  greenfield?: boolean,
  tracker?: CostTracker,
) {
  console.log("Running PLAN stage...");
  return planStage(dirs, config, feedback, greenfield, tracker);
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

  // BUILD sub-pipeline (US-13) — with retry loop
  if (!completedSubStages.has("BUILD")) {
    const maxBuildAttempts = config.maxBuildAttempts ?? 2;
    let buildPassed = false;

    for (let attempt = 1; attempt <= maxBuildAttempts; attempt++) {
      try {
        console.log(`[${story.id}] BUILD: Starting (attempt ${attempt}/${maxBuildAttempts})...`);
        await runBuild(story, dirs, config, costTracker, roleReportsDir, undefined, moduleCwd);
        buildPassed = true;
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRetryable =
          msg.startsWith("BUILD file existence check failed") ||
          msg.startsWith("BUILD type-check gate failed");

        if (!isRetryable || attempt === maxBuildAttempts) {
          if (!isRetryable) {
            // Non-retryable error — propagate immediately
            throw err;
          }
          // Exhausted retries
          appendLogEntry(logPath, createLogEntry("BUILD_RETRY_EXHAUSTED", {
            storyId: story.id,
            attempt,
            error: msg,
          }));
          return {
            storyId: story.id,
            passed: false,
            attempts: attempt,
            errorMessage: `BUILD failed after ${attempt} attempts: ${msg}`,
          };
        }

        // Retryable error — clean up and retry
        console.warn(`[${story.id}] BUILD attempt ${attempt} failed: ${msg}`);
        appendLogEntry(logPath, createLogEntry("BUILD_RETRY", {
          storyId: story.id,
          attempt,
          error: msg,
        }));

        // Delete the mid-story checkpoint so BUILD re-runs from scratch
        const cpPath = join(dirs.workingDir, getReportPath(story.id, "checkpoint.json"));
        if (existsSync(cpPath)) {
          unlinkSync(cpPath);
        }

        // Restore MODIFIED files via git checkout
        const cwd = moduleCwd ?? dirs.workingDir;
        const modifiedFiles = story.sourceFiles.filter(
          (f): f is SourceFileEntry => typeof f !== "string" && f.changeType === "MODIFIED",
        );
        for (const f of modifiedFiles) {
          try {
            execSync(`git checkout -- "${f.path}"`, { cwd, stdio: "ignore" });
          } catch {
            console.warn(`[${story.id}] BUILD_RETRY: Could not restore ${f.path}`);
          }
        }

        // Move ADDED files to .retry-trash/
        const addedFiles = story.sourceFiles.filter(
          (f): f is SourceFileEntry => typeof f !== "string" && f.changeType === "ADDED",
        );
        if (addedFiles.length > 0) {
          const trashDir = join(cwd, ".retry-trash", `${story.id}-attempt${attempt}`);
          mkdirSync(trashDir, { recursive: true });
          for (const f of addedFiles) {
            const fullPath = join(cwd, f.path);
            if (existsSync(fullPath)) {
              renameSync(fullPath, join(trashDir, basename(f.path)));
            }
          }
        }
      }
    }

    if (!buildPassed) {
      return {
        storyId: story.id,
        passed: false,
        attempts: maxBuildAttempts,
        errorMessage: "BUILD failed after max attempts",
      };
    }
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

  const failedSubTasks: string[] = [];

  for (const subTask of story.subTasks!) {
    if (subTask.status === "passed") continue; // already done (resume case)

    // Retry loop for this sub-task
    let passed = false;
    for (let attempt = 1; attempt <= subTask.maxAttempts; attempt++) {
      totalAttempts++;
      subTask.attempts = attempt;

      try {
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isPipelineError = msg.startsWith("BUILD file existence check failed")
          || msg.startsWith("BUILD type-check gate failed");
        if (!isPipelineError) throw err;
        console.warn(`[${story.id}/${subTask.id}] attempt ${attempt} error: ${msg}`);
      }

      if (attempt >= subTask.maxAttempts) {
        console.warn(`[${story.id}/${subTask.id}] FAILED after ${attempt} attempts`);
        subTask.status = "failed";
      }
    }

    // Fix 3: Continue to next sub-task instead of returning immediately on failure
    if (!passed) {
      failedSubTasks.push(`${subTask.id} (after ${subTask.attempts} attempts)`);
    }
  }

  // If any sub-task failed, skip compliance and return aggregated failure
  if (failedSubTasks.length > 0) {
    return {
      storyId: story.id,
      passed: false,
      attempts: totalAttempts,
      errorMessage: `Sub-tasks failed: ${failedSubTasks.join(", ")}`,
    };
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

/**
 * Pre-flight tool check: scan all step files for CLI tool dependencies
 * and verify they are available on PATH. Returns array of missing tool names.
 */
async function runPreFlightChecks(
  plan: ExecutionPlan,
  dirs: PipelineDirs,
): Promise<string[]> {
  const allTools = new Set<string>();

  for (const story of plan.stories) {
    if (story.status === "passed" || story.status === "failed" || story.status === "skipped") continue;

    const stepPath = join(dirs.workingDir, "plans", story.stepFile);
    const content = readFileSafe(stepPath);
    if (!content) continue;

    for (const tool of scanStepFileForTools(content)) {
      allTools.add(tool);
    }
  }

  if (allTools.size === 0) return [];

  const missing: string[] = [];
  for (const tool of allTools) {
    const status = await detectToolBySpawn(tool);
    if (status === "missing") {
      missing.push(tool);
    }
  }

  return missing;
}

export async function runExecuteStage(
  dirs: PipelineDirs,
  config: HiveMindConfig,
  costTracker?: CostTracker,
): Promise<void> {
  console.log("Running EXECUTE stage...");
  if (config.liveReport) updateLiveReport(dirs.workingDir, "EXECUTE", "Execute stage started");

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

  // Wave counter: reconstruct from existing WAVE_START entries for resume support
  const existingLog = readFileSafe(logPath) ?? "";
  let waveNumber = existingLog.split("\n").filter(line => line.includes('"WAVE_START"')).length + 1;

  // Cost estimation gate: show estimated cost and prompt for approval
  const pendingStories = plan.stories.filter((s) => s.status === "not-started");
  if (pendingStories.length > 0) {
    const maxAttempts = Math.max(...pendingStories.map((s) => s.maxAttempts));
    const estimate = estimatePipelineCost(pendingStories.length, maxAttempts);

    console.log(`\n--- Cost Estimate ---`);
    console.log(`Stories to execute: ${pendingStories.length}`);
    for (const b of estimate.breakdown) {
      console.log(`  ${b.stage}: $${b.total.toFixed(2)} ($${b.perStory.toFixed(2)}/story)`);
    }
    console.log(`  Estimated total: $${estimate.estimatedUsd.toFixed(2)}`);
    console.log(`  (Actual costs may vary based on complexity and retries)\n`);

    // Auto-approve if budget is set and estimate is within budget
    const budgetUsd = costTracker?.["budgetUsd"] as number | undefined;
    if (budgetUsd !== undefined && estimate.estimatedUsd <= budgetUsd) {
      console.log(`Estimate within budget ($${budgetUsd.toFixed(2)}). Auto-approved.`);
    } else if (process.stdin.isTTY) {
      // Prompt for human approval (only in interactive terminals)
      const { createInterface } = await import("node:readline");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question("Proceed with execution? [Y/n] ", (ans) => {
          rl.close();
          resolve(ans.trim().toLowerCase());
        });
      });
      if (answer === "n" || answer === "no") {
        console.log("Execution cancelled by user.");
        return;
      }
    } else {
      // Non-interactive (CI/tests): auto-approve with log
      console.log("Non-interactive mode — auto-approved.");
    }
  }

  // Pre-flight tool check: scan step files for CLI tool dependencies
  const preflightMissing = await runPreFlightChecks(plan, dirs);
  if (preflightMissing.length > 0) {
    const msg = `Missing tools: ${preflightMissing.join(", ")}. Install them and re-run.`;
    console.error(`PRE-FLIGHT FAILED: ${msg}`);
    appendLogEntry(logPath, createLogEntry("PREFLIGHT_PAUSE", { tool: preflightMissing.join(", ") }));
    writeCheckpoint(dirs.workingDir, {
      awaiting: "approve-preflight",
      message: getCheckpointMessage("approve-preflight"),
      timestamp: isoTimestamp(),
      feedback: null,
    });
    notifyCheckpoint(false);
    return;
  }

  // Wave executor: process stories in waves of non-overlapping, dependency-ready stories
  while (true) {
    const ready = getReadyStories(plan);
    const wave = filterNonOverlapping(ready, plan);
    if (wave.length === 0) break;

    const waveStoryIds = wave.map((s) => s.id);
    console.log(`\nWave ${waveNumber}: executing ${waveStoryIds.join(", ")}`);
    appendLogEntry(logPath, createLogEntry("WAVE_START", { storyIds: waveStoryIds, waveNumber }));
    if (config.liveReport) updateLiveReport(dirs.workingDir, "EXECUTE", `Wave ${waveNumber} started: ${waveStoryIds.join(", ")}`);

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
        if (config.liveReport) updateLiveReport(dirs.workingDir, "EXECUTE", `${story.id} FAILED (error)`);
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
        if (config.liveReport) updateLiveReport(dirs.workingDir, "EXECUTE", `${story.id} PASSED`);
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
        if (config.liveReport) updateLiveReport(dirs.workingDir, "EXECUTE", `${story.id} FAILED (verification)`);

        // Issue 3: Preserve source files from failed stories to recoverable location
        const artifactsDir = join(dirs.workingDir, "artifacts", story.id);
        const preserveCwd = getModuleCwd(plan, story.moduleId) ?? process.cwd();
        const sourcePaths = getSourceFilePaths(story.sourceFiles);
        const safePaths = sourcePaths.filter((p) => {
          if (p.startsWith("/") || p.startsWith("\\")) return false;
          const resolved = resolve(artifactsDir, p);
          return resolved.startsWith(resolve(artifactsDir));
        });
        let preserved = 0;
        try {
          for (const relPath of safePaths) {
            const srcPath = join(preserveCwd, relPath);
            if (fileExists(srcPath)) {
              const destPath = join(artifactsDir, relPath);
              ensureDir(dirname(destPath));
              copyFileSync(srcPath, destPath);
              preserved++;
            }
          }
          if (preserved > 0) {
            console.log(`[${story.id}] Preserved ${preserved} file(s) to ${artifactsDir}`);
          }
        } catch (preserveErr) {
          console.warn(`[${story.id}] Artifact preservation failed (non-blocking): ${preserveErr instanceof Error ? preserveErr.message : String(preserveErr)}`);
        }

        // Issue 1: Salvage refactoring artifacts from failed stories
        try {
          const refactorPath = join(dirs.workingDir, getReportPath(story.id, "refactor-report.md"));
          const refactorContent = readFileSafe(refactorPath);
          if (refactorContent) {
            const { filesModified } = parseRefactorReport(refactorContent);

            // Overlap guard: exclude files touched by other wave stories
            const otherStoryFiles = new Set<string>();
            for (const otherStory of wave) {
              if (otherStory.id !== story.id) {
                const implPath = join(dirs.workingDir, getReportPath(otherStory.id, "impl-report.md"));
                const implContent = readFileSafe(implPath);
                if (implContent) {
                  const parsed = parseImplReport(implContent);
                  for (const f of parsed.filesCreated) otherStoryFiles.add(f);
                }
                for (const f of getSourceFilePaths(otherStory.sourceFiles)) {
                  otherStoryFiles.add(f);
                }
                if (otherStory.subTasks) {
                  for (const st of otherStory.subTasks) {
                    for (const f of getSourceFilePaths(st.sourceFiles)) {
                      otherStoryFiles.add(f);
                    }
                  }
                }
              }
            }

            const salvageCwd = getModuleCwd(plan, story.moduleId) ?? process.cwd();
            const safeFiles = filesModified
              .filter((f) => !otherStoryFiles.has(f))
              .filter((f) => fileExists(join(salvageCwd, f)));

            if (safeFiles.length > 0) {
              // Use --pathspec-from-file to avoid shell injection (requires git 2.26+)
              const pathspecFile = join(dirs.workingDir, `reports/${story.id}/.salvage-paths`);
              writeFileSync(pathspecFile, safeFiles.join("\n"), "utf-8");
              await runShell(`git add --pathspec-from-file="${pathspecFile}"`, { cwd: salvageCwd });
              const status = await runShell("git diff --cached --quiet || echo HAS_CHANGES", { cwd: salvageCwd });
              if (status.stdout.includes("HAS_CHANGES")) {
                await runShell(`git commit -m "chore(${story.id}): salvage refactoring artifacts"`, { cwd: salvageCwd });
                console.log(`[${story.id}] Salvaged ${safeFiles.length} refactored file(s)`);
              }
            }
          }
        } catch (salvageErr) {
          console.warn(`[${story.id}] Refactor salvage failed (non-blocking): ${salvageErr instanceof Error ? salvageErr.message : String(salvageErr)}`);
        }
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

    await runScorecard("execute-wave", dirs, config, `Wave completed.`);
    appendLogEntry(logPath, createLogEntry("WAVE_COMPLETE", { waveNumber }));
    if (config.liveReport) updateLiveReport(dirs.workingDir, "EXECUTE", `Wave ${waveNumber} complete`);
    waveNumber++;

    // Budget warning after wave (informational only — no mid-pipeline kills)
    if (costTracker?.checkBudget()) {
      console.warn(`\n[BUDGET] Spending has exceeded budget: $${costTracker.getPipelineTotal().toFixed(2)} spent. Pipeline will continue to completion.`);
    }
  }

  // Diagnostic: log total spawnClaude invocation count (Issue 8)
  const { getSpawnClaudeInvocationCount } = await import("./utils/shell.js");
  console.log(`[DIAGNOSTIC] Total spawnClaude invocations this run: ${getSpawnClaudeInvocationCount()}`);

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
