import { HiveMindError } from "./errors.js";

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

export class CostTracker {
  private entries: AgentCostEntry[] = [];
  private budgetUsd: number | undefined;

  constructor(budgetUsd?: number) {
    this.budgetUsd = budgetUsd;
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
    this.entries.push({
      storyId,
      agentType,
      costUsd: costUsd ?? 0,
      durationMs: durationMs ?? 0,
      timestamp: new Date().toISOString(),
    });
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
