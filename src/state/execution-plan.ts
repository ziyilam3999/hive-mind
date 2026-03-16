import type { ExecutionPlan, Story, StoryStatus, SubTask, SubTaskStatus } from "../types/execution-plan.js";
import { getSourceFilePaths } from "../types/execution-plan.js";
import { readFileSafe, writeFileAtomic } from "../utils/file-io.js";
import { HiveMindError } from "../utils/errors.js";
import { join } from "node:path";

const VALID_TRANSITIONS: Record<string, StoryStatus[]> = {
  "not-started": ["in-progress", "skipped"],
  // "not-started" allowed for crash recovery: resetCrashedStories resets in-progress → not-started
  "in-progress": ["passed", "failed", "not-started"],
  "failed": ["skipped"],
};

export function loadExecutionPlan(planPath: string, hasModulesSection = false): ExecutionPlan {
  const content = readFileSafe(planPath);
  if (content === null) {
    throw new Error(`Execution plan not found: ${planPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Execution plan is corrupted (invalid JSON): ${planPath}`);
  }
  if (!validateExecutionPlan(parsed)) {
    throw new Error(`Execution plan failed validation: ${planPath}`);
  }
  return autoUpgradeModuleFields(parsed, hasModulesSection);
}

export function saveExecutionPlan(planPath: string, plan: ExecutionPlan): void {
  writeFileAtomic(planPath, JSON.stringify(plan, null, 2) + "\n");
}

/**
 * Auto-upgrade plans missing module fields.
 * Adds `modules: []` and `moduleId: "default"` on stories when missing.
 * Log level depends on context: debug for single-repo (intentional), warn for genuine misconfiguration.
 */
export function autoUpgradeModuleFields(plan: ExecutionPlan, hasModulesSection = false): ExecutionPlan {
  const needsModules = !plan.modules;
  const storiesMissingModuleId = plan.stories.filter((s) => !s.moduleId);
  const needsStoryUpgrade = storiesMissingModuleId.length > 0;

  if (!needsModules && !needsStoryUpgrade) return plan;

  if (hasModulesSection && needsStoryUpgrade) {
    console.warn(`[hive-mind] Plan has modules section but ${storiesMissingModuleId.length} stories lack moduleId — auto-setting to "default"`);
  } else if (needsModules || needsStoryUpgrade) {
    // Single-repo plan — intentional absence, debug-level
    console.debug(`[hive-mind] Auto-upgrading plan: adding module fields (single-repo default)`);
  }

  return {
    ...plan,
    modules: plan.modules ?? [],
    stories: plan.stories.map((s) =>
      s.moduleId ? s : { ...s, moduleId: "default" },
    ),
  };
}

/** Resolve moduleCwd for a story from the plan's modules array */
export function getModuleCwd(plan: ExecutionPlan, moduleId?: string): string | undefined {
  if (!moduleId || moduleId === "default") return undefined;
  const mod = plan.modules?.find((m) => m.id === moduleId);
  return mod?.path;
}

export function validateExecutionPlan(plan: unknown): plan is ExecutionPlan {
  if (typeof plan !== "object" || plan === null) return false;
  const p = plan as Record<string, unknown>;
  if (p.schemaVersion !== "2.0.0") return false;
  if (typeof p.prdPath !== "string") return false;
  if (typeof p.specPath !== "string") return false;
  if (!Array.isArray(p.stories)) return false;

  // Validate optional modules array
  if (p.modules !== undefined) {
    if (!Array.isArray(p.modules)) return false;
    for (const m of p.modules) {
      if (typeof m !== "object" || m === null) return false;
      const mod = m as Record<string, unknown>;
      if (typeof mod.id !== "string") return false;
      if (typeof mod.path !== "string") return false;
      if (typeof mod.role !== "string") return false;
      if (!["producer", "consumer", "standalone"].includes(mod.role)) return false;
      if (!Array.isArray(mod.dependencies)) return false;
    }
  }

  for (const s of p.stories) {
    if (typeof s !== "object" || s === null) return false;
    const story = s as Record<string, unknown>;
    if (typeof story.id !== "string") return false;
    if (typeof story.title !== "string") return false;
    if (!isValidStatus(story.status as string)) return false;
    if (typeof story.attempts !== "number" || story.attempts < 0) return false;
    if (typeof story.maxAttempts !== "number") return false;
    if (typeof story.committed !== "boolean") return false;
    if (story.commitHash !== null && typeof story.commitHash !== "string") return false;
    if (!Array.isArray(story.dependencies)) return false;
    if (!Array.isArray(story.sourceFiles)) return false;
    if (!Array.isArray(story.specSections)) return false;
    // moduleId is optional — validate type if present
    if (story.moduleId !== undefined && typeof story.moduleId !== "string") return false;
  }
  return true;
}

function isValidStatus(status: string): status is StoryStatus {
  return ["not-started", "in-progress", "passed", "failed", "skipped"].includes(status);
}

