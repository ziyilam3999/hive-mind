import { join } from "node:path";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readFileSafe, ensureDir } from "../utils/file-io.js";
import { getModelForAgent } from "../agents/model-map.js";
import { readMemory } from "../memory/memory-manager.js";
import { loadConstitution } from "../config/loader.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";

export async function runNormalizeStage(
  prdPath: string,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  feedback?: string,
): Promise<void> {
  const normalizeDir = join(dirs.workingDir, "normalize");
  ensureDir(normalizeDir);

  const prdContent = readFileSafe(prdPath);
  if (!prdContent) throw new Error(`Input document not found or empty: ${prdPath}`);

  const memoryPath = join(dirs.knowledgeDir, "memory.md");
  const memoryContent = readMemory(memoryPath);
  const constitutionContent = loadConstitution(dirs.knowledgeDir);
  const feedbackRule = feedback
    ? `FEEDBACK FROM REVIEWER: ${feedback}. Address this feedback in your output.`
    : "";

  const result = await spawnAgentWithRetry(
    {
      type: "normalizer",
      model: getModelForAgent("normalizer"),
      inputFiles: [prdPath],
      outputFile: join(normalizeDir, "normalized-prd.md"),
      rules: [
        ...getAgentRules("normalizer"),
        ...(feedbackRule ? [feedbackRule] : []),
      ],
      memoryContent,
      constitutionContent,
    },
    config,
  );

  if (!result.success) {
    throw new Error(`Normalizer agent failed: ${result.error}`);
  }
}
