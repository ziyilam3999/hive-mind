import { spawnAgentsParallel } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readFileSafe, fileExists } from "../utils/file-io.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import { join } from "node:path";

export type ScorecardStage = "normalize" | "spec" | "plan" | "execute-wave" | "report";

export async function runScorecard(
  stage: ScorecardStage,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  extraContext?: string,
): Promise<void> {
  const reportCardPath = join(dirs.workingDir, "report-card.md");
  const memoryPath = join(dirs.knowledgeDir, "memory.md");
  const memoryContent = readFileSafe(memoryPath) ?? "";

  const inputFiles: string[] = [];
  const maybeAdd = (p: string) => { if (fileExists(p)) inputFiles.push(p); };

  // Always include prior report card (for accumulation)
  maybeAdd(reportCardPath);

  // Stage-specific inputs
  const planPath = join(dirs.workingDir, "plans", "execution-plan.json");
  const costLogPath = join(dirs.workingDir, "cost-log.jsonl");
  const managerLogPath = join(dirs.workingDir, "manager-log.jsonl");
  const timingReportPath = join(dirs.workingDir, "timing-report.md");

  switch (stage) {
    case "normalize":
      maybeAdd(join(dirs.workingDir, "normalize", "normalized-prd.md"));
      break;
    case "spec":
      maybeAdd(join(dirs.workingDir, "spec", "SPEC-v1.0.md"));
      maybeAdd(join(dirs.workingDir, "spec", "critique-round-1.md"));
      maybeAdd(join(dirs.workingDir, "spec", "critique-round-2.md"));
      maybeAdd(join(dirs.workingDir, "spec", "critique-log.md"));
      break;
    case "plan":
      maybeAdd(planPath);
      break;
    case "execute-wave":
      maybeAdd(planPath);
      maybeAdd(costLogPath);
      maybeAdd(managerLogPath);
      break;
    case "report":
      maybeAdd(planPath);
      maybeAdd(costLogPath);
      maybeAdd(managerLogPath);
      maybeAdd(timingReportPath);
      maybeAdd(join(dirs.workingDir, "consolidated-report.md"));
      maybeAdd(join(dirs.workingDir, "code-review-report.md"));
      maybeAdd(join(dirs.workingDir, "log-analysis.md"));
      maybeAdd(join(dirs.workingDir, "retrospective.md"));
      break;
  }

  if (inputFiles.length === 0) {
    console.log(`[scorecard] No inputs available for ${stage} — skipping.`);
    return;
  }

  const stageInstruction = {
    heading: "CURRENT STAGE",
    content: `You are scoring the **${stage.toUpperCase()}** stage.\n${extraContext ?? ""}\n${stage === "report" ? "This is the FINAL stage — include an overall letter grade and summary." : "Do NOT assign a final grade yet — just report stage-specific metrics."}`,
  };

  console.log(`[scorecard] Running for ${stage}...`);
  await spawnAgentsParallel([{
    type: "scorecard" as const,
    model: "haiku" as const,
    inputFiles,
    outputFile: reportCardPath,
    rules: getAgentRules("scorecard"),
    memoryContent,
    instructionBlocks: [stageInstruction],
  }], config);
}
