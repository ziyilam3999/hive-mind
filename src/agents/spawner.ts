import type { AgentConfig, AgentResult } from "../types/agents.js";
import type { HiveMindConfig } from "../config/schema.js";
import { spawnClaude } from "../utils/shell.js";
import { fileExists, writeFileAtomic, ensureDir } from "../utils/file-io.js";
import { buildPrompt } from "./prompts.js";
import { getToolsForAgent } from "./tool-permissions.js";
import { dirname } from "node:path";
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

  // Extract content: prefer JSON result field, fall back to raw stdout
  const content = result.json?.result ?? result.stdout.trim();

  // If agent didn't write the file, capture output as fallback
  if (!fileExists(config.outputFile) && content.length > 0) {
    ensureDir(dirname(config.outputFile));
    writeFileAtomic(config.outputFile, stripMarkdownFences(content));
  }

  const outputExists = fileExists(config.outputFile);
  return {
    success: outputExists,
    outputFile: config.outputFile,
    error: outputExists ? undefined : `Agent ${config.type} completed but output file not found: ${config.outputFile}`,
    costUsd: result.json?.cost_usd,
    modelUsed: result.json?.model,
    sessionId: result.json?.session_id,
    durationMs: result.json?.duration_ms,
  };
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^```\w*\n?/, "").replace(/\n?```\s*$/, "");
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
