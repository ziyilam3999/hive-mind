import type { AgentConfig, AgentResult } from "../types/agents.js";
import type { HiveMindConfig } from "../config/schema.js";
import { spawnClaude } from "../utils/shell.js";
import { fileExists } from "../utils/file-io.js";
import { buildPrompt } from "./prompts.js";
import { getToolsForAgent } from "./tool-permissions.js";
import { calculateBackoffDelay, sleep } from "../utils/backoff.js";
import { runWithConcurrency } from "../utils/concurrency.js";

export async function spawnAgent(
  config: AgentConfig,
  hiveMindConfig: HiveMindConfig,
): Promise<AgentResult> {
  const prompt = buildPrompt(config);
  const model = (hiveMindConfig.modelAssignments[config.type] as string) ?? config.model;
  const allowedTools = getToolsForAgent(config.type);

  const result = await spawnClaude({
    model,
    prompt,
    outputFormat: "json",
    allowedTools,
    timeout: hiveMindConfig.agentTimeout,
    cwd: config.cwd,
    outputFile: config.outputFile,
  });

  const outputExists = fileExists(config.outputFile);

  // Fail only if exit code is bad AND no output file
  if (result.exitCode !== 0 && !outputExists) {
    return {
      success: false,
      outputFile: config.outputFile,
      error: `Agent ${config.type} failed with exit code ${result.exitCode}: ${result.stderr}`,
      costUsd: result.json?.cost_usd,
      modelUsed: result.json?.model,
      sessionId: result.json?.session_id,
      durationMs: result.json?.duration_ms,
    };
  }

  return {
    success: outputExists,
    outputFile: config.outputFile,
    error: outputExists ? undefined : `Agent ${config.type} completed but did not create output file: ${config.outputFile}`,
    costUsd: result.json?.cost_usd,
    modelUsed: result.json?.model,
    sessionId: result.json?.session_id,
    durationMs: result.json?.duration_ms,
  };
}

export async function spawnAgentWithRetry(
  config: AgentConfig,
  hiveMindConfig: HiveMindConfig,
  maxRetries?: number,
): Promise<AgentResult> {
  const retries = maxRetries ?? hiveMindConfig.maxRetries;
  let lastResult: AgentResult | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = calculateBackoffDelay(
        attempt - 1,
        hiveMindConfig.retryBaseDelayMs,
        hiveMindConfig.retryMaxDelayMs,
      );
      await sleep(delay);
    }
    lastResult = await spawnAgent(config, hiveMindConfig);
    if (lastResult.success) return lastResult;
  }
  return lastResult!;
}

export async function spawnAgentsParallel(
  configs: AgentConfig[],
  hiveMindConfig: HiveMindConfig,
  options?: { maxConcurrency?: number },
): Promise<AgentResult[]> {
  const limit = options?.maxConcurrency ?? configs.length;

  const tasks = configs.map((config) => () => spawnAgentWithRetry(config, hiveMindConfig));
  const settled = await runWithConcurrency(tasks, limit);

  // Extract values — spawnAgentWithRetry never throws (returns error result), so all are fulfilled
  return settled.map((r) => (r as PromiseFulfilledResult<AgentResult>).value);
}
