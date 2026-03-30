import { resolve, relative } from "node:path";

const toSlash = (p: string): string => p.replace(/\\/g, "/");

const TSC_ERROR_RE = /^(.+?)\(\d+,\d+\):\s*error\s+TS\d+:/;

/**
 * Parse tsc error output and partition errors by file ownership.
 * Returns only errors whose file path is in `scopeFiles`; the rest are foreign.
 */
export function filterTscErrorsByScope(
  tscOutput: string,
  scopeFiles: string[],
  targetDir: string,
): { ownedErrors: string[]; foreignErrors: string[] } {
  const normalizedScope = new Set(scopeFiles.map(toSlash));

  const ownedErrors: string[] = [];
  const foreignErrors: string[] = [];

  for (const line of tscOutput.split("\n")) {
    const match = line.match(TSC_ERROR_RE);
    if (!match) continue;

    const rawPath = match[1].trim();
    const absPath = resolve(targetDir, rawPath);
    const relPath = toSlash(relative(targetDir, absPath));

    if (normalizedScope.has(relPath)) {
      ownedErrors.push(line);
    } else {
      foreignErrors.push(line);
    }
  }

  return { ownedErrors, foreignErrors };
}
