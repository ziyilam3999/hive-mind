import type { AgentConfig, AgentResult } from "../types/agents.js";
import type { HiveMindConfig } from "../config/schema.js";
import { spawnClaude } from "../utils/shell.js";
import { fileExists } from "../utils/file-io.js";
import { buildPrompt } from "./prompts.js";
import { getToolsForAgent } from "./tool-permissions.js";
import { calculateBackoffDelay, sleep } from "../utils/backoff.js";

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
  });

  if (result.exitCode !== 0) {
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

  // Agent must create output file via Write tool (no fallback — raw stdout is session JSON)
  const outputExists = fileExists(config.outputFile);
  // No debug logging — strict output contract (RD-12)
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
  const maxConcurrency = options?.maxConcurrency ?? configs.length;

  if (maxConcurrency >= configs.length) {
    // All at once
    return Promise.all(
      configs.map((config) => spawnAgentWithRetry(config, hiveMindConfig)),
    );
  }

  // Worker-pool pattern for bounded concurrency
  const results: AgentResult[] = new Array(configs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < configs.length) {
      const idx = nextIndex++;
      results[idx] = await spawnAgentWithRetry(configs[idx], hiveMindConfig);
    }
  }

  const workers = Array.from({ length: maxConcurrency }, () => worker());
  await Promise.all(workers);

  return results;
}
