import { runShell } from "../utils/shell.js";
import type { HiveMindConfig } from "../config/schema.js";

export interface ToolingRequirement {
  tool: string;
  purpose: string;
  installCommand: string;
  detectCommand: string;
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
