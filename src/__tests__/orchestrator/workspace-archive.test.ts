import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import { join } from "node:path";

import { archiveWorkspace, type ArchiveFsOps } from "../../utils/archive-workspace.js";

function makeTempDir(suffix: string): string {
  const dir = join(process.cwd(), `.test-archive-${suffix}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

describe("archiveWorkspace", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("happy path: renameSync succeeds, archive directory created with success log", { retry: 2 }, () => {
    const tempDir = makeTempDir("happy");
    try {
      const workingDir = join(tempDir, ".hive-mind-working");
      fs.mkdirSync(workingDir, { recursive: true });
      const aiWorkspace = join(tempDir, ".ai-workspace");
      fs.mkdirSync(aiWorkspace, { recursive: true });
      fs.writeFileSync(join(aiWorkspace, "test.txt"), "data");

      archiveWorkspace(workingDir);

      const archiveParent = join(tempDir, ".ai-workspace-archive");
      expect(fs.existsSync(archiveParent)).toBe(true);
      const archives = fs.readdirSync(archiveParent);
      expect(archives.length).toBe(1);
      expect(archives[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}$/);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[cleanup] Archived .ai-workspace to .ai-workspace-archive/"),
      );

      expect(fs.existsSync(aiWorkspace)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("no .ai-workspace exists — no archive log, fresh dir created", { retry: 2 }, () => {
    const tempDir = makeTempDir("noexist");
    try {
      const workingDir = join(tempDir, ".hive-mind-working");
      fs.mkdirSync(workingDir, { recursive: true });

      archiveWorkspace(workingDir);

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("[cleanup] Archived"),
      );

      const aiWorkspace = join(tempDir, ".ai-workspace");
      expect(fs.existsSync(aiWorkspace)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("CWD derivation correctness — path.dirname(workingDir) derives project root", { retry: 2 }, () => {
    const tempDir = makeTempDir("cwd");
    try {
      const workingDir = join(tempDir, ".hive-mind-working");
      fs.mkdirSync(workingDir, { recursive: true });
      const aiWorkspace = join(tempDir, ".ai-workspace");
      fs.mkdirSync(aiWorkspace, { recursive: true });
      fs.writeFileSync(join(aiWorkspace, "marker.txt"), "check");

      archiveWorkspace(workingDir);

      const archiveParent = join(tempDir, ".ai-workspace-archive");
      expect(fs.existsSync(archiveParent)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("timestamp format matches /^\\d{4}-\\d{2}-\\d{2}T\\d{6}$/", { retry: 2 }, () => {
    const tempDir = makeTempDir("ts");
    try {
      const workingDir = join(tempDir, ".hive-mind-working");
      fs.mkdirSync(workingDir, { recursive: true });
      const aiWorkspace = join(tempDir, ".ai-workspace");
      fs.mkdirSync(aiWorkspace, { recursive: true });

      archiveWorkspace(workingDir);

      const archiveParent = join(tempDir, ".ai-workspace-archive");
      const archives = fs.readdirSync(archiveParent);
      expect(archives.length).toBe(1);
      expect(archives[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}$/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("--force flag has no effect on archiving — archive runs regardless", { retry: 2 }, () => {
    const tempDir = makeTempDir("force");
    try {
      const workingDir = join(tempDir, ".hive-mind-working");
      fs.mkdirSync(workingDir, { recursive: true });
      const aiWorkspace = join(tempDir, ".ai-workspace");
      fs.mkdirSync(aiWorkspace, { recursive: true });
      fs.writeFileSync(join(aiWorkspace, "content.txt"), "data");

      archiveWorkspace(workingDir);

      const archiveParent = join(tempDir, ".ai-workspace-archive");
      expect(fs.existsSync(archiveParent)).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[cleanup] Archived .ai-workspace to .ai-workspace-archive/"),
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fallback: renameSync throws EPERM, cpSync + rmSync fallback executes", { retry: 2 }, () => {
    const tempDir = makeTempDir("fallback");
    try {
      const workingDir = join(tempDir, ".hive-mind-working");
      fs.mkdirSync(workingDir, { recursive: true });
      const aiWorkspace = join(tempDir, ".ai-workspace");
      fs.mkdirSync(aiWorkspace, { recursive: true });
      fs.writeFileSync(join(aiWorkspace, "file.txt"), "content");

      const mockOps: ArchiveFsOps = {
        renameSync: () => { throw makeError("operation not permitted", "EPERM"); },
        cpSync: fs.cpSync,
        rmSync: fs.rmSync,
      };

      archiveWorkspace(workingDir, mockOps);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[cleanup] Archived .ai-workspace to .ai-workspace-archive/"),
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("partial success: cpSync succeeds but rmSync fails — warning logged, step 5 skipped", { retry: 2 }, () => {
    const tempDir = makeTempDir("partial");
    try {
      const workingDir = join(tempDir, ".hive-mind-working");
      fs.mkdirSync(workingDir, { recursive: true });
      const aiWorkspace = join(tempDir, ".ai-workspace");
      fs.mkdirSync(aiWorkspace, { recursive: true });
      fs.writeFileSync(join(aiWorkspace, "data.txt"), "important");

      const mockOps: ArchiveFsOps = {
        renameSync: () => { throw makeError("EPERM", "EPERM"); },
        cpSync: fs.cpSync,
        rmSync: () => { throw makeError("EBUSY", "EBUSY"); },
      };

      archiveWorkspace(workingDir, mockOps);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("could not remove original"),
      );

      // Original .ai-workspace still exists since rmSync failed
      expect(fs.existsSync(aiWorkspace)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("both renameSync and cpSync fail — warning logged, could not archive, original directory persists", { retry: 2 }, () => {
    const tempDir = makeTempDir("bothfail");
    try {
      const workingDir = join(tempDir, ".hive-mind-working");
      fs.mkdirSync(workingDir, { recursive: true });
      const aiWorkspace = join(tempDir, ".ai-workspace");
      fs.mkdirSync(aiWorkspace, { recursive: true });

      const mockOps: ArchiveFsOps = {
        renameSync: () => { throw makeError("EPERM", "EPERM"); },
        cpSync: () => { throw makeError("ENOSPC", "ENOSPC"); },
        rmSync: fs.rmSync,
      };

      archiveWorkspace(workingDir, mockOps);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Could not archive .ai-workspace/"),
      );

      // .ai-workspace still exists
      expect(fs.existsSync(aiWorkspace)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
