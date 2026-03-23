import { renameSync, unlinkSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { persistFeedback } from "./checkpoint.js";

const CHECKPOINT_FILE = ".checkpoint";
const PROCESSING_FILE = ".checkpoint.processing";
const ORPHAN_THRESHOLD_MS = 30_000;

interface CheckpointResult {
  success: boolean;
  error?: string;
}

/**
 * Attempt to recover an orphaned .checkpoint.processing file.
 * Returns a result if recovery was performed (caller should return it),
 * or null if no recovery was needed.
 *
 * TOCTOU note (LOW-SEC-07): There is a narrow race between the mtime check
 * and unlinkSync in crash recovery. This requires a concurrent recovery attempt
 * on a 30+ second old orphaned file after a prior crash — an extremely rare scenario.
 * The spec accepts this risk.
 */
function tryRecoverOrphaned(checkpointDir: string): CheckpointResult | null {
  const processingPath = join(checkpointDir, PROCESSING_FILE);
  const checkpointPath = join(checkpointDir, CHECKPOINT_FILE);

  if (!existsSync(processingPath)) {
    return null;
  }

  // Both files exist simultaneously — crash between writing .checkpoint
  // and completing the first rename. On Windows, renameSync with both
  // present throws EEXIST instead of replacing the target.
  if (existsSync(checkpointPath)) {
    const stat = statSync(processingPath);
    const age = Date.now() - stat.mtimeMs;
    if (age >= ORPHAN_THRESHOLD_MS) {
      // Old orphan — clean it up and let caller proceed with normal rename
      safeUnlink(processingPath);
      return null;
    }
    // Recent .processing file — another operation is in progress
    return { success: false, error: "Checkpoint already processed" };
  }

  // Only .processing exists (no .checkpoint) — orphaned from a crash
  const stat = statSync(processingPath);
  const age = Date.now() - stat.mtimeMs;
  if (age >= ORPHAN_THRESHOLD_MS) {
    safeUnlink(processingPath);
    return { success: false, error: "Recovered orphaned checkpoint \u2014 please retry" };
  }

  // .processing exists but is recent — another operation is in progress
  return { success: false, error: "Checkpoint already processed" };
}

/**
 * Atomically claim a checkpoint by renaming it to .processing.
 * Returns a failure result on ENOENT (already consumed), null on success.
 */
function claimCheckpointFile(checkpointPath: string, processingPath: string): CheckpointResult | null {
  try {
    renameSync(checkpointPath, processingPath);
    return null;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return { success: false, error: "Checkpoint already processed" };
    }
    throw err;
  }
}

function safeUnlink(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Cosmetic leak — operation succeeded regardless
  }
}

export async function approveCheckpoint(checkpointDir: string): Promise<CheckpointResult> {
  const recovery = tryRecoverOrphaned(checkpointDir);
  if (recovery) return recovery;

  const checkpointPath = join(checkpointDir, CHECKPOINT_FILE);
  const processingPath = join(checkpointDir, PROCESSING_FILE);

  const claimResult = claimCheckpointFile(checkpointPath, processingPath);
  if (claimResult) return claimResult;

  safeUnlink(processingPath);
  return { success: true };
}

export async function rejectCheckpoint(checkpointDir: string, feedback: string): Promise<CheckpointResult> {
  const recovery = tryRecoverOrphaned(checkpointDir);
  if (recovery) return recovery;

  const checkpointPath = join(checkpointDir, CHECKPOINT_FILE);
  const processingPath = join(checkpointDir, PROCESSING_FILE);

  // claimCheckpointFile returns non-null on failure — persistFeedback is
  // intentionally NOT called in that path (AC-11)
  const claimResult = claimCheckpointFile(checkpointPath, processingPath);
  if (claimResult) return claimResult;

  await persistFeedback(checkpointDir, feedback);
  safeUnlink(processingPath);
  return { success: true };
}
