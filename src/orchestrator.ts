import type { Checkpoint } from "./types/checkpoint.js";
import type { ExecutionPlan } from "./types/execution-plan.js";
import type { HiveMindConfig } from "./config/schema.js";
import { fileExists, ensureDir, readFileSafe } from "./utils/file-io.js";
import { createMemoryFromTemplate } from "./memory/memory-manager.js";
import {
  writeCheckpoint,
  deleteCheckpoint,
  getCheckpointMessage,
} from "./state/checkpoint.js";
import {
  loadExecutionPlan,
  saveExecutionPlan,
  updateStoryStatus,
  getNextStory,
  markCommitted,
} from "./state/execution-plan.js";
import { appendLogEntry, createLogEntry } from "./state/manager-log.js";
import { isoTimestamp } from "./utils/timestamp.js";
import { join } from "node:path";
import { HiveMindError } from "./utils/errors.js";
import { runSpecStage as specStage } from "./stages/spec-stage.js";
import { runPlanStage as planStage } from "./stages/plan-stage.js";
import { runBuild } from "./stages/execute-build.js";
import { runVerify } from "./stages/execute-verify.js";
import { runCommit } from "./stages/execute-commit.js";
import { runLearn } from "./stages/execute-learn.js";
import { parseRequiredTooling, detectAllTools } from "./tooling/detect.js";
import { runToolingSetup } from "./tooling/setup.js";
import { runReportStage as reportStage } from "./stages/report-stage.js";

export async function runPipeline(
  prdPath: string,
  hiveMindDir: string,
  config: HiveMindConfig,
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
}

export async function resumeFromCheckpoint(
  checkpoint: Checkpoint,
  hiveMindDir: string,
  config: HiveMindConfig,
): Promise<void> {
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
      break;
    }
    case "approve-plan": {
      deleteCheckpoint(hiveMindDir);

      await runExecuteStage(hiveMindDir, config);
      await runReportStage(hiveMindDir, config);

      writeCheckpoint(hiveMindDir, {
        awaiting: "verify",
        message: getCheckpointMessage("verify"),
        timestamp: isoTimestamp(),
        feedback: null,
      });

      console.log("EXECUTE + REPORT stages complete. Awaiting verification.");
      console.log(getCheckpointMessage("verify"));
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

export async function runExecuteStage(
  hiveMindDir: string,
  config: HiveMindConfig,
): Promise<void> {
  console.log("Running EXECUTE stage...");

  const planPath = join(hiveMindDir, "plans", "execution-plan.json");
  if (!fileExists(planPath)) {
    console.log("No execution plan found. Skipping EXECUTE stage.");
    return;
  }

  const logPath = join(hiveMindDir, "manager-log.jsonl");
  let plan: ExecutionPlan = loadExecutionPlan(planPath);

  let story = getNextStory(plan);
  while (story) {
    console.log(`Executing story: ${story.id} - ${story.title}`);

    plan = updateStoryStatus(plan, story.id, "in-progress");
    saveExecutionPlan(planPath, plan);

    try {
      // BUILD sub-pipeline (US-13)
      await runBuild(story, hiveMindDir, config);

      appendLogEntry(logPath, createLogEntry("BUILD_COMPLETE", {
        storyId: story.id,
      }));

      // VERIFY sub-pipeline (US-14)
      const verifyResult = await runVerify(story, hiveMindDir, planPath, config);

      // Reload plan from disk -- runVerify writes attempt increments via saveExecutionPlan.
      // Without this reload, the stale in-memory plan overwrites the incremented attempts to 0.
      plan = loadExecutionPlan(planPath);

      if (verifyResult.passed) {
        // COMMIT sub-pipeline (US-15)
        const commitResult = await runCommit(story, hiveMindDir, verifyResult, config);
        plan = updateStoryStatus(plan, story.id, "passed");

        if (commitResult.committed && commitResult.commitHash) {
          plan = markCommitted(plan, story.id, commitResult.commitHash);

          appendLogEntry(logPath, createLogEntry("COMMIT_COMPLETE", {
            storyId: story.id,
            commitHash: commitResult.commitHash,
          }));
        } else {
          console.warn(`Warning: Commit failed for ${story.id}: ${commitResult.error ?? "unknown error"}`);
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
          attempt: verifyResult.attempts,
        }));
      } else {
        const failedId = story.id;
        plan = updateStoryStatus(plan, failedId, "failed");
        // Persist error details for post-mortem (C-ATOMIC-1, F30)
        plan = {
          ...plan,
          stories: plan.stories.map((s) =>
            s.id === failedId ? { ...s, errorMessage: "Verification failed after max attempts", lastFailedStage: "verify" } : s,
          ),
        };

        appendLogEntry(logPath, createLogEntry("FAILED", {
          cycle: 1,
          storyId: story.id,
          reason: "Verification failed after max attempts",
        }));
      }

      saveExecutionPlan(planPath, plan);

      // LEARN sub-pipeline (US-16) -- always, even if failed
      await runLearn(story, hiveMindDir, config);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const failedId = story!.id;
      console.error(`Error executing story ${failedId}:`, errorMessage);
      plan = updateStoryStatus(plan, failedId, "failed");
      // Persist error details atomically for post-mortem analysis (C-ATOMIC-1, F30)
      plan = {
        ...plan,
        stories: plan.stories.map((s) =>
          s.id === failedId ? { ...s, errorMessage, lastFailedStage: "execute" } : s,
        ),
      };
      saveExecutionPlan(planPath, plan);

      appendLogEntry(logPath, createLogEntry("FAILED", {
        cycle: 1,
        storyId: story.id,
        reason: errorMessage,
      }));
    }

    story = getNextStory(plan);
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
