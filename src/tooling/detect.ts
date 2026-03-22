import { runShell } from "../utils/shell.js";
import type { HiveMindConfig } from "../config/schema.js";
import { spawn } from "node:child_process";

/** ENH-04: Tool category determines halt vs warn behavior on missing */
export type ToolCategory = "build" | "test" | "lint" | "optional";

export const REQUIRED_TOOLS: Record<string, ToolCategory> = {
  "tsc": "build",
  "go": "build",
  "dart": "build",
  "jest": "test",
  "vitest": "test",
  "pytest": "test",
  "flutter": "test",
};

export const OPTIONAL_TOOLS: Record<string, ToolCategory> = {
  "eslint": "lint",
  "prettier": "lint",
  "ruff": "lint",
  "docker": "optional",
  "jq": "optional",
};

/**
 * ENH-04: Detect whether a tool is installed.
 * - Windows: uses `where <name>` (reliable PATH check; shell: true masks ENOENT)
 * - Other platforms: spawns `<name> --version` and catches ENOENT
 */
export async function detectToolBySpawn(name: string, timeout = 3000): Promise<"present" | "missing"> {
  return new Promise((resolve) => {
    try {
      if (process.platform === "win32") {
        // On Windows, 'where' reliably checks PATH. Using shell: true with
        // the tool directly would mask ENOENT (cmd.exe swallows it).
        const child = spawn("where", [name], { timeout, stdio: "ignore" });
        child.on("close", (code) => resolve(code === 0 ? "present" : "missing"));
        child.on("error", () => resolve("missing"));
      } else {
        const child = spawn(name, ["--version"], { timeout, stdio: "ignore" });
        child.on("error", (err: NodeJS.ErrnoException) => {
          resolve(err.code === "ENOENT" ? "missing" : "present");
        });
        child.on("close", () => resolve("present"));
      }
    } catch {
      resolve("missing");
    }
  });
}

/**
 * ENH-04: Check required vs optional tools and halt/warn accordingly.
 * Returns true if all required tools are present.
 */
export async function checkToolDependencies(
  tools: string[],
  timeout = 3000,
): Promise<{ allRequiredPresent: boolean; results: Map<string, { status: "present" | "missing"; category: ToolCategory }> }> {
  const results = new Map<string, { status: "present" | "missing"; category: ToolCategory }>();
  let allRequiredPresent = true;

  for (const tool of tools) {
    const category = REQUIRED_TOOLS[tool] ?? OPTIONAL_TOOLS[tool] ?? "optional";
    const status = await detectToolBySpawn(tool, timeout);
    results.set(tool, { status, category });

    if (status === "missing") {
      if (category === "build" || category === "test") {
        console.error(`HALT: Required ${category} tool "${tool}" not found on PATH`);
        allRequiredPresent = false;
      } else if (category === "lint") {
        console.warn(`WARN: Linter/formatter "${tool}" not found — ACs using this tool will report N/A (tool not installed)`);
      } else {
        console.warn(`WARN: Optional tool "${tool}" not found — continuing`);
      }
    }
  }

  return { allRequiredPresent, results };
}

export interface ToolingRequirement {
  tool: string;
  purpose: string;
  installCommand: string;
  detectCommand: string;
}

/**
 * Scan step-file content for CLI tool invocations and return unique tool names.
 * Only matches actual CLI usage patterns (e.g. `docker build`), not bare mentions.
 */
export function scanStepFileForTools(content: string): string[] {
  const found = new Set<string>();

  const patterns: { regex: RegExp; tool: string }[] = [
    { regex: /\b(docker)\s+(build|run|compose|push|pull|exec|login|tag|network|volume)\b/gi, tool: "docker" },
    { regex: /\b(redis-cli|redis-server)\b/gi, tool: "" }, // tool name extracted from match
    { regex: /\b(psql|createdb|pg_dump)\b/gi, tool: "" },
    { regex: /\b(docker-compose)\s/gi, tool: "docker-compose" },
  ];

  for (const { regex, tool } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (tool) {
        found.add(tool);
      } else {
        // Use the captured group (the tool name itself)
        found.add(match[1].toLowerCase());
      }
    }
  }

  return [...found];
}

export function parseRequiredTooling(specContent: string): ToolingRequirement[] {
  const requirements: ToolingRequirement[] = [];

  // Find the Required Tooling table in the SPEC
  const tableMatch = specContent.match(
    /##[#]?\s*Required Tooling[\s\S]*?\n((?:\|.*\|[\r\n]+)+)/i,
  );
  if (!tableMatch) return requirements;

  const rows = tableMatch[1].split("\n").filter((row) => row.includes("|"));

  for (const row of rows) {
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);

    // Skip header and separator rows
    if (cells.length < 4) continue;
    if (cells[0].startsWith("-") || cells[0].startsWith("Tool")) continue;

    requirements.push({
      tool: cells[0],
      purpose: cells[1],
      installCommand: cells[2],
      detectCommand: cells[3],
    });
  }

  return requirements;
}

export async function detectTool(
  requirement: ToolingRequirement,
  config: HiveMindConfig,
): Promise<{ detected: boolean; version?: string }> {
  const result = await runShell(requirement.detectCommand, { timeout: config.toolingDetectTimeout });
  if (result.exitCode === 0) {
    const version = result.stdout.trim().split("\n")[0] || undefined;
    return { detected: true, version };
  }
  return { detected: false };
}

export async function detectAllTools(
  requirements: ToolingRequirement[],
  config: HiveMindConfig,
): Promise<{ allDetected: boolean; results: Map<string, boolean> }> {
  const results = new Map<string, boolean>();
  let allDetected = true;

  for (const req of requirements) {
    const { detected } = await detectTool(req, config);
    results.set(req.tool, detected);
    if (detected) {
      console.log(`TOOLING_VERIFIED: ${req.tool}`);
    } else {
      allDetected = false;
      console.log(`TOOLING_MISSING: ${req.tool}`);
    }
  }

  return { allDetected, results };
}
