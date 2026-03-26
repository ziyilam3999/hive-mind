/**
 * Extracted deriveActiveAgents logic for testability.
 *
 * NOTE: The inline browser JS in server.ts has an equivalent var-based copy.
 * Keep both in sync when modifying agent derivation logic.
 */

export interface Story {
  id: string;
  status: string;
  substage?: string;
  subTasks?: { id: string; status: string }[];
  wave?: number;
  durationMs?: number;
}

export interface ManagerLogEntry {
  timestamp: string;
  action: string;
  storyId?: string | null;
  waveNumber?: number | null;
  storyIds?: string[];
  attempt?: number;
}

export interface CostLogEntry {
  storyId?: string;
  timestamp?: string;
}

export interface ActiveAgent {
  type: string;
  context: string;
  substage: string;
  startTs: number;
  pipeline: boolean;
  wave?: number | null;
  subtaskId: string | null;
  description: string | null;
}

export interface DeriveResult {
  agents: ActiveAgent[];
  currentWave: number | null;
}

export function deriveActiveAgents(
  stories: Story[] | null,
  managerLog: ManagerLogEntry[],
  costLog: CostLogEntry[],
  now?: number,
): DeriveResult {
  const agents: ActiveAgent[] = [];
  const currentTime = now ?? Date.now();
  let currentWave: number | null = null;

  const hasRunningStory =
    stories != null && stories.some((s) => s.status === "in-progress");

  if (!hasRunningStory && managerLog.length > 0) {
    let hasSpecComplete = false;
    let hasPlanComplete = false;
    let pipelineStartTs: number | null = null;
    let specCompleteTs: number | null = null;

    for (const entry of managerLog) {
      if (entry.action === "PIPELINE_START")
        pipelineStartTs = new Date(entry.timestamp).getTime();
      if (entry.action === "SPEC_COMPLETE") {
        hasSpecComplete = true;
        specCompleteTs = new Date(entry.timestamp).getTime();
      }
      if (entry.action === "PLAN_COMPLETE") hasPlanComplete = true;
    }

    if (pipelineStartTs && !hasSpecComplete) {
      agents.push({
        type: "spec-agent",
        context: "SPEC",
        substage: "",
        startTs: pipelineStartTs,
        pipeline: true,
        subtaskId: null,
        description: "Generating specification from PRD",
      });
    } else if (hasSpecComplete && !hasPlanComplete && specCompleteTs) {
      agents.push({
        type: "planner",
        context: "PLAN",
        substage: "",
        startTs: specCompleteTs,
        pipeline: true,
        subtaskId: null,
        description: "Creating execution plan",
      });
    }
  }

  if (stories) {
    const latestActionByStory: Record<string, ManagerLogEntry> = {};
    const waveStartByStory: Record<string, number> = {};

    for (const entry of managerLog) {
      if (entry.action === "WAVE_START" && entry.waveNumber != null)
        currentWave = entry.waveNumber;
      if (entry.storyId) latestActionByStory[entry.storyId] = entry;
      if (entry.action === "WAVE_START" && entry.storyIds) {
        const wsTs = new Date(entry.timestamp).getTime();
        for (const sid of entry.storyIds) {
          if (!waveStartByStory[sid]) waveStartByStory[sid] = wsTs;
        }
      }
    }

    const startTsByStory: Record<string, number> = {};
    for (const ce of costLog) {
      if (ce.storyId && ce.timestamp) {
        const ts = new Date(ce.timestamp).getTime();
        if (!startTsByStory[ce.storyId] || ts < startTsByStory[ce.storyId])
          startTsByStory[ce.storyId] = ts;
      }
    }

    for (const story of stories) {
      if (story.status !== "in-progress") continue;

      let substage = story.substage || "BUILD";
      let agentType = "implementer";
      if (substage === "VERIFY") agentType = "verifier";
      else if (substage === "COMMIT") agentType = "committer";
      else if (substage === "TEST") agentType = "tester";

      const latestAction = latestActionByStory[story.id];
      if (latestAction) {
        if (latestAction.action === "BUILD_COMPLETE") {
          agentType = "refactorer";
          substage = "BUILD";
        }
        if (latestAction.action === "VERIFY_ATTEMPT") {
          agentType = "verifier";
          substage = "VERIFY";
        }
        if (latestAction.action === "COMPLIANCE_CHECK") {
          agentType = "compliance";
          substage = "VERIFY";
        }
        if (latestAction.action === "BUILD_RETRY") {
          agentType = "implementer";
          substage = "RETRY";
        }
      }

      let subtaskId: string | null = null;
      if (story.subTasks) {
        for (const st of story.subTasks) {
          if (st.status === "in-progress") {
            subtaskId = st.id;
            break;
          }
        }
      }

      let description: string | null = null;
      if (latestAction) {
        const act = latestAction.action;
        const attemptSuffix = latestAction.attempt
          ? " (attempt " + latestAction.attempt + ")"
          : "";
        if (act === "BUILD_COMPLETE")
          description = "Refactoring after build" + attemptSuffix;
        else if (act === "VERIFY_ATTEMPT")
          description = "Running verification" + attemptSuffix;
        else if (act === "COMPLIANCE_CHECK")
          description = "Running compliance checks";
        else if (act === "BUILD_RETRY")
          description = "Retrying build" + attemptSuffix;
        else if (act === "FIX_UNVERIFIED")
          description = "Fixing unverified items" + attemptSuffix;
        else if (act === "EVAL_ATTEMPT")
          description = "Evaluating results" + attemptSuffix;
        else description = "Building implementation" + attemptSuffix;
      } else {
        if (substage === "BUILD") description = "Building implementation";
        else if (substage === "VERIFY") description = "Running verification";
        else if (substage === "TEST") description = "Running tests";
        else if (substage === "COMMIT") description = "Preparing commit";
      }

      const startTs =
        startTsByStory[story.id] ||
        waveStartByStory[story.id] ||
        currentTime - (story.durationMs || 0);

      agents.push({
        type: agentType,
        context: story.id,
        substage,
        startTs,
        pipeline: false,
        wave: story.wave ?? currentWave,
        subtaskId,
        description,
      });
    }
  }

  return { agents, currentWave };
}
