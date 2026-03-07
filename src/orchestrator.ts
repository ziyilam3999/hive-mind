import type { Checkpoint } from "./types/checkpoint.js";
import type { ExecutionPlan } from "./types/execution-plan.js";
import { fileExists, ensureDir } from "./utils/file-io.js";
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
} from "./state/execution-plan.js";
import { appendLogEntry, createLogEntry } from "./state/manager-log.js";
import { isoTimestamp } from "./utils/timestamp.js";
import { join } from "node:path";

export async function runPipeline(
  prdPath: string,
  hiveMindDir: string,
): Promise<void> {
  if (!fileExists(prdPath)) {
    console.error(`Error: PRD file not found: ${prdPath}`);
    process.exit(1);
  }

  ensureDir(hiveMindDir);
  ensureDir(join(hiveMindDir, "spec"));
  ensureDir(join(hiveMindDir, "plans"));
  ensureDir(join(hiveMindDir, "reports"));

  const memoryPath = join(hiveMindDir, "memory.md");
  if (!fileExists(memoryPath)) {
    createMemoryFromTemplate(memoryPath);
  }

  await runSpecStage(prdPath, hiveMindDir);

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
): Promise<void> {
  const feedback = checkpoint.feedback ?? undefined;

  switch (checkpoint.awaiting) {
    case "approve-spec": {
      deleteCheckpoint(hiveMindDir);

      // Tooling detect/setup would run here (US-11)
      await runPlanStage(hiveMindDir, feedback);

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

      await runExecuteStage(hiveMindDir);
      await runReportStage(hiveMindDir);

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
  _prdPath: string,
  _hiveMindDir: string,
  _feedback?: string,
): Promise<void> {
  // Delegated to src/stages/spec-stage.ts (US-10)
  // Placeholder: the 7-step dual-critique pipeline
  console.log("Running SPEC stage...");
}

export async function runPlanStage(
  _hiveMindDir: string,
  _feedback?: string,
): Promise<void> {
  // Delegated to src/stages/plan-stage.ts (US-12)
  // Placeholder: role auto-scaling + synthesizer
  console.log("Running PLAN stage...");
}

export async function runExecuteStage(
  hiveMindDir: string,
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
      // await runBuild(story, hiveMindDir);

      // VERIFY sub-pipeline (US-14)
      // const verifyResult = await runVerify(story, hiveMindDir, plan);
      const verifyPassed = true; // placeholder

      if (verifyPassed) {
        // COMMIT sub-pipeline (US-15)
        // await runCommit(story, hiveMindDir, plan);
        plan = updateStoryStatus(plan, story.id, "passed");

        appendLogEntry(logPath, createLogEntry("COMPLETED", {
          cycle: 1,
          storyId: story.id,
          testResults: { total: 0, passed: 0, failed: 0 },
          evalVerdict: "PASS",
          attempt: 1,
        }));
      } else {
        plan = updateStoryStatus(plan, story.id, "failed");

        appendLogEntry(logPath, createLogEntry("FAILED", {
          cycle: 1,
          storyId: story.id,
          reason: "Verification failed after max attempts",
        }));
      }

      saveExecutionPlan(planPath, plan);

      // LEARN sub-pipeline (US-16) -- always, even if failed
      // await runLearn(story, hiveMindDir);
    } catch (err) {
      console.error(`Error executing story ${story.id}:`, err);
      plan = updateStoryStatus(plan, story.id, "failed");
      saveExecutionPlan(planPath, plan);

      appendLogEntry(logPath, createLogEntry("FAILED", {
        cycle: 1,
        storyId: story.id,
        reason: String(err),
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
  _hiveMindDir: string,
): Promise<void> {
  // Delegated to src/stages/report-stage.ts (US-17)
  console.log("Running REPORT stage...");
}
