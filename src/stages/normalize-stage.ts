import { join } from "node:path";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readFileSafe, ensureDir } from "../utils/file-io.js";
import { getModelForAgent } from "../agents/model-map.js";
import { readMemory } from "../memory/memory-manager.js";
import { loadConstitution } from "../config/loader.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";

/**
 * Detect if a PRD already follows the document-guidelines 10-section format.
 * Checks for 5 distinctive section headers plus REQ-ID numbering.
 * False positives are low-cost (additive mode still injects memory/constitution).
 */
export function detectCompliantFormat(prdContent: string): boolean {
  const requiredSections = [
    /^##?\s+1\.\s+Problem Statement/im,
    /^##?\s+2\.\s+Objective/im,
    /^##?\s+3\.\s+Requirements/im,
    /^##?\s+6\.\s+Success Criteria/im,
    /^##?\s+7\.\s+Out of Scope/im,
  ];
  const hasAllSections = requiredSections.every((re) => re.test(prdContent));
  const hasReqIds = /REQ-\d{2,}/.test(prdContent);
  return hasAllSections && hasReqIds;
}

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

  const isCompliant = detectCompliantFormat(prdContent);
  const complianceRule = isCompliant
    ? "COMPLIANT-FORMAT: This PRD already follows document-guidelines format with numbered sections and REQ-IDs. PRESERVE all existing sections, headings, and content verbatim. Do NOT restructure into the 7-section format. Only ADD: (1) memory/constitution references as inline notes within relevant sections, (2) any missing testable success criteria derived from requirements. Do not rename, reorder, merge, or remove any existing section."
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
        ...(complianceRule ? [complianceRule] : []),
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
