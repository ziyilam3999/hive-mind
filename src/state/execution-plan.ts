import type { ExecutionPlan, Story, StoryStatus } from "../types/execution-plan.js";
import { readFileSafe, writeFileAtomic } from "../utils/file-io.js";
import { HiveMindError } from "../utils/errors.js";

const VALID_TRANSITIONS: Record<string, StoryStatus[]> = {
  "not-started": ["in-progress", "skipped"],
  "in-progress": ["passed", "failed"],
  "failed": ["skipped"],
};

export function loadExecutionPlan(planPath: string): ExecutionPlan {
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
  return parsed;
}

export function saveExecutionPlan(planPath: string, plan: ExecutionPlan): void {
  writeFileAtomic(planPath, JSON.stringify(plan, null, 2) + "\n");
}

export function validateExecutionPlan(plan: unknown): plan is ExecutionPlan {
  if (typeof plan !== "object" || plan === null) return false;
  const p = plan as Record<string, unknown>;
  if (p.schemaVersion !== "2.0.0") return false;
  if (typeof p.prdPath !== "string") return false;
  if (typeof p.specPath !== "string") return false;
  if (!Array.isArray(p.stories)) return false;
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

/** Returns all stories whose dependencies are satisfied and are ready to execute */
export function getReadyStories(plan: ExecutionPlan): Story[] {
  return plan.stories.filter((s) => {
    if (s.status !== "not-started") return false;
    return s.dependencies.every((depId) => {
      const dep = plan.stories.find((st) => st.id === depId);
      return dep?.status === "passed";
    });
  });
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

  // Detect circular dependencies via iterative topological sort
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const story of plan.stories) {
    inDegree.set(story.id, story.dependencies.length);
    for (const depId of story.dependencies) {
      const edges = adjacency.get(depId) ?? [];
      edges.push(story.id);
      adjacency.set(depId, edges);
    }
  }

  // Start with nodes that have no dependencies
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (processed < plan.stories.length) {
    const cycleNodes = plan.stories
      .filter((s) => inDegree.get(s.id)! > 0)
      .map((s) => s.id);
    throw new HiveMindError(
      `Circular dependency detected among stories: ${cycleNodes.join(", ")}`,
    );
  }
}
