import type { AgentConfig, AgentResult } from "../types/agents.js";
import { runShell } from "../utils/shell.js";
import { fileExists, writeFileAtomic, ensureDir } from "../utils/file-io.js";
import { buildPrompt } from "./prompts.js";
import { getModelForAgent } from "./model-map.js";
import { dirname } from "node:path";

const AGENT_TIMEOUT = 600_000; // 10 minutes

export async function spawnAgent(config: AgentConfig): Promise<AgentResult> {
  const prompt = buildPrompt(config);
  const model = getModelForAgent(config.type);

  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const result = await runShell(
    `claude --print --dangerously-skip-permissions --model ${model} "${escapedPrompt}"`,
    { timeout: AGENT_TIMEOUT },
  );

  if (result.exitCode !== 0) {
    return {
      success: false,
      outputFile: config.outputFile,
      error: `Agent ${config.type} failed with exit code ${result.exitCode}: ${result.stderr}`,
    };
  }

  // Fix A: If agent didn't write the file, capture stdout as fallback
  if (!fileExists(config.outputFile) && result.stdout.trim().length > 0) {
    ensureDir(dirname(config.outputFile));
    writeFileAtomic(config.outputFile, stripMarkdownFences(result.stdout.trim()));
  }

  const outputExists = fileExists(config.outputFile);
  return {
    success: outputExists,
    outputFile: config.outputFile,
    error: outputExists ? undefined : `Agent ${config.type} completed but output file not found: ${config.outputFile}`,
  };
}

function stripMarkdownFences(text: string): string {
  // Remove leading ```json/```markdown/``` and trailing ```
  return text.replace(/^```\w*\n?/, "").replace(/\n?```\s*$/, "");
}

export async function spawnAgentWithRetry(
  config: AgentConfig,
  maxRetries: number = 1,
): Promise<AgentResult> {
  let lastResult: AgentResult | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await spawnAgent(config);
    if (lastResult.success) return lastResult;
  }
  return lastResult!;
}
