import type { ToolingRequirement } from "./detect.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import { join } from "node:path";

export async function runToolingSetup(
  requirements: ToolingRequirement[],
  dirs: PipelineDirs,
  config: HiveMindConfig,
): Promise<boolean> {
  const memoryPath = join(dirs.knowledgeDir, "memory.md");
  const memoryContent = readMemory(memoryPath);

  const toolingTable = requirements
    .map((r) => `| ${r.tool} | ${r.purpose} | ${r.installCommand} | ${r.detectCommand} |`)
    .join("\n");

  const outputFile = join(dirs.workingDir, "spec", "tooling-setup-report.md");

  const result = await spawnAgentWithRetry({
    type: "tooling-setup",
    model: "sonnet",
    inputFiles: [dirs.workingDir],
    outputFile,
    rules: getAgentRules("tooling-setup"),
    memoryContent: `${memoryContent}\n\n## REQUIRED TOOLING\n| Tool | Purpose | Install Command | Detect Command |\n|------|---------|-----------------|----------------|\n${toolingTable}`,
  }, config);

  if (result.success) {
    console.log("TOOLING_INSTALLED: All tools set up successfully.");
    return true;
  }

  console.error("TOOLING_SETUP_FAILED: Agent could not set up required tools.");
  return false;
}
