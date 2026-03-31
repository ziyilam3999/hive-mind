import type { Checkpoint, CheckpointType } from "../types/checkpoint.js";
import { readFileSafe, writeFileAtomic, fileExists } from "../utils/file-io.js";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

const CHECKPOINT_FILE = ".checkpoint";

function checkpointPath(checkpointDir: string): string {
  return join(checkpointDir, CHECKPOINT_FILE);
}

export function writeCheckpoint(
  checkpointDir: string,
  checkpoint: Checkpoint,
): void {
  writeFileAtomic(checkpointPath(checkpointDir), JSON.stringify(checkpoint, null, 2) + "\n");
}

export function readCheckpoint(
  checkpointDir: string,
): Checkpoint | null {
  const content = readFileSafe(checkpointPath(checkpointDir));
  if (!content) return null;
  try {
    return JSON.parse(content) as Checkpoint;
  } catch {
    return null;
  }
}

export function deleteCheckpoint(checkpointDir: string): void {
  const path = checkpointPath(checkpointDir);
  if (fileExists(path)) {
    unlinkSync(path);
  }
}

export function persistFeedback(
  checkpointDir: string,
  feedback: string,
): void {
  const checkpoint = readCheckpoint(checkpointDir);
  if (!checkpoint) {
    throw new Error("No checkpoint to persist feedback to");
  }
  checkpoint.feedback = feedback;
  writeCheckpoint(checkpointDir, checkpoint);
}

export function getCheckpointMessage(type: CheckpointType): string {
  switch (type) {
    case "approve-normalize":
      return "Normalized PRD ready. Review .hive-mind/normalize/normalized-prd.md and run 'hive-mind approve' to proceed to SPEC, or 'hive-mind reject --feedback \"...\"' to re-normalize.";
    case "approve-spec":
      return "Review SPEC-v1.0.md and ELI5 summary. Run: hive-mind approve OR hive-mind reject --feedback '...'";
    case "approve-plan":
      return "Review execution plan, step files, and acceptance criteria. Run: hive-mind approve OR hive-mind reject --feedback '...'";
    case "approve-integration":
      return "Review integration verification results. Run: hive-mind approve OR hive-mind reject --feedback '...'";
    case "approve-diagnosis":
      return "Review diagnosis report. Run: hive-mind approve (continue with fix) OR hive-mind reject --feedback '...'";
    case "approve-preflight":
      return "Missing tools detected. Install the listed tools, then run: hive-mind approve";
    case "approve-usage-limit":
      return "Claude API usage limit hit. Wait for your limit to reset, then run: hive-mind approve";
    case "verify":
      return "Review consolidated report and retrospective. Run: hive-mind approve OR hive-mind reject --feedback '...'";
    case "ship":
      return "Final confirmation. Run: hive-mind approve to complete the pipeline.";
    case "approve-design-skip":
      return "No UI components detected in this PRD. Run: hive-mind approve to skip design and proceed to SPEC, or hive-mind reject --feedback '...' to run the design stage anyway.";
    case "approve-design-choice":
      return "Does this PRD need UI design? Run: hive-mind approve to skip design and proceed to SPEC, or hive-mind reject --feedback 'needs UI' to run the design stage.";
    case "approve-design-questionnaire":
      return "Review and edit the design questionnaire at design/design-questionnaire.yaml, then run: hive-mind approve to generate prototype, or hive-mind reject --feedback '...' to regenerate.";
    case "approve-design-prototype":
      return "Review the generated design prototype. Run: hive-mind approve to extract tokens and proceed, or hive-mind reject --feedback '...' to iterate.";
  }
}
