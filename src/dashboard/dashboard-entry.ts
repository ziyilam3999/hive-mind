/**
 * Browser entry point for dashboard bundle.
 *
 * esbuild bundles this into an IIFE that exposes the derive functions
 * as globals, adapting the typed module signatures to the browser's
 * global `state` variable.
 */
import { deriveStages as _deriveStages, STAGE_DEFS } from "./derive-stages.js";
import type { DeriveStagesInput } from "./derive-stages.js";
import { deriveActiveAgents as _deriveActiveAgents } from "./derive-agents.js";

// The browser declares `var state` as a global — tell TS about it.
declare const state: {
  executionPlan?: { stories?: { status: string; id: string; substage?: string; subTasks?: { id: string; status: string }[]; wave?: number; durationMs?: number }[] } | null;
  managerLog?: { action?: string; timestamp: string; storyId?: string | null; waveNumber?: number | null; storyIds?: string[]; attempt?: number; runId?: string }[];
  costLog?: { storyId?: string; timestamp?: string; costUsd?: number; durationMs?: number }[];
  checkpoint?: { awaiting?: string } | null;
  shutdownAt?: number;
} | null;

/**
 * Browser-compatible wrapper matching the inline signature:
 *   deriveStages(managerLog) — reads stories/checkpoint/costLog from global `state`.
 */
function deriveStages(managerLog: DeriveStagesInput["managerLog"]) {
  const stories = (state?.executionPlan?.stories) ?? null;
  const checkpoint = state?.checkpoint ?? null;
  const costLog = (state?.costLog as DeriveStagesInput["costLog"]) ?? null;
  return _deriveStages({ managerLog, checkpoint, stories, costLog });
}

/**
 * Browser-compatible wrapper matching the inline signature:
 *   deriveActiveAgents(stories, managerLog, costLog)
 */
function deriveActiveAgents(
  stories: Parameters<typeof _deriveActiveAgents>[0],
  managerLog: Parameters<typeof _deriveActiveAgents>[1],
  costLog: Parameters<typeof _deriveActiveAgents>[2],
) {
  return _deriveActiveAgents(stories, managerLog, costLog);
}

// Expose as globals for the rest of the inline <script> to use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = globalThis as any;
w.STAGE_DEFS = STAGE_DEFS;
w.deriveStages = deriveStages;
w.deriveActiveAgents = deriveActiveAgents;
