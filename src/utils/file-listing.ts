import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export interface FileListingOptions {
  root: string;
  maxFiles?: number;
  ignoreDirs?: string[];
}

const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules", "dist", ".git", ".claude", ".ai-workspace",
  "tmp", "__pycache__", ".next", "build", "coverage",
]);

export function collectProjectFileListing(options: FileListingOptions): string {
  const maxFiles = options.maxFiles ?? 2000;
  const extraIgnores = new Set(options.ignoreDirs ?? []);
  const ignoreSet = new Set([...DEFAULT_IGNORE_DIRS, ...extraIgnores]);

  // Also ignore any directory starting with .hive-mind-
  const isIgnored = (name: string): boolean =>
    ignoreSet.has(name) || name.startsWith(".hive-mind-");

  const lines: string[] = [];
  let count = 0;

  function walk(dir: string): void {
    if (count >= maxFiles) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (count >= maxFiles) break;

      if (entry.isDirectory()) {
        if (!isIgnored(entry.name)) {
          walk(join(dir, entry.name));
        }
      } else {
        const filePath = join(dir, entry.name);
        const relPath = relative(options.root, filePath).replace(/\\/g, "/");
        const firstLine = readFirstLine(filePath);
        lines.push(`${relPath}  -- ${firstLine}`);
        count++;
      }
    }
  }

  walk(options.root);

  if (count >= maxFiles) {
    lines.push(`\n(truncated at ${maxFiles} files)`);
  }

  return lines.join("\n");
}

function readFirstLine(filePath: string): string {
  try {
    const buf = readFileSync(filePath, { flag: "r" });
    // Binary detection: check first few bytes for non-text content
    for (let i = 0; i < Math.min(buf.length, 32); i++) {
      if (buf[i] === 0) return "(binary)";
    }
    const text = buf.toString("utf8");
    const firstLine = text.split(/\r?\n/)[0] ?? "";
    return firstLine.length > 120 ? firstLine.slice(0, 120) + "..." : firstLine;
  } catch {
    return "(binary)";
  }
}
