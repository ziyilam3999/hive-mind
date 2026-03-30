import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We test writeFileAtomic via the real implementation (no mocks on file-io itself).
// To simulate EPERM, we mock renameSync at the node:fs level.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

import { writeFileAtomic } from "../../utils/file-io.js";
import { renameSync } from "node:fs";

describe("writeFileAtomic", () => {
  let tmpDir: string;

  afterEach(() => {
    vi.mocked(renameSync).mockRestore();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes file on first attempt (happy path)", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "wfa-test-"));
    const target = join(tmpDir, "output.txt");
    writeFileAtomic(target, "hello");
    expect(readFileSync(target, "utf-8")).toBe("hello");
  });

  it("retries on EPERM and succeeds on 2nd attempt", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "wfa-retry-"));
    const target = join(tmpDir, "output.txt");

    let callCount = 0;
    const actual = vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(renameSync).mockImplementation((src, dest) => {
      callCount++;
      if (callCount === 1) {
        const err = new Error("EPERM") as NodeJS.ErrnoException;
        err.code = "EPERM";
        throw err;
      }
      // Use actual on resolve since the mock replaced it
      const fs = require("node:fs");
      // Direct syscall since renameSync is mocked
      const { renameSync: realRename } = require("node:fs/promises") as { renameSync?: never };
      // Fall through: writeFileSync wrote the temp, just do the real rename
      const fsOriginal = vi.importActual<typeof import("node:fs")>("node:fs");
      // Simplest: just use writeFileSync to simulate rename effect
      const content = fs.readFileSync(src, "utf-8");
      fs.writeFileSync(dest, content);
      fs.unlinkSync(src);
    });

    writeFileAtomic(target, "retried content");
    expect(readFileSync(target, "utf-8")).toBe("retried content");
    expect(callCount).toBe(2);
  });

  it("cleans up temp file after all retries exhausted", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "wfa-exhaust-"));
    const target = join(tmpDir, "output.txt");

    vi.mocked(renameSync).mockImplementation(() => {
      const err = new Error("EPERM") as NodeJS.ErrnoException;
      err.code = "EPERM";
      throw err;
    });

    expect(() => writeFileAtomic(target, "fail")).toThrow("EPERM");

    // No .tmp files should remain
    const files = readdirSync(tmpDir);
    const tmpFiles = files.filter((f) => f.startsWith(".tmp-"));
    expect(tmpFiles).toHaveLength(0);
  });
});
