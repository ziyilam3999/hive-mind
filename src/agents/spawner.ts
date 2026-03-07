import type { AgentConfig, AgentResult } from "../types/agents.js";
import { runShell } from "../utils/shell.js";
import { fileExists } from "../utils/file-io.js";
import { buildPrompt } from "./prompts.js";
import { getModelForAgent } from "./model-map.js";

const AGENT_TIMEOUT = 600_000; // 10 minutes

export async function spawnAgent(config: AgentConfig): Promise<AgentResult> {
  const prompt = buildPrompt(config);
  const model = getModelForAgent(config.type);

  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const result = await runShell(
    `claude --print --model ${model} "${escapedPrompt}"`,
    { timeout: AGENT_TIMEOUT },
  );

  if (result.exitCode !== 0) {
    return {
      success: false,
      outputFile: config.outputFile,
      error: `Agent ${config.type} failed with exit code ${result.exitCode}: ${result.stderr}`,
    };
  }

  const outputExists = fileExists(config.outputFile);
  return {
    success: outputExists,
    outputFile: config.outputFile,
    error: outputExists ? undefined : `Agent ${config.type} completed but output file not found: ${config.outputFile}`,
  };
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