export function updateStoryStatus(
  plan: ExecutionPlan,
  storyId: string,
  status: StoryStatus,
): ExecutionPlan {
  const story = getStory(plan, storyId);
  if (!story) {
    throw new Error(`Story not found: ${storyId}`);
  }
  const allowed = VALID_TRANSITIONS[story.status];
  if (!allowed || !allowed.includes(status)) {
    throw new Error(
      `Invalid status transition: ${story.status} -> ${status} for story ${storyId}`,
    );
  }
  return {
    ...plan,
    stories: plan.stories.map((s) =>
      s.id === storyId ? { ...s, status } : s,
    ),
  };
}

export function incrementAttempts(
  plan: ExecutionPlan,
  storyId: string,
): ExecutionPlan {
  return {
    ...plan,
    stories: plan.stories.map((s) =>
      s.id === storyId ? { ...s, attempts: s.attempts + 1 } : s,
    ),
  };
}

export function markCommitted(
  plan: ExecutionPlan,
  storyId: string,
  commitHash: string,
): ExecutionPlan {
  return {
    ...plan,
    stories: plan.stories.map((s) =>
      s.id === storyId ? { ...s, committed: true, commitHash } : s,
    ),
  };
}

export function getStory(
  plan: ExecutionPlan,
  storyId: string,
): Story | undefined {
  return plan.stories.find((s) => s.id === storyId);
}

export function getNextStory(plan: ExecutionPlan): Story | undefined {
  return plan.stories.find((s) => {
    if (s.status !== "not-started" && s.status !== "in-progress") return false;
    return s.dependencies.every((depId) => {
      const dep = plan.stories.find((st) => st.id === depId);
      return dep?.status === "passed";
    });
  });
}

/** Returns all stories whose dependencies are satisfied and are ready to execute.
 * For multi-module plans, also checks module dependency satisfaction:
 * a story is only ready if all stories in its module's dependency modules are done.
 */
export function getReadyStories(plan: ExecutionPlan): Story[] {
  return plan.stories.filter((s) => {
    if (s.status !== "not-started") return false;

    // Check inter-story dependencies
    const storyDepsOk = s.dependencies.every((depId) => {
      const dep = plan.stories.find((st) => st.id === depId);
      return dep?.status === "passed";
    });
    if (!storyDepsOk) return false;

    // Check module dependency satisfaction (multi-repo)
    if (s.moduleId && plan.modules && plan.modules.length > 0) {
      const mod = plan.modules.find((m) => m.id === s.moduleId);
      if (mod && mod.dependencies.length > 0) {
        for (const depModId of mod.dependencies) {
          const depModStories = plan.stories.filter((st) => st.moduleId === depModId);
          if (depModStories.length === 0) {
            // Zero-stories-in-module: vacuously satisfied, log warning once
            console.warn(`[hive-mind] Module "${depModId}" has no stories assigned — dependency is vacuously satisfied`);
            continue;
          }
          const allDone = depModStories.every((st) => st.status === "passed");
          if (!allDone) return false;
        }
      }
    }

    return true;
  });
}

/**
 * Reusable topological sort using Kahn's algorithm.
 * Returns sorted order on success. Throws with full cycle path on cycle detection.
 */
