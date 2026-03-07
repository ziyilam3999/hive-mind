import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readCheckpoint } from "../state/checkpoint.js";

describe("CLI status", () => {
  const testDir = join(process.cwd(), ".test-checkpoint-status");

  it("reads checkpoint and returns awaiting stage", () => {
    mkdirSync(testDir, { recursive: true });
    const checkpoint = {
      awaiting: "approve-spec",
      message: "Review SPEC",
      timestamp: "2026-03-06T00:00:00.000Z",
      feedback: null,
    };
    writeFileSync(join(testDir, ".checkpoint"), JSON.stringify(checkpoint));
    const result = readCheckpoint(testDir);
    expect(result).not.toBeNull();
    expect(result!.awaiting).toBe("approve-spec");
    rmSync(testDir, { recursive: true });
  });

  it("returns null when no checkpoint exists", () => {
    const result = readCheckpoint(join(process.cwd(), ".nonexistent-dir"));
    expect(result).toBeNull();
  });
});
