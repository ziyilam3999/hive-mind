import type { AgentConfig, AgentResult } from "../types/agents.js";
import type { HiveMindConfig } from "../config/schema.js";
import { spawnClaude } from "../utils/shell.js";
import { fileExists } from "../utils/file-io.js";
import { buildPrompt } from "./prompts.js";
import { getToolsForAgent } from "./tool-permissions.js";
import { calculateBackoffDelay, sleep } from "../utils/backoff.js";
import { runWithConcurrency } from "../utils/concurrency.js";
import { usageLimitTracker, UsageLimitError } from "../utils/usage-limit.js";

export async function spawnAgent(
  config: AgentConfig,
  hiveMindConfig: HiveMindConfig,
  timeoutOverride?: number,
): Promise<AgentResult> {
  const prompt = buildPrompt(config);
  const model = (hiveMindConfig.modelAssignments[config.type] as string) ?? config.model;
  const allowedTools = getToolsForAgent(config.type);

  const result = await spawnClaude({
    model,
    prompt,
    outputFormat: "json",
    allowedTools,
    timeout: timeoutOverride ?? hiveMindConfig.agentTimeout,
    cwd: config.cwd,
    outputFile: config.outputFile,
    mcpServers: hiveMindConfig.mcpServers,
  });

  const elapsed = result.json?.duration_ms;
  console.log(`[agent:${config.type}] completed in ${elapsed ? `${(elapsed / 1000).toFixed(1)}s` : '?'}${result.killedByOutputDetection ? ' (killed by output detection)' : ''}`);

  const outputExists = fileExists(config.outputFile);
  const resultMeta = {
    outputFile: config.outputFile,
    costUsd: result.json?.cost_usd,
    modelUsed: result.json?.model,
    sessionId: result.json?.session_id,
    durationMs: result.json?.duration_ms,
    killedByOutputDetection: result.killedByOutputDetection,
    usageLimitHit: result.usageLimitHit,
  };

  // Fail only if exit code is bad AND no output file
  if (result.exitCode !== 0 && !outputExists) {
    return {
      ...resultMeta,
      success: false,
      error: `Agent ${config.type} failed with exit code ${result.exitCode}: ${result.stderr}`,
    };
  }

  return {
    ...resultMeta,
    success: outputExists,
    error: outputExists ? undefined : `Agent ${config.type} completed but did not create output file: ${config.outputFile}`,
  };
}

const USAGE_LIMIT_WAIT_MS = 30_000;
const MAX_USAGE_LIMIT_RETRIES = 5;

export async function spawnAgentWithRetry(
  config: AgentConfig,
  hiveMindConfig: HiveMindConfig,
  maxRetries?: number,
  timeoutOverride?: number,
): Promise<AgentResult> {
  const retries = maxRetries ?? hiveMindConfig.maxRetries;
  let lastResult: AgentResult | undefined;
  let usageLimitRetries = 0;
  for (let attempt = 0; attempt <= retries; ) {
    if (attempt > 0) {
      const delay = calculateBackoffDelay(
        attempt - 1,
        hiveMindConfig.retryBaseDelayMs,
        hiveMindConfig.retryMaxDelayMs,
      );
      await sleep(delay);
    }
    lastResult = await spawnAgent(config, hiveMindConfig, timeoutOverride);

    if (lastResult.usageLimitHit) {
      usageLimitTracker.recordHit();
      usageLimitTracker.enforceLimit(); // throws UsageLimitError if threshold reached
      // Below threshold — wait and retry without consuming an attempt
      usageLimitRetries++;
      if (usageLimitRetries >= MAX_USAGE_LIMIT_RETRIES) {
        console.warn(`[spawnAgentWithRetry] Usage limit retries exhausted (${MAX_USAGE_LIMIT_RETRIES}) for ${config.type}`);
        return lastResult;
      }
      console.warn(`[spawnAgentWithRetry] Usage limit hit for ${config.type}, waiting ${USAGE_LIMIT_WAIT_MS / 1000}s before retry (${usageLimitRetries}/${MAX_USAGE_LIMIT_RETRIES})`);
      await sleep(USAGE_LIMIT_WAIT_MS);
      continue; // don't increment attempt
    }

    usageLimitTracker.recordSuccess();
    if (lastResult.success) return lastResult;
    attempt++;
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

  // Check for UsageLimitError — re-throw so callers (orchestrator) can pause
  for (const r of settled) {
    if (r.status === "rejected" && r.reason instanceof UsageLimitError) {
      throw r.reason;
    }
  }

  return settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const err = r.reason instanceof Error ? r.reason.message : String(r.reason);
    console.error(`[spawnAgentsParallel] Agent ${i} rejected: ${err}`);
    return { success: false, error: err, outputFile: "" } as AgentResult;
  });
}
