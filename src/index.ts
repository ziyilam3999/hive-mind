#!/usr/bin/env node

import { readFileSafe, fileExists } from "./utils/file-io.js";
import { runShell } from "./utils/shell.js";
import type { Checkpoint } from "./types/checkpoint.js";
import type { PipelineDirs } from "./types/pipeline-dirs.js";
import { runPipeline, resumeFromCheckpoint, runBugFixPipeline } from "./orchestrator.js";
import { loadConfig, resolvePipelineDirs } from "./config/loader.js";
import { HiveMindError } from "./utils/errors.js";
import { join } from "node:path";

export type ParsedCommand =
  | { command: "start"; prdPath: string; silent?: boolean; budget?: number; skipBaseline?: boolean; stopAfterPlan?: boolean }
  | { command: "bug"; reportPath: string; silent?: boolean; skipBaseline?: boolean }
  | { command: "approve"; silent?: boolean; skipBaseline?: boolean }
  | { command: "reject"; feedback: string; silent?: boolean }
  | { command: "status" }
  | { command: "abort" }
  | { command: "manifest" }
  | { command: "resume"; from?: string; skipFailed?: boolean; silent?: boolean }
  | { command: "help" }
  | { command: "version" };

const REJECTED_FLAGS = ["--spec", "--goal", "--qcs"];

export function parseArgs(argv: string[]): ParsedCommand {
  const args = argv.slice(2);
  const cmd = args[0];

  for (const flag of REJECTED_FLAGS) {
    if (args.includes(flag)) {
      throw new HiveMindError(`Unknown option '${flag}'. Hive Mind v3 takes only --prd.`);
    }
  }

  const silent = args.includes("--silent");

  // Handle help/version before the switch — flags can appear anywhere
  if (!cmd || cmd === "help" || args.includes("--help") || args.includes("-h")) {
    return { command: "help" };
  }
  if (cmd === "version" || args.includes("--version") || args.includes("-v")) {
    return { command: "version" };
  }

  switch (cmd) {
    case "start": {
      const prdIdx = args.indexOf("--prd");
      if (prdIdx === -1 || !args[prdIdx + 1]) {
        throw new HiveMindError("start requires --prd <path>");
      }
      const budgetIdx = args.indexOf("--budget");
      const budget = budgetIdx !== -1 ? Number(args[budgetIdx + 1]) : undefined;
      if (budget !== undefined && (isNaN(budget) || budget <= 0)) {
        throw new HiveMindError("--budget requires a positive number (dollars)");
      }
      const skipBaseline = args.includes("--skip-baseline");
      const stopAfterPlan = args.includes("--stop-after-plan");
      return { command: "start", prdPath: args[prdIdx + 1], silent, budget, skipBaseline, stopAfterPlan };
    }
    case "bug": {
      const reportIdx = args.indexOf("--report");
      if (reportIdx === -1 || !args[reportIdx + 1]) {
        throw new HiveMindError("bug requires --report <path>");
      }
      const skipBaselineBug = args.includes("--skip-baseline");
      return { command: "bug", reportPath: args[reportIdx + 1], silent, skipBaseline: skipBaselineBug };
    }
    case "approve": {
      const skipBaselineApprove = args.includes("--skip-baseline");
      return { command: "approve", silent, skipBaseline: skipBaselineApprove };
    }
    case "reject": {
      const fbIdx = args.indexOf("--feedback");
      if (fbIdx === -1 || !args[fbIdx + 1]) {
        throw new HiveMindError("reject requires --feedback <text>");
      }
      return { command: "reject", feedback: args[fbIdx + 1], silent };
    }
    case "status":
      return { command: "status" };
    case "abort":
      return { command: "abort" };
    case "manifest":
      return { command: "manifest" };
    case "resume": {
      const fromIdx = args.indexOf("--from");
      const from = fromIdx !== -1 ? args[fromIdx + 1] : undefined;
      const skipFailed = args.includes("--skip-failed");
      return { command: "resume", from, skipFailed, silent };
    }
    default:
      throw new HiveMindError(`Unknown command '${cmd}'. Run 'hive-mind help' for available commands.`);
  }
}

