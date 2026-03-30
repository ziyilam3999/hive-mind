import * as fs from "node:fs";
import { dirname, join, sep } from "node:path";

/** Overridable fs operations for testability of error paths */
export interface ArchiveFsOps {
  renameSync: typeof fs.renameSync;
  cpSync: typeof fs.cpSync;
  rmSync: typeof fs.rmSync;
}

const defaultFsOps: ArchiveFsOps = {
  renameSync: fs.renameSync,
  cpSync: fs.cpSync,
  rmSync: fs.rmSync,
};

/**
 * Archive .ai-workspace/ to .ai-workspace-archive/{timestamp}/ before a fresh pipeline run.
 * Non-fatal by design (C11) — all errors caught internally, never propagated.
 */
export function archiveWorkspace(workingDir: string, fsOps: ArchiveFsOps = defaultFsOps): void {
  try {
    const cwd = dirname(workingDir);

    // SEC-01: bounds assertion — workingDir must be a direct child of cwd
    try {
      const resolvedCwd = fs.realpathSync(cwd);
      if (fs.existsSync(workingDir)) {
        const resolvedWorking = fs.realpathSync(workingDir);
        if (!resolvedWorking.startsWith(resolvedCwd + sep)) {
          console.warn("[cleanup] Warning: workingDir is not a child of project root — skipping archive");
          return;
        }
      }
    } catch {
      // realpathSync can fail if path doesn't exist yet — safe to continue
    }

    const aiWorkspace = join(cwd, ".ai-workspace");

    if (!fs.existsSync(aiWorkspace)) {
      fs.mkdirSync(aiWorkspace, { recursive: true });
      return;
    }

    // Generate timestamp: YYYY-MM-DDTHHMMSS
    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      "-",
      String(now.getMonth() + 1).padStart(2, "0"),
      "-",
      String(now.getDate()).padStart(2, "0"),
      "T",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");

    const archiveParent = join(cwd, ".ai-workspace-archive");
    const archiveDest = join(archiveParent, timestamp);

    fs.mkdirSync(archiveDest, { recursive: true });

    try {
      // Preferred: atomic rename (fast, no copy needed)
      fsOps.renameSync(aiWorkspace, archiveDest);
      console.log(`[cleanup] Archived .ai-workspace to .ai-workspace-archive/${timestamp}/`);
    } catch {
      // Rename failed (e.g., EPERM on Windows cross-device move) — fall back to copy+delete
      try {
        // SEC-02: verbatimSymlinks prevents symlink traversal during recursive copy
        fsOps.cpSync(aiWorkspace, archiveDest, { recursive: true, verbatimSymlinks: true });
        console.log(`[cleanup] Archived .ai-workspace to .ai-workspace-archive/${timestamp}/`);

        // Remove original after successful copy
        try {
          fsOps.rmSync(aiWorkspace, { recursive: true });
        } catch {
          // Copy succeeded but remove failed — partial success, original persists
          console.warn("[cleanup] Warning: Archived .ai-workspace/ but could not remove original -- manual cleanup may be required");
          return; // Skip fresh-dir creation since original still exists
        }
      } catch {
        // Both rename and copy failed — proceed without archiving
        console.warn("[cleanup] Warning: Could not archive .ai-workspace/ -- continuing with fresh workspace");
      }
    }

    // Ensure a fresh .ai-workspace/ exists for the new run
    fs.mkdirSync(aiWorkspace, { recursive: true });
  } catch {
    // Outer catch — C11: never propagate any error
    console.warn("[cleanup] Warning: Could not archive .ai-workspace/ -- continuing with fresh workspace");
  }
}
