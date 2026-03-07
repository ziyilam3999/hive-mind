import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

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
  renameSync(tmpPath, path);
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}
