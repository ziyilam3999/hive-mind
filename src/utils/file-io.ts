import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const RENAME_RETRIES = 3;
const RENAME_DELAY_MS = 100;
const TRANSIENT_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

export function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

export function writeFileAtomic(path: string, content: string): void {
  const dir = dirname(path);
  ensureDir(dir);
  const tmpPath = join(dir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  writeFileSync(tmpPath, content, "utf-8");
  renameWithRetry(tmpPath, path);
}

function renameWithRetry(src: string, dest: string): void {
  for (let attempt = 1; attempt <= RENAME_RETRIES; attempt++) {
    try {
      renameSync(src, dest);
      return;
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
      if (attempt < RENAME_RETRIES && TRANSIENT_CODES.has(code)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_DELAY_MS);
        continue;
      }
      try { unlinkSync(src); } catch { /* best-effort cleanup */ }
      throw err;
    }
  }
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}
