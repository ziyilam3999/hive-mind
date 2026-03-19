import { HiveMindError } from "./errors.js";
import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface AgentCostEntry {
  storyId: string;
  agentType: string;
  costUsd: number;
  durationMs: number;
  timestamp: string;
}

export interface TimingSummary {
  totalDurationMs: number;
  agentCount: number;
  fastest: { agentType: string; storyId: string; durationMs: number } | null;
  median: { agentType: string; storyId: string; durationMs: number } | null;
  slowest: { agentType: string; storyId: string; durationMs: number } | null;
  perAgent: Array<{ storyId: string; agentType: string; durationMs: number; costUsd: number }>;
}

export interface CostSummary {
  totalCostUsd: number;
  totalDurationMs: number;
  perStory: Map<string, number>;
  entries: AgentCostEntry[];
}

/**
 * Estimate the total pipeline cost based on story count and stages.
 * Uses empirical per-story averages from observed runs:
 *   BUILD ≈ $0.30, VERIFY ≈ $0.15 (per attempt), LEARN ≈ $0.05, COMMIT ≈ $0.01
 * These are rough heuristics — actual costs depend on model, story complexity, and retries.
 */
export function estimatePipelineCost(storyCount: number, maxAttempts: number = 3): {
  estimatedUsd: number;
  breakdown: { stage: string; perStory: number; total: number }[];
} {
  const stages = [
    { stage: "BUILD", perStory: 0.30 },
    { stage: "VERIFY", perStory: 0.15 * Math.min(maxAttempts, 2) }, // avg ~2 attempts
    { stage: "LEARN", perStory: 0.05 },
    { stage: "COMMIT", perStory: 0.01 },
  ];

  const breakdown = stages.map((s) => ({
    stage: s.stage,
    perStory: s.perStory,
    total: s.perStory * storyCount,
  }));

  const estimatedUsd = breakdown.reduce((sum, b) => sum + b.total, 0);
  return { estimatedUsd, breakdown };
}

export class CostTracker {
  private entries: AgentCostEntry[] = [];
  private budgetUsd: number | undefined;
  private costLogPath: string | undefined;

  constructor(budgetUsd?: number, costLogPath?: string) {
    this.budgetUsd = budgetUsd;
    this.costLogPath = costLogPath;
  }

  /**
   * Load prior cost entries from a JSONL file on disk.
   * Used on resume to display cumulative totals.
   */
  static loadFromDisk(costLogPath: string, budgetUsd?: number): CostTracker {
    const tracker = new CostTracker(budgetUsd, costLogPath);
    if (existsSync(costLogPath)) {
      const content = readFileSync(costLogPath, "utf-8");
      for (const line of content.trim().split("\n")) {
        if (!line) continue;
        try {
          const entry = JSON.parse(line) as AgentCostEntry;
          tracker.entries.push(entry);
        } catch {
          // Skip corrupt lines
        }
      }
      if (tracker.entries.length > 0) {
        console.log(`[CostTracker] Loaded ${tracker.entries.length} prior cost entries ($${tracker.getPipelineTotal().toFixed(4)} cumulative)`);
      }
    }
    return tracker;
  }

  /**
   * Record cost for an agent invocation.
   * Safe to call from concurrent stories under Node.js single-threaded event loop —
   * Array.push is atomic within a single tick, so no mutex is needed.
   */
  recordAgentCost(
    storyId: string,
    agentType: string,
    costUsd: number | undefined,
    durationMs: number | undefined,
  ): void {
    if (costUsd === undefined) {
      console.warn(`[CostTracker] Missing cost data for ${agentType} (${storyId}) — defaulting to $0. Pipeline totals may undercount.`);
    }
    const entry: AgentCostEntry = {
      storyId,
      agentType,
      costUsd: costUsd ?? 0,
      durationMs: durationMs ?? 0,
      timestamp: new Date().toISOString(),
    };
    this.entries.push(entry);

    // Persist to disk if path is configured
    if (this.costLogPath) {
      try {
        mkdirSync(dirname(this.costLogPath), { recursive: true });
        appendFileSync(this.costLogPath, JSON.stringify(entry) + "\n");
      } catch (err) {
        console.warn(`[CostTracker] Failed to persist cost entry: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  getStoryTotal(storyId: string): number {
    return this.entries
      .filter((e) => e.storyId === storyId)
      .reduce((sum, e) => sum + e.costUsd, 0);
  }

  getPipelineTotal(): number {
    return this.entries.reduce((sum, e) => sum + e.costUsd, 0);
  }

  /** Returns true if budget has been exceeded */
  checkBudget(): boolean {
    if (this.budgetUsd === undefined) return false;
    return this.getPipelineTotal() > this.budgetUsd;
  }

  /** Throws HiveMindError if budget exceeded */
  enforceBudget(): void {
    if (this.checkBudget()) {
      throw new HiveMindError(
        `Budget exceeded: $${this.getPipelineTotal().toFixed(4)} spent, budget is $${this.budgetUsd!.toFixed(2)}`,
      );
    }
  }

  getTimingSummary(): TimingSummary {
    const sorted = [...this.entries]
      .filter(e => e.durationMs > 0)
      .sort((a, b) => a.durationMs - b.durationMs);

    const pick = (e: AgentCostEntry) => ({
      agentType: e.agentType, storyId: e.storyId, durationMs: e.durationMs,
    });

    return {
      totalDurationMs: sorted.reduce((s, e) => s + e.durationMs, 0),
      agentCount: sorted.length,
      fastest: sorted.length > 0 ? pick(sorted[0]) : null,
      median: sorted.length > 0 ? pick(sorted[Math.floor(sorted.length / 2)]) : null,
      slowest: sorted.length > 0 ? pick(sorted[sorted.length - 1]) : null,
      perAgent: sorted.map(e => ({
        storyId: e.storyId, agentType: e.agentType,
        durationMs: e.durationMs, costUsd: e.costUsd,
      })),
    };
  }

  getSummary(): CostSummary {
    const perStory = new Map<string, number>();
    for (const entry of this.entries) {
      perStory.set(entry.storyId, (perStory.get(entry.storyId) ?? 0) + entry.costUsd);
    }
    return {
      totalCostUsd: this.getPipelineTotal(),
      totalDurationMs: this.entries.reduce((sum, e) => sum + e.durationMs, 0),
      perStory,
      entries: [...this.entries],
    };
  }
}
