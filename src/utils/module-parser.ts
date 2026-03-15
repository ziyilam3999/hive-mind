import type { Module, ModuleRole } from "../types/module.js";
import { resolve, dirname } from "node:path";
import { existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";

const VALID_ROLES: ModuleRole[] = ["producer", "consumer", "standalone"];

/**
 * Parse a `## Modules` markdown table from SPEC/PRD content.
 * Returns an empty array if no `## Modules` section is found.
 *
 * Expected table format:
 * | id | path | role | dependencies |
 * |----|------|------|-------------|
 * | shared-lib | ../shared-lib | producer | |
 * | web-app | ../web-app | consumer | shared-lib |
 */
export function parseModules(content: string, basePath?: string): Module[] {
  const modulesSection = extractModulesSection(content);
  if (!modulesSection) return [];

  const rows = parseMarkdownTable(modulesSection);
  if (rows.length === 0) return [];

  const modules: Module[] = [];
  for (const row of rows) {
    // Normalize: LLM may use "Module"/"ID"/"Name" for id, capitalized headers, backtick-wrapped values
    const id = (row.id ?? row.module ?? row.name ?? "").trim().replace(/^`|`$/g, "");
    const path = (row.path ?? "").trim().replace(/^`|`$/g, "");
    const roleRaw = (row.role ?? "").trim().replace(/^`|`$/g, "");
    // Extract first word as role (LLM may add descriptions like "Producer (shared library)")
    const role = roleRaw.split(/[\s(]/)[0].toLowerCase() as ModuleRole;
    const depsStr = (row.dependencies ?? row.depends ?? "").trim().replace(/^`|`$/g, "");

    if (!id || !path) {
      throw new Error(`Module table row missing required fields (id, path): ${JSON.stringify(row)}`);
    }

    if (!VALID_ROLES.includes(role)) {
      throw new Error(`Module "${id}" has invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`);
    }

    const dependencies = depsStr && depsStr.toLowerCase() !== "none"
      ? depsStr.split(",").map((d) => d.trim().replace(/^`|`$/g, "")).filter(Boolean)
      : [];

    modules.push({ id, path, role, dependencies });
  }

  return modules;
}

/**
 * Resolve relative module paths against a base directory and validate.
 * Validates: paths exist as directories, no duplicates, no shared git repos.
 */
export function resolveAndValidateModules(modules: Module[], basePath: string): Module[] {
  if (modules.length === 0) return modules;

  const baseDir = dirname(basePath);
  const resolved: Module[] = [];
  const seenPaths = new Map<string, string>(); // absolutePath -> moduleId
  const gitRoots = new Map<string, string>(); // gitRoot -> moduleId

  for (const mod of modules) {
    const absPath = resolve(baseDir, mod.path);

    // Validate: path must exist as a directory
    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      throw new Error(`Module "${mod.id}" path does not exist or is not a directory: ${absPath}`);
    }

    // Validate: no duplicate paths
    if (seenPaths.has(absPath)) {
      throw new Error(`Modules "${seenPaths.get(absPath)}" and "${mod.id}" both point to the same path: ${absPath}`);
    }
    seenPaths.set(absPath, mod.id);

    // Validate: no shared git repo roots
    const gitRoot = getGitRoot(absPath);
    if (gitRoot) {
      if (gitRoots.has(gitRoot)) {
        throw new Error(
          `Modules "${gitRoots.get(gitRoot)}" and "${mod.id}" share git repo ${gitRoot} — use inter-story dependencies within a single module instead.`,
        );
      }
      gitRoots.set(gitRoot, mod.id);
    }

    resolved.push({ ...mod, path: absPath });
  }

  return resolved;
}

function extractModulesSection(content: string): string | null {
  // Find all ## headings containing "Module" (but not "Inter-Module Contracts")
  const headingRegex = /^## (?:\d+\.\s*)?Module(?!.*Contract)[^\n]*/gm;
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const idx = match.index;
    const start = content.indexOf("\n", idx);
    if (start === -1) continue;

    const nextSection = content.indexOf("\n## ", start + 1);
    const section = nextSection === -1
      ? content.slice(start + 1)
      : content.slice(start + 1, nextSection);

    const trimmed = section.trim();
    if (!trimmed) continue;

    // Verify this section contains a table with path/role columns (module definition table)
    // not just any table under a "Module" heading
    const firstTableHeader = trimmed.match(/^\|[^\n]+\|/m);
    if (firstTableHeader) {
      const headerLower = firstTableHeader[0].toLowerCase();
      if (headerLower.includes("path") && headerLower.includes("role")) {
        return trimmed;
      }
    }
  }
  return null;
}

function parseMarkdownTable(section: string): Record<string, string>[] {
  const lines = section.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return []; // need header + separator at minimum

  // Parse header — normalize to lowercase for resilience to LLM capitalization
  const headers = lines[0]
    .split("|")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  // Skip separator line (line[1])
  const dataLines = lines.slice(2);
  const rows: Record<string, string>[] = [];

  for (const line of dataLines) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length); // skip leading/trailing empty

    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = cells[i] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function getGitRoot(dirPath: string): string | null {
  try {
    const result = execSync("git rev-parse --show-toplevel", {
      cwd: dirPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch {
    return null;
  }
}