export function topologicalSort(
  nodes: string[],
  getDeps: (id: string) => string[],
  _label: string = "node",
): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodes) {
    const deps = getDeps(id);
    inDegree.set(id, deps.length);
    for (const depId of deps) {
      const edges = adjacency.get(depId) ?? [];
      edges.push(id);
      adjacency.set(depId, edges);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (sorted.length < nodes.length) {
    // Find cycle path for diagnostic message
    const cycleNodes = nodes.filter((id) => inDegree.get(id)! > 0);
    const cyclePath = traceCycle(cycleNodes, getDeps);
    throw new HiveMindError(
      `Circular dependency: ${cyclePath.join(" -> ")}`,
    );
  }

  return sorted;
}

/** Trace a cycle path through the dependency graph for error messages */
function traceCycle(cycleNodes: string[], getDeps: (id: string) => string[]): string[] {
  const nodeSet = new Set(cycleNodes);
  const start = cycleNodes[0];
  const visited = new Set<string>();
  const path: string[] = [start];
  let current = start;

  while (true) {
    visited.add(current);
    const deps = getDeps(current).filter((d) => nodeSet.has(d));
    const next = deps.find((d) => d === start) ?? deps.find((d) => !visited.has(d));
    if (!next) break;
    path.push(next);
    if (next === start) break;
    current = next;
  }

  return path;
}

/** Validate dependency graph: detect circular deps and missing dep IDs */
export function validateDependencies(plan: ExecutionPlan): void {
  const storyIds = new Set(plan.stories.map((s) => s.id));

  // Check for missing dependency IDs
  for (const story of plan.stories) {
    for (const depId of story.dependencies) {
      if (!storyIds.has(depId)) {
        throw new HiveMindError(
          `Story ${story.id} depends on unknown story: ${depId}`,
        );
      }
    }
  }

  // Detect circular story dependencies
  topologicalSort(
    plan.stories.map((s) => s.id),
    (id) => plan.stories.find((s) => s.id === id)?.dependencies ?? [],
    "story",
  );

  // Detect circular module dependencies (if modules exist)
  if (plan.modules && plan.modules.length > 0) {
    const moduleIds = new Set(plan.modules.map((m) => m.id));
    for (const mod of plan.modules) {
      for (const depId of mod.dependencies) {
        if (!moduleIds.has(depId)) {
          throw new HiveMindError(
            `Module "${mod.id}" depends on unknown module: "${depId}"`,
          );
        }
      }
    }
    topologicalSort(
      plan.modules.map((m) => m.id),
      (id) => plan.modules!.find((m) => m.id === id)?.dependencies ?? [],
      "module",
    );
  }
}

/**
 * Crash recovery: reset any "in-progress" stories back to "not-started".
 * Called at the top of runExecuteStage to recover from prior crash/abort.
 */
export function resetCrashedStories(plan: ExecutionPlan): ExecutionPlan {
  const hasCrashed = plan.stories.some((s) => s.status === "in-progress");
  if (!hasCrashed) return plan;

  return {
    ...plan,
    stories: plan.stories.map((s) =>
      s.status === "in-progress" ? { ...s, status: "not-started" as StoryStatus } : s,
    ),
  };
}

/**
 * Greedy wave construction: select stories from `ready` list that don't have
 * overlapping sourceFiles. Iterates in plan order; if a candidate's sourceFiles
 * overlap with any already-selected story, defer it to the next wave.
 * Worst case (all files overlap) degrades to sequential — same as current behavior.
 *
 * When `plan` is provided, resolves sourceFiles to absolute paths using each
 * story's moduleCwd before comparison. This prevents false positives where
 * stories in different modules have the same relative path (e.g., "src/index.ts").
 */
export function filterNonOverlapping(stories: Story[], plan?: ExecutionPlan): Story[] {
  const selected: Story[] = [];
  const usedFiles = new Set<string>();

  const resolveFiles = (story: Story): string[] => {
    const paths = getSourceFilePaths(story.sourceFiles);
    if (!plan) return paths;
    const cwd = getModuleCwd(plan, story.moduleId);
    if (!cwd) return paths;
    return paths.map((f) => join(cwd, f));
  };

  for (const story of stories) {
    const resolved = resolveFiles(story);
    const hasOverlap = resolved.some((f) => usedFiles.has(f));
    if (!hasOverlap) {
      selected.push(story);
      for (const f of resolved) usedFiles.add(f);
    }
  }

  return selected;
}

// --- Sub-task state helpers (FW-01) ---

const VALID_SUBTASK_TRANSITIONS: Record<string, SubTaskStatus[]> = {
  "not-started": ["in-progress"],
  "in-progress": ["passed", "failed"],
  "failed": ["in-progress"], // retry
};

export function updateSubTaskStatus(
  plan: ExecutionPlan,
  storyId: string,
  subTaskId: string,
  status: SubTaskStatus,
): ExecutionPlan {
  const story = getStory(plan, storyId);
  if (!story) throw new Error(`Story not found: ${storyId}`);
  if (!story.subTasks || story.subTasks.length === 0) {
    throw new Error(`Story ${storyId} has no sub-tasks`);
  }
  const subTask = story.subTasks.find((st) => st.id === subTaskId);
  if (!subTask) throw new Error(`Sub-task not found: ${subTaskId}`);

  const allowed = VALID_SUBTASK_TRANSITIONS[subTask.status];
  if (!allowed || !allowed.includes(status)) {
    throw new Error(`Invalid sub-task transition: ${subTask.status} -> ${status} for ${subTaskId}`);
  }

  return {
    ...plan,
    stories: plan.stories.map((s) =>
      s.id === storyId
        ? {
            ...s,
            subTasks: s.subTasks!.map((st) =>
              st.id === subTaskId ? { ...st, status } : st,
            ),
          }
        : s,
    ),
  };
}

export function getNextSubTask(story: Story): SubTask | undefined {
  if (!story.subTasks) return undefined;
  return story.subTasks.find(
    (st) => st.status === "not-started" || (st.status === "failed" && st.attempts < st.maxAttempts),
  );
}

export function incrementSubTaskAttempts(
  plan: ExecutionPlan,
  storyId: string,
  subTaskId: string,
): ExecutionPlan {
  return {
    ...plan,
    stories: plan.stories.map((s) =>
      s.id === storyId
        ? {
            ...s,
            subTasks: s.subTasks!.map((st) =>
              st.id === subTaskId ? { ...st, attempts: st.attempts + 1 } : st,
            ),
          }
        : s,
    ),
  };
}