export async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  const config = loadConfig(process.cwd());
  const dirs = resolvePipelineDirs(config, process.cwd());

  switch (parsed.command) {
    case "help": {
      printHelp();
      break;
    }
    case "version": {
      const { readFileSync } = await import("node:fs");
      const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
      console.log(pkg.version);
      break;
    }
    case "start": {
      if (!fileExists(parsed.prdPath)) {
        throw new HiveMindError(`PRD file not found: ${parsed.prdPath}`);
      }
      const claudeCmd = process.platform === "win32" ? "where claude" : "command -v claude";
      const claudeCheck = await runShell(claudeCmd);
      if (claudeCheck.exitCode !== 0) {
        throw new HiveMindError("claude CLI not found on PATH");
      }
      await runPipeline(parsed.prdPath, dirs, config, { silent: parsed.silent, budget: parsed.budget, skipBaseline: parsed.skipBaseline, stopAfterPlan: parsed.stopAfterPlan });
      break;
    }
    case "bug": {
      if (!fileExists(parsed.reportPath)) {
        throw new HiveMindError(`Bug report not found: ${parsed.reportPath}`);
      }
      const claudeCmdBug = process.platform === "win32" ? "where claude" : "command -v claude";
      const claudeCheckBug = await runShell(claudeCmdBug);
      if (claudeCheckBug.exitCode !== 0) {
        throw new HiveMindError("claude CLI not found on PATH");
      }
      const exitCode = await runBugFixPipeline(parsed.reportPath, dirs, config, {
        silent: parsed.silent,
        skipBaseline: parsed.skipBaseline,
      });
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
      break;
    }
    case "approve": {
      const checkpoint = readCheckpointFile(dirs);
      if (!checkpoint) {
        throw new HiveMindError("No active checkpoint");
      }
      await resumeFromCheckpoint(checkpoint, dirs, config, { silent: parsed.silent, skipBaseline: parsed.skipBaseline });
      break;
    }
    case "reject": {
      const checkpoint = readCheckpointFile(dirs);
      if (!checkpoint) {
        throw new HiveMindError("No active checkpoint");
      }
      checkpoint.feedback = parsed.feedback;
      await resumeFromCheckpoint(checkpoint, dirs, config, { silent: parsed.silent });
      break;
    }
    case "status": {
      const checkpoint = readCheckpointFile(dirs);
      if (!checkpoint) {
        console.log("Status: no active pipeline");
      } else {
        console.log(`Status: awaiting ${checkpoint.awaiting}`);
        console.log(`Message: ${checkpoint.message}`);
        console.log(`Since: ${checkpoint.timestamp}`);
      }
      break;
    }
    case "abort": {
      const cpPath = join(dirs.workingDir, ".checkpoint");
      if (fileExists(cpPath)) {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(cpPath);
      }
      console.log("Pipeline aborted.");
      break;
    }
    case "manifest": {
      const { updateManifest } = await import("./manifest/generator.js");
      await updateManifest(dirs.workingDir);
      console.log(`Manifest updated: ${dirs.workingDir}/MANIFEST.md`);
      break;
    }
    case "resume": {
      const planPath = join(dirs.workingDir, "plans/execution-plan.json");
      if (!fileExists(planPath)) {
        throw new HiveMindError("No execution plan found. Run 'start' and 'approve' first.");
      }
      const { loadExecutionPlan, updateStoryStatus, saveExecutionPlan } = await import("./state/execution-plan.js");
      let plan = loadExecutionPlan(planPath);

      // --from <storyId>: mark all stories before the specified one as "skipped"
      if (parsed.from) {
        const storyIdx = plan.stories.findIndex((s) => s.id === parsed.from);
        if (storyIdx === -1) {
          throw new HiveMindError(`Story not found: ${parsed.from}`);
        }
        for (let i = 0; i < storyIdx; i++) {
          const s = plan.stories[i];
          if (s.status === "not-started") {
            plan = updateStoryStatus(plan, s.id, "skipped");
          }
        }
        saveExecutionPlan(planPath, plan);
      }

      // --skip-failed: mark all failed stories as "skipped"
      if (parsed.skipFailed) {
        for (const s of plan.stories) {
          if (s.status === "failed") {
            plan = updateStoryStatus(plan, s.id, "skipped");
          }
        }
        saveExecutionPlan(planPath, plan);
      }

      const { runExecuteStage, runReportStage } = await import("./orchestrator.js");
      await runExecuteStage(dirs, config);
      await runReportStage(dirs, config);
      break;
    }
  }
}

export function printHelp(): void {
  console.log(`Usage: hive-mind <command> [options]

Commands:
  start --prd <path>     Run full pipeline (SPEC → PLAN → EXECUTE → REPORT)
  bug --report <path>    Run bug-fix pipeline (DIAGNOSE → FIX → VERIFY)
  approve                Approve current checkpoint and continue
  reject --feedback <t>  Reject with feedback and re-run current stage
  resume                 Resume execution from saved plan
  status                 Show current pipeline status
  abort                  Cancel active pipeline
  manifest               Update MANIFEST.md in working directory
  help                   Show this help message
  version                Show version number

Options:
  --silent               Suppress desktop notifications
  --skip-baseline        Skip pre-execution test baseline capture
  --budget <dollars>     Set cost budget limit (start only)
  --stop-after-plan      Run SPEC + PLAN only, then exit (start only)
  --from <storyId>       Resume from specific story (resume only)
  --skip-failed          Skip failed stories on resume (resume only)

Directories (configurable via .hivemindrc.json):
  .hive-mind-working/    Pipeline output (specs, plans, reports)
  ../.hive-mind-persist/ Shared knowledge (memory, knowledge-base)
  .hive-mind-lab/        Test and experiment output

Rough cost estimate: ~$0.02 per PRD word (SPEC+PLAN+EXECUTE).
A 500-word PRD ≈ $10. A 2000-word PRD ≈ $40.
Use --stop-after-plan for an exact plan preview (runs real LLM calls).`);
}

function readCheckpointFile(dirs: PipelineDirs): Checkpoint | null {
  const content = readFileSafe(join(dirs.workingDir, ".checkpoint"));
  if (!content) return null;
  try {
    return JSON.parse(content) as Checkpoint;
  } catch {
    return null;
  }
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isDirectRun) {
  main().catch((err) => {
    if (err instanceof HiveMindError) {
      console.error(`Error: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}
