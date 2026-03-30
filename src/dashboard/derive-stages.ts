/**
 * Extracted deriveStages logic for testability.
 *
 * This is the single source of truth — esbuild bundles it into
 * dashboard-bundle.js which server.ts inlines into the browser page.
 */

export interface StageDef {
  key: string;
  label: string;
  startAction: string;
  fallbackStart: string | null;
  endAction: string;
  secondaryFallback: string | null;
}

export interface LogEntry {
  action?: string;
  timestamp: string;
}

export interface Checkpoint {
  awaiting?: string;
}

export interface DerivedStage {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "failed" | "paused";
  durationMs: number | null;
}

export interface DeriveStagesInput {
  managerLog: LogEntry[];
  checkpoint: Checkpoint | null;
  stories: Array<{ status: string }> | null;
  costLog: Array<{ timestamp: string }> | null;
}

export const STAGE_DEFS: StageDef[] = [
  { key: "design", label: "Design", startAction: "DESIGN_START", fallbackStart: "PIPELINE_START", endAction: "DESIGN_PROTOTYPE_APPROVED", secondaryFallback: "DESIGN_SKIPPED" },
  { key: "spec", label: "Spec", startAction: "SPEC_START", fallbackStart: "PIPELINE_START", endAction: "SPEC_COMPLETE", secondaryFallback: null },
  { key: "plan", label: "Plan", startAction: "PLAN_START", fallbackStart: "SPEC_COMPLETE", endAction: "PLAN_COMPLETE", secondaryFallback: null },
  { key: "execute", label: "Execute", startAction: "EXECUTE_START", fallbackStart: "PLAN_COMPLETE", endAction: "EXECUTE_COMPLETE", secondaryFallback: "WAVE_START" },
  { key: "report", label: "Report", startAction: "EXECUTE_COMPLETE", fallbackStart: null, endAction: "REPORT_COMPLETE", secondaryFallback: null },
];

const CHECKPOINT_TO_STAGE: Record<string, string> = {
  "approve-normalize": "spec",
  "approve-spec": "plan",
  "approve-plan": "execute",
  "approve-preflight": "execute",
  "approve-integration": "report",
  "approve-diagnosis": "execute",
  "approve-design-skip": "design",
  "approve-design-questionnaire": "design",
  "approve-design-prototype": "design",
};

export function deriveStages(input: DeriveStagesInput, now?: number): DerivedStage[] {
  const { managerLog, checkpoint, stories, costLog } = input;
  const currentTime = now ?? Date.now();

  // Scan log: keep LAST timestamp per action
  const actionTimestamps: Record<string, number> = {};
  for (const entry of managerLog) {
    if (entry?.action) {
      actionTimestamps[entry.action] = new Date(entry.timestamp).getTime();
    }
  }

  // Check for REPORT actions
  let hasReportAction = false;
  let lastLogTs: number | null = null;
  for (const entry of managerLog) {
    const act = entry.action || "";
    if (act.toUpperCase().includes("REPORT")) {
      hasReportAction = true;
      const ts = new Date(entry.timestamp).getTime();
      if (!lastLogTs || ts > lastLogTs) lastLogTs = ts;
    }
  }

  // Story completion for EXECUTE
  let allStoriesDone = false;
  let hasFailed = false;
  if (stories && stories.length > 0) {
    allStoriesDone = true;
    for (const story of stories) {
      if (story.status === "failed") hasFailed = true;
      if (story.status !== "passed" && story.status !== "failed") allStoriesDone = false;
    }
  }

  // Latest WAVE_COMPLETE as execute end proxy
  let executeEndTs: number | null = null;
  for (const entry of managerLog) {
    const act = entry.action || "";
    if (act.includes("WAVE_COMPLETE")) {
      const ts = new Date(entry.timestamp).getTime();
      if (!executeEndTs || ts > executeEndTs) executeEndTs = ts;
    }
  }
  if (!executeEndTs && allStoriesDone && costLog && costLog.length > 0) {
    for (const cl of costLog) {
      const ts = new Date(cl.timestamp).getTime();
      if (!executeEndTs || ts > executeEndTs) executeEndTs = ts;
    }
  }

  // Checkpoint -> paused stage
  let pausedStageKey: string | null = null;
  if (checkpoint?.awaiting) {
    pausedStageKey = CHECKPOINT_TO_STAGE[checkpoint.awaiting] || null;
  }

  // First occurrence of each secondaryFallback action
  const firstOccurrence: Record<string, number> = {};
  for (const entry of managerLog) {
    const act = entry.action || "";
    for (const def of STAGE_DEFS) {
      if (def.secondaryFallback === act && firstOccurrence[act] == null) {
        firstOccurrence[act] = new Date(entry.timestamp).getTime();
      }
    }
  }

  // Build stages
  const stages: DerivedStage[] = [];
  for (const def of STAGE_DEFS) {
    let startTs = actionTimestamps[def.startAction];
    if (!startTs) {
      if (def.secondaryFallback && firstOccurrence[def.secondaryFallback]) {
        startTs = firstOccurrence[def.secondaryFallback];
      } else if (def.fallbackStart) {
        startTs = actionTimestamps[def.fallbackStart];
      }
    }
    const endTs = actionTimestamps[def.endAction];
    let stageStatus: DerivedStage["status"] = "pending";
    let durationMs: number | null = null;

    if (def.key === "execute" && !endTs && startTs && allStoriesDone) {
      stageStatus = hasFailed ? "failed" : "done";
      durationMs = executeEndTs ? executeEndTs - startTs : currentTime - startTs;
    } else if (def.key === "report" && !endTs && hasReportAction) {
      const reportStart = actionTimestamps[def.startAction] || executeEndTs || actionTimestamps["PLAN_COMPLETE"];
      if (reportStart) {
        stageStatus = "done";
        durationMs = lastLogTs ? lastLogTs - reportStart : currentTime - reportStart;
      }
    } else if (endTs && startTs) {
      stageStatus = "done";
      durationMs = endTs - startTs;
    } else if (startTs) {
      if (def.key === pausedStageKey) {
        stageStatus = "paused";
      } else {
        stageStatus = "running";
        durationMs = currentTime - startTs;
      }
    } else if (def.key === pausedStageKey) {
      stageStatus = "paused";
    }

    stages.push({ key: def.key, label: def.label, status: stageStatus, durationMs });
  }

  // Post-check: if execute has stories and some failed while running, mark as failed
  if (stories && stages.length >= 3 && stages[2].status === "running" && hasFailed) {
    stages[2].status = "failed";
  }

  return stages;
}
