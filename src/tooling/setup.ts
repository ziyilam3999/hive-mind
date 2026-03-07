import type { ToolingRequirement } from "./detect.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { join } from "node:path";

export async function runToolingSetup(
  requirements: ToolingRequirement[],
  hiveMindDir: string,
): Promise<boolean> {
  const memoryPath = join(hiveMindDir, "memory.md");
  const memoryContent = readMemory(memoryPath);

  const toolingTable = requirements
    .map((r) => `| ${r.tool} | ${r.purpose} | ${r.installCommand} | ${r.detectCommand} |`)
    .join("\n");

  const outputFile = join(hiveMindDir, "spec", "tooling-setup-report.md");

  const result = await spawnAgentWithRetry({
    type: "tooling-setup",
    model: "sonnet",
    inputFiles: [hiveMindDir],
    outputFile,
    rules: getAgentRules("tooling-setup"),
    memoryContent: `${memoryContent}\n\n## REQUIRED TOOLING\n| Tool | Purpose | Install Command | Detect Command |\n|------|---------|-----------------|----------------|\n${toolingTable}`,
  });

  if (result.success) {
    console.log("TOOLING_INSTALLED: All tools set up successfully.");
    return true;
  }

  console.error("TOOLING_SETUP_FAILED: Agent could not set up required tools.");
  return false;
}
