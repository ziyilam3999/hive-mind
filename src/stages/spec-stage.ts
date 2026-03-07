import type { AgentConfig } from "../types/agents.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, ensureDir, fileExists } from "../utils/file-io.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";

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

  // S.1: Researcher
  console.log("S.1: Running researcher...");
  await spawnStep({
    type: "researcher",
    model: "opus",
    inputFiles: [prdPath, ...kbFiles],
    outputFile: join(specDir, "research-report.md"),
    rules: getAgentRules("researcher"),
    memoryContent,
  });

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
  });

  const justification = join(specDir, "justification.md");

  // S.3: Spec-drafter
  console.log("S.3: Running spec-drafter...");
  const drafterInputFiles = [researchReport, justification, prdPath];
  if (fileExists(guidelinesPath)) {
    drafterInputFiles.push(guidelinesPath);
  }
  await spawnStep({
    type: "spec-drafter",
    model: "opus",
    inputFiles: drafterInputFiles,
    outputFile: join(specDir, "SPEC-draft.md"),
    rules: getAgentRules("spec-drafter"),
    memoryContent: feedback
      ? `${memoryContent}\n\n## HUMAN FEEDBACK (from rejection)\n${feedback}`
      : memoryContent,
  });

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
  });

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
  });

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
  });

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
  });

  console.log("SPEC stage complete. 7 artifacts produced.");
}

async function spawnStep(config: AgentConfig): Promise<void> {
  const result = await spawnAgentWithRetry(config);
  if (!result.success) {
    // Empty critique is acceptable — log warning but proceed
    if (config.type === "critic") {
      console.warn(`Warning: Critic produced empty or missing output: ${result.error}`);
      return;
    }
    throw new Error(`Agent ${config.type} failed: ${result.error}`);
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
