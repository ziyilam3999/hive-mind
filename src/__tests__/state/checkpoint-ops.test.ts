import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, unlinkSync, utimesSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock persistFeedback — it reads .checkpoint which won't exist after rename
vi.mock("../../state/checkpoint.js", () => ({
  persistFeedback: vi.fn(),
}));

import { approveCheckpoint, rejectCheckpoint } from "../../state/checkpoint-ops.js";
import { persistFeedback } from "../../state/checkpoint.js";

const mockedPersistFeedback = vi.mocked(persistFeedback);

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "checkpoint-ops-test-"));
}

function writeCheckpointFile(dir: string): void {
  writeFileSync(
    join(dir, ".checkpoint"),
    JSON.stringify({ awaiting: "approve-spec", message: "test", timestamp: new Date().toISOString(), feedback: null }),
  );
}

function writeProcessingFile(dir: string, ageMs: number = 0): void {
  const path = join(dir, ".checkpoint.processing");
  writeFileSync(path, JSON.stringify({ awaiting: "approve-spec", message: "test", timestamp: new Date().toISOString(), feedback: null }));
  if (ageMs > 0) {
    const past = new Date(Date.now() - ageMs);
    utimesSync(path, past, past);
  }
}

describe("approveCheckpoint", () => {
  let dir: string;

  beforeEach(() => {
    dir = createTempDir();
    vi.clearAllMocks();
  });

  it("happy path: renames .checkpoint, removes .processing, returns success true", async () => {
    writeCheckpointFile(dir);
    const result = await approveCheckpoint(dir);
    expect(result).toEqual({ success: true });
    expect(existsSync(join(dir, ".checkpoint"))).toBe(false);
    expect(existsSync(join(dir, ".checkpoint.processing"))).toBe(false);
  });

  it("returns success false with 'Checkpoint already processed' when .checkpoint does not exist (ENOENT)", async () => {
    // No checkpoint file — covers both "already consumed" and "never existed"
    const result = await approveCheckpoint(dir);
    expect(result).toEqual({ success: false, error: "Checkpoint already processed" });
  });

  it("no orphaned .processing file after happy path", async () => {
    writeCheckpointFile(dir);
    await approveCheckpoint(dir);
    expect(existsSync(join(dir, ".checkpoint.processing"))).toBe(false);
  });

  it("recovers orphaned .processing older than 30 seconds", async () => {
    writeProcessingFile(dir, 31_000);
    const result = await approveCheckpoint(dir);
    expect(result).toEqual({ success: false, error: "Recovered orphaned checkpoint \u2014 please retry" });
    expect(existsSync(join(dir, ".checkpoint.processing"))).toBe(false);
  });

  it("returns 'Checkpoint already processed' when .processing is recent and no .checkpoint", async () => {
    writeProcessingFile(dir, 0);
    const result = await approveCheckpoint(dir);
    expect(result).toEqual({ success: false, error: "Checkpoint already processed" });
  });

  it("handles both files existing with recent .processing (Windows EEXIST case)", async () => {
    writeCheckpointFile(dir);
    writeProcessingFile(dir, 0);
    const result = await approveCheckpoint(dir);
    expect(result).toEqual({ success: false, error: "Checkpoint already processed" });
  });

  it("handles both files existing with old .processing — cleans up and proceeds", async () => {
    writeCheckpointFile(dir);
    writeProcessingFile(dir, 31_000);
    const result = await approveCheckpoint(dir);
    expect(result).toEqual({ success: true });
    expect(existsSync(join(dir, ".checkpoint"))).toBe(false);
    expect(existsSync(join(dir, ".checkpoint.processing"))).toBe(false);
  });

  it("boundary: .processing exactly 30 seconds old triggers recovery", async () => {
    writeProcessingFile(dir, 30_000);
    const result = await approveCheckpoint(dir);
    expect(result).toEqual({ success: false, error: "Recovered orphaned checkpoint \u2014 please retry" });
  });
});

describe("rejectCheckpoint", () => {
  let dir: string;

  beforeEach(() => {
    dir = createTempDir();
    vi.clearAllMocks();
  });

  it("happy path: renames, calls persistFeedback, removes .processing, returns success true", async () => {
    writeCheckpointFile(dir);
    const result = await rejectCheckpoint(dir, "needs changes");
    expect(result).toEqual({ success: true });
    expect(existsSync(join(dir, ".checkpoint"))).toBe(false);
    expect(existsSync(join(dir, ".checkpoint.processing"))).toBe(false);
    expect(mockedPersistFeedback).toHaveBeenCalledWith(dir, "needs changes");
    expect(mockedPersistFeedback).toHaveBeenCalledTimes(1);
  });

  it("returns success false with 'Checkpoint already processed' when .checkpoint does not exist (ENOENT)", async () => {
    const result = await rejectCheckpoint(dir, "feedback");
    expect(result).toEqual({ success: false, error: "Checkpoint already processed" });
  });

  it("does NOT call persistFeedback when renameSync throws ENOENT (AC-11)", async () => {
    // No .checkpoint file
    await rejectCheckpoint(dir, "feedback");
    expect(mockedPersistFeedback).not.toHaveBeenCalled();
  });

  it("no orphaned .processing file after happy path", async () => {
    writeCheckpointFile(dir);
    await rejectCheckpoint(dir, "feedback");
    expect(existsSync(join(dir, ".checkpoint.processing"))).toBe(false);
  });

  it("handles empty string feedback", async () => {
    writeCheckpointFile(dir);
    const result = await rejectCheckpoint(dir, "");
    expect(result).toEqual({ success: true });
    expect(mockedPersistFeedback).toHaveBeenCalledWith(dir, "");
  });

  it("recovers orphaned .processing older than 30 seconds", async () => {
    writeProcessingFile(dir, 31_000);
    const result = await rejectCheckpoint(dir, "feedback");
    expect(result).toEqual({ success: false, error: "Recovered orphaned checkpoint \u2014 please retry" });
    expect(mockedPersistFeedback).not.toHaveBeenCalled();
  });
});

describe("concurrent operations", () => {
  let dir: string;

  beforeEach(() => {
    dir = createTempDir();
    vi.clearAllMocks();
  });

  it("exactly one of two concurrent approveCheckpoint calls succeeds", async () => {
    writeCheckpointFile(dir);
    const [r1, r2] = await Promise.all([
      approveCheckpoint(dir),
      approveCheckpoint(dir),
    ]);
    const successes = [r1, r2].filter((r) => r.success);
    const failures = [r1, r2].filter((r) => !r.success);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toBe("Checkpoint already processed");
  });

  it("exactly one of concurrent approve + reject succeeds, loser does not call persistFeedback", async () => {
    writeCheckpointFile(dir);
    const [approveResult, rejectResult] = await Promise.all([
      approveCheckpoint(dir),
      rejectCheckpoint(dir, "feedback"),
    ]);
    const results = [approveResult, rejectResult];
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toBe("Checkpoint already processed");

    // If reject won, persistFeedback called once. If approve won, not called.
    if (rejectResult.success) {
      expect(mockedPersistFeedback).toHaveBeenCalledTimes(1);
    } else {
      expect(mockedPersistFeedback).not.toHaveBeenCalled();
    }
  });
});
