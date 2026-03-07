import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { deleteCheckpoint } from "../state/checkpoint.js";

describe("CLI abort", () => {
  const testDir = join(process.cwd(), ".test-checkpoint-abort");

  it("deletes .checkpoint file", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, ".checkpoint"), '{"awaiting":"approve-spec"}');
    deleteCheckpoint(testDir);
    expect(existsSync(join(testDir, ".checkpoint"))).toBe(false);
    rmSync(testDir, { recursive: true });
  });

  it("is idempotent when no checkpoint exists", () => {
    expect(() => deleteCheckpoint(join(process.cwd(), ".nonexistent-dir"))).not.toThrow();
  });
});
