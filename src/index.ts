#!/usr/bin/env node

import { readFileSafe, fileExists } from "./utils/file-io.js";
import { runShell } from "./utils/shell.js";
import type { Checkpoint } from "./types/checkpoint.js";
import { runPipeline, resumeFromCheckpoint } from "./orchestrator.js";

export type ParsedCommand =
  | { command: "start"; prdPath: string }
  | { command: "approve" }
  | { command: "reject"; feedback: string }
  | { command: "status" }
  | { command: "abort" };

const REJECTED_FLAGS = ["--spec", "--goal", "--qcs"];

export function parseArgs(argv: string[]): ParsedCommand {
  const args = argv.slice(2);
  const cmd = args[0];

  for (const flag of REJECTED_FLAGS) {
    if (args.includes(flag)) {
      console.error(`Error: unknown option '${flag}'. Hive Mind v3 takes only --prd.`);
      process.exit(1);
    }
  }

  switch (cmd) {
    case "start": {
      const prdIdx = args.indexOf("--prd");
      if (prdIdx === -1 || !args[prdIdx + 1]) {
        console.error("Error: start requires --prd <path>");
        process.exit(1);
      }
      return { command: "start", prdPath: args[prdIdx + 1] };
    }
    case "approve":
      return { command: "approve" };
    case "reject": {
      const fbIdx = args.indexOf("--feedback");
      if (fbIdx === -1 || !args[fbIdx + 1]) {
        console.error("Error: reject requires --feedback <text>");
        process.exit(1);
      }
      return { command: "reject", feedback: args[fbIdx + 1] };
    }
    case "status":
      return { command: "status" };
    case "abort":
      return { command: "abort" };
    default:
      console.error(`Error: unknown command '${cmd}'. Available: start, approve, reject, status, abort`);
      process.exit(1);
  }
}

export async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  switch (parsed.command) {
    case "start": {
      if (!fileExists(parsed.prdPath)) {
        console.error(`Error: PRD file not found: ${parsed.prdPath}`);
        process.exit(1);
      }
      const claudeCheck = await runShell("command -v claude || where claude 2>/dev/null");
      if (claudeCheck.exitCode !== 0) {
        console.error("Error: claude CLI not found on PATH");
        process.exit(1);
      }
      await runPipeline(parsed.prdPath, ".hive-mind");
      break;
    }
    case "approve": {
      const checkpoint = readCheckpointFile();
      if (!checkpoint) {
        console.error("Error: no active checkpoint");
        process.exit(1);
      }
      await resumeFromCheckpoint(checkpoint, ".hive-mind");
      break;
    }
    case "reject": {
      const checkpoint = readCheckpointFile();
      if (!checkpoint) {
        console.error("Error: no active checkpoint");
        process.exit(1);
      }
      checkpoint.feedback = parsed.feedback;
      await resumeFromCheckpoint(checkpoint, ".hive-mind");
      break;
    }
    case "status": {
      const checkpoint = readCheckpointFile();
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
      const cpPath = ".hive-mind/.checkpoint";
      if (fileExists(cpPath)) {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(cpPath);
      }
      console.log("Pipeline aborted.");
      break;
    }
  }
}

function readCheckpointFile(): Checkpoint | null {
  const content = readFileSafe(".hive-mind/.checkpoint");
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
    console.error(err);
    process.exit(1);
  });
}
