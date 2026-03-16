import type { AgentConfig } from "../types/agents.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, ensureDir, fileExists } from "../utils/file-io.js";
import type { HiveMindConfig } from "../config/schema.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConstitution } from "../config/loader.js";
import { checkTruncation } from "../utils/truncation-monitor.js";
import { estimateTokens } from "../utils/token-count.js";

const SPEC_STEPS = [
  "research-report.md",
  "justification.md",
  "SPEC-draft.md",
  "critique-1.md",
  "SPEC-v0.2.md",
  "critique-2.md",
  "SPEC-v1.0.md",
] as const;

export async function runSpecStage(
  prdPath: string,
  hiveMindDir: string,
  config: HiveMindConfig,
  feedback?: string,
): Promise<void> {
  const specDir = join(hiveMindDir, "spec");
  ensureDir(specDir);

  const memoryPath = join(hiveMindDir, "memory.md");
  const memoryContent = readMemory(memoryPath);

  const prdContent = readFileSafe(prdPath);
  if (!prdContent) {
    throw new Error(`PRD file not found or empty: ${prdPath}`);
  }

  // Collect knowledge-base files
  const kbDir = join(hiveMindDir, "knowledge-base");
  const kbFiles = collectKnowledgeBaseFiles(kbDir);

  const guidelinesPath = join(hiveMindDir, "document-guidelines.md");
  const constitutionContent = loadConstitution(hiveMindDir);

  // S.1: Researcher
  console.log("S.1: Running researcher...");
  await spawnStep({
    type: "researcher",
    model: "opus",
    inputFiles: [prdPath, ...kbFiles],
    outputFile: join(specDir, "research-report.md"),
    rules: getAgentRules("researcher"),
    memoryContent,
  }, config, constitutionContent);

  const researchReport = join(specDir, "research-report.md");

  // S.2: Justifier
  console.log("S.2: Running justifier...");
  await spawnStep({
    type: "justifier",
    model: "opus",
    inputFiles: [researchReport, prdPath],
    outputFile: join(specDir, "justification.md"),
    rules: getAgentRules("justifier"),
    memoryContent,
  }, config, constitutionContent);

  const justification = join(specDir, "justification.md");

  // S.3: Spec-drafter
  console.log("S.3: Running spec-drafter...");
  const drafterInputFiles = [researchReport, justification, prdPath];
  if (fileExists(guidelinesPath)) {
    drafterInputFiles.push(guidelinesPath);
  }

  // Add MULTI-MODULE rule when PRD declares modules
  const drafterRules = [...getAgentRules("spec-drafter")];
  if (prdContent.includes("## Modules")) {
    drafterRules.push(
      "MULTI-MODULE: The PRD declares multiple modules. Include a ## Inter-Module Contracts section in the SPEC defining the API boundaries between modules (exports, imports, data formats). This section is used by the integration verifier after execution.",
    );
  }

  await spawnStep({
    type: "spec-drafter",
    model: "opus",
    inputFiles: drafterInputFiles,
    outputFile: join(specDir, "SPEC-draft.md"),
    rules: drafterRules,
    memoryContent: feedback
      ? `${memoryContent}\n\n## HUMAN FEEDBACK (from rejection)\n${feedback}`
      : memoryContent,
  }, config, constitutionContent);

  const specDraft = join(specDir, "SPEC-draft.md");

  // S.4: Critic round 1 — ONLY receives SPEC-draft.md (P5/F9 isolation)
  console.log("S.4: Running critic (round 1)...");
  await spawnStep({
    type: "critic",
    model: "sonnet",
    inputFiles: [specDraft],
    outputFile: join(specDir, "critique-1.md"),
    rules: getAgentRules("critic"),
    memoryContent,
  }, config, constitutionContent);

  const critique1 = join(specDir, "critique-1.md");

  // S.5: Spec-corrector
  console.log("S.5: Running spec-corrector...");
  await spawnStep({
    type: "spec-corrector",
    model: "opus",
    inputFiles: [specDraft, critique1],
    outputFile: join(specDir, "SPEC-v0.2.md"),
    rules: getAgentRules("spec-corrector"),
    memoryContent,
  }, config, constitutionContent);

  const specV02 = join(specDir, "SPEC-v0.2.md");

  // S.6: Critic round 2 — ONLY receives SPEC-v0.2.md (P5/F9 isolation)
  console.log("S.6: Running critic (round 2)...");
  await spawnStep({
    type: "critic",
    model: "sonnet",
    inputFiles: [specV02],
    outputFile: join(specDir, "critique-2.md"),
    rules: getAgentRules("critic"),
    memoryContent,
  }, config, constitutionContent);

  const critique2 = join(specDir, "critique-2.md");

  // S.7: Spec-corrector (final)
  console.log("S.7: Running spec-corrector (final)...");
  await spawnStep({
    type: "spec-corrector",
    model: "opus",
    inputFiles: [specV02, critique2],
    outputFile: join(specDir, "SPEC-v1.0.md"),
    rules: getAgentRules("spec-corrector"),
    memoryContent,
  }, config, constitutionContent);

  console.log("SPEC stage complete. 7 artifacts produced.");
}

const MODEL_MAX_TOKENS = 200_000; // Conservative estimate for structured output

async function spawnStep(agentConfig: AgentConfig, hiveMindConfig: HiveMindConfig, constitutionContent?: string): Promise<void> {
  const config = constitutionContent ? { ...agentConfig, constitutionContent } : agentConfig;
  const result = await spawnAgentWithRetry(config, hiveMindConfig);
  if (!result.success) {
    // Empty critique is acceptable — log warning but proceed
    if (agentConfig.type === "critic") {
      console.warn(`Warning: Critic produced empty or missing output: ${result.error}`);
      return;
    }
    throw new Error(`Agent ${agentConfig.type} failed: ${result.error}`);
  }

  // ENH-05: Truncation monitoring after each agent output
  const output = readFileSafe(agentConfig.outputFile);
  if (output) {
    const tokens = estimateTokens(output);
    const truncationStatus = checkTruncation(output, tokens, MODEL_MAX_TOKENS);
    if (truncationStatus === "halt") {
      throw new Error(`SPEC output may be truncated — verify output completeness before continuing. (${agentConfig.type}, ${tokens} tokens)`);
    } else if (truncationStatus === "warn") {
      console.warn(`Warning: ${agentConfig.type} output is approaching token limit (${tokens} tokens / ${MODEL_MAX_TOKENS} max)`);
    }
  }
}

function collectKnowledgeBaseFiles(kbDir: string): string[] {
  if (!fileExists(kbDir)) return [];
  try {
    return readdirSync(kbDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(kbDir, f));
  } catch {
    return [];
  }
}

export { SPEC_STEPS };
