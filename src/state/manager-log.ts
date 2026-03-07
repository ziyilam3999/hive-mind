import type { LogAction, ManagerLogEntry } from "../types/manager-log.js";
import { appendFileSync, readFileSync } from "node:fs";
import { fileExists } from "../utils/file-io.js";
import { isoTimestamp } from "../utils/timestamp.js";
import { ensureDir } from "../utils/file-io.js";
import { dirname } from "node:path";

export function appendLogEntry(logPath: string, entry: ManagerLogEntry): void {
  ensureDir(dirname(logPath));
  appendFileSync(logPath, JSON.stringify(entry) + "\n");
}

export function readLog(logPath: string): ManagerLogEntry[] {
  if (!fileExists(logPath)) return [];
  const content = readFileSync(logPath, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ManagerLogEntry);
}

export function createLogEntry(
  action: LogAction,
  fields: Partial<ManagerLogEntry>,
): ManagerLogEntry {
  return {
    timestamp: isoTimestamp(),
    cycle: 0,
    storyId: null,
    reason: null,
    action,
    ...fields,
  };
}
