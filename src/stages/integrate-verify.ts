import type { ExecutionPlan } from "../types/execution-plan.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { CostTracker } from "../utils/cost-tracker.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, ensureDir } from "../utils/file-io.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import { join } from "node:path";

export interface IntegrationVerifyResult {
  passed: boolean;
  skipped: boolean;
  boundaries: BoundaryResult[];
  warning?: string;
}

export interface BoundaryResult {
  producer: string;
  consumer: string;
  passed: boolean;
  reportPath: string;
}

/**
 * Run integration verification between module boundaries.
 * Spawns one integration-verifier agent per producer→consumer dependency edge.
 * Skipped entirely for single-repo plans (no modules).
 * Non-fatal (P39): crashes produce a warning, not a pipeline block.
 */
export async function runIntegrateVerify(
  plan: ExecutionPlan,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  costTracker?: CostTracker,
): Promise<IntegrationVerifyResult> {
  // Single-repo: skip entirely
  if (!plan.modules || plan.modules.length === 0) {
    return { passed: true, skipped: true, boundaries: [] };
  }

  const specPath = join(dirs.workingDir, "spec", "SPEC-v1.0.md");
  const specContent = readFileSafe(specPath) ?? "";

  // Check for ## Inter-Module Contracts section
  const hasContracts = specContent.includes("## Inter-Module Contracts");
  if (!hasContracts) {
    return {
      passed: true,
      skipped: false,
      boundaries: [],
      warning: "No contracts defined — cannot verify",
    };
  }

  const memoryPath = join(dirs.knowledgeDir, "memory.md");
  const memoryContent = readMemory(memoryPath);

  // Enumerate edges from Module.dependencies
  const edges: Array<{ producer: string; consumer: string }> = [];
  for (const mod of plan.modules) {
    for (const depId of mod.dependencies) {
      edges.push({ producer: depId, consumer: mod.id });
    }
  }

  if (edges.length === 0) {
    return { passed: true, skipped: false, boundaries: [] };
  }

  const reportsDir = join(dirs.workingDir, "reports", "integration");
  ensureDir(reportsDir);

  const boundaries: BoundaryResult[] = [];

  for (const edge of edges) {
    const reportPath = join(reportsDir, `${edge.producer}-${edge.consumer}-report.md`);

    // Collect impl-reports for both modules
    const producerStories = plan.stories.filter((s) => s.moduleId === edge.producer);
    const consumerStories = plan.stories.filter((s) => s.moduleId === edge.consumer);
    const implReports = [
      ...producerStories.map((s) => join(dirs.workingDir, `reports/${s.id}/impl-report.md`)),
      ...consumerStories.map((s) => join(dirs.workingDir, `reports/${s.id}/impl-report.md`)),
    ].filter((p) => readFileSafe(p) !== null);

    try {
      console.log(`Integration verify: ${edge.producer} → ${edge.consumer}`);
      const result = await spawnAgentWithRetry({
        type: "integration-verifier",
        model: "opus",
        inputFiles: [specPath, ...implReports],
        outputFile: reportPath,
        rules: getAgentRules("integration-verifier"),
        memoryContent,
      }, config);

      costTracker?.recordAgentCost(
        `integration-${edge.producer}-${edge.consumer}`,
        "integration-verifier",
        result.costUsd,
        result.durationMs,
      );

      const reportContent = readFileSafe(reportPath) ?? "";
      const passed = !reportContent.includes("FAIL");

      boundaries.push({
        producer: edge.producer,
        consumer: edge.consumer,
        passed,
        reportPath,
      });
    } catch (err) {
      // Non-fatal (P39): log warning, skip this boundary, continue
      console.warn(`[hive-mind] Integration verifier crashed for ${edge.producer} → ${edge.consumer}: ${err instanceof Error ? err.message : String(err)}`);
      boundaries.push({
        producer: edge.producer,
        consumer: edge.consumer,
        passed: false,
        reportPath,
      });
    }
  }

  const allPassed = boundaries.every((b) => b.passed);
  return { passed: allPassed, skipped: false, boundaries };
}

/**
 * Build checkpoint message content for approve-integration checkpoint.
 */
export function buildIntegrationCheckpointMessage(result: IntegrationVerifyResult): string {
  if (result.warning) {
    return `WARNING: ${result.warning}`;
  }

  const lines = ["Integration Verification Results:"];
  for (const b of result.boundaries) {
    lines.push(`  ${b.producer} → ${b.consumer}: ${b.passed ? "PASS" : "FAIL"}`);
  }
  lines.push(`\nOverall: ${result.passed ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}
