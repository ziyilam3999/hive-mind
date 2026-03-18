import type { AgentConfig } from "../types/agents.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, ensureDir, fileExists } from "../utils/file-io.js";
import type { HiveMindConfig } from "../config/schema.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConstitution } from "../config/loader.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import { checkTruncation } from "../utils/truncation-monitor.js";
import { estimateTokens } from "../utils/token-count.js";
import type { CostTracker } from "../utils/cost-tracker.js";

const SPEC_STEPS = [
  "research-report.md",
  "SPEC-draft.md",
  "critique-1.md",
  "SPEC-v0.2.md",
  "critique-2.md",
  "SPEC-v1.0.md",
] as const;

const ENVIRONMENT_CONTEXT_BLOCK = {
  heading: "ENVIRONMENT CONTEXT",
  content: `Consider the runtime environment when analyzing the PRD:
- What OS/platform does this target? (Node.js, browser, mobile, embedded)
- What existing infrastructure exists? (databases, queues, APIs)
- What are the deployment constraints? (memory, CPU, network, latency)
- Are there compliance or regulatory requirements?
Flag any PRD assumptions that conflict with the likely deployment environment.`,
};

const DEPLOYMENT_CONTEXT_BLOCK = {
  heading: "DEPLOYMENT CONTEXT",
  content: `Evaluate deployment-readiness of the PRD:
- How will this be deployed? (CLI, library, service, serverless)
- What happens during upgrades? (migration path, backwards compatibility)
- What monitoring/observability is needed?
- What are the scaling characteristics? (single user, multi-tenant, high-throughput)
Flag any deployment concerns not addressed in the PRD.`,
};

const SELF_REVIEW_BLOCK = {
  heading: "SELF-REVIEW PROTOCOL",
  content: `Before finalizing your output, perform this self-review:
1. Re-read your entire output from the perspective of the NEXT agent in the pipeline
2. Check: Does every claim have evidence? (file:line, section reference, or logical chain)
3. Check: Did you address ALL input items, or did you silently skip any?
4. Check: Is the output self-contained — can the next agent act on it without external context?
5. If you find gaps, fix them before writing the output file. Do NOT leave known gaps for the next agent.`,
};

const GREENFIELD_CONTEXT_BLOCK = {
  heading: "GREENFIELD PROJECT",
  content: `This is a greenfield project with NO existing code.
- Don't assume any files or packages exist.
- Include a "Project Scaffolding" section in the SPEC.
- Explicitly specify all tech choices (agents can't infer from existing code).`,
};

export async function runSpecStage(
  prdPath: string,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  feedback?: string,
  greenfield?: boolean,
  tracker?: CostTracker,
): Promise<void> {
  const specDir = join(dirs.workingDir, "spec");
  ensureDir(specDir);

  const memoryPath = join(dirs.knowledgeDir, "memory.md");
  const memoryContent = readMemory(memoryPath);

  const prdContent = readFileSafe(prdPath);
  if (!prdContent) {
    throw new Error(`PRD file not found or empty: ${prdPath}`);
  }

  // Collect knowledge-base files
  const kbDir = join(dirs.knowledgeDir, "knowledge-base");
  const kbFiles = collectKnowledgeBaseFiles(kbDir);

  const guidelinesPath = join(dirs.knowledgeDir, "document-guidelines.md");
  const constitutionContent = loadConstitution(dirs.knowledgeDir);

  // S.1: Researcher (with justification analysis — replaces former S.2 justifier)
  console.log("S.1: Running researcher...");
  const researcherBlocks = [ENVIRONMENT_CONTEXT_BLOCK, DEPLOYMENT_CONTEXT_BLOCK];
  if (greenfield) researcherBlocks.push(GREENFIELD_CONTEXT_BLOCK);
  await spawnStep({
    type: "researcher",
    model: "opus",
    inputFiles: [prdPath, ...kbFiles],
    outputFile: join(specDir, "research-report.md"),
    rules: getAgentRules("researcher"),
    instructionBlocks: researcherBlocks,
    memoryContent,
  }, config, constitutionContent, tracker);

  const researchReport = join(specDir, "research-report.md");

  // S.2: Spec-drafter
  console.log("S.2: Running spec-drafter...");
  const drafterInputFiles = [researchReport, prdPath];
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

  const drafterBlocks = [SELF_REVIEW_BLOCK];
  if (greenfield) drafterBlocks.push(GREENFIELD_CONTEXT_BLOCK);
  await spawnStep({
    type: "spec-drafter",
    model: "opus",
    inputFiles: drafterInputFiles,
    outputFile: join(specDir, "SPEC-draft.md"),
    rules: drafterRules,
    instructionBlocks: drafterBlocks,
    memoryContent: feedback
      ? `${memoryContent}\n\n## HUMAN FEEDBACK (from rejection)\n${feedback}`
      : memoryContent,
  }, config, constitutionContent, tracker);

  const specDraft = join(specDir, "SPEC-draft.md");

  // S.3: Critic round 1 — ONLY receives SPEC-draft.md (P5/F9 isolation)
  console.log("S.3: Running critic (round 1)...");
  await spawnStep({
    type: "critic",
    model: "sonnet",
    inputFiles: [specDraft],
    outputFile: join(specDir, "critique-1.md"),
    rules: getAgentRules("critic"),
    memoryContent,
  }, config, constitutionContent, tracker);

  const critique1 = join(specDir, "critique-1.md");

  // S.4: Spec-corrector
  console.log("S.4: Running spec-corrector...");
  await spawnStep({
    type: "spec-corrector",
    model: "opus",
    inputFiles: [specDraft, critique1],
    outputFile: join(specDir, "SPEC-v0.2.md"),
    rules: getAgentRules("spec-corrector"),
    instructionBlocks: [SELF_REVIEW_BLOCK],
    memoryContent,
  }, config, constitutionContent, tracker);

  const specV02 = join(specDir, "SPEC-v0.2.md");

  // S.5: Critic round 2 — ONLY receives SPEC-v0.2.md (P5/F9 isolation)
  console.log("S.5: Running critic (round 2)...");
  await spawnStep({
    type: "critic",
    model: "sonnet",
    inputFiles: [specV02],
    outputFile: join(specDir, "critique-2.md"),
    rules: getAgentRules("critic"),
    memoryContent,
  }, config, constitutionContent, tracker);

  const critique2 = join(specDir, "critique-2.md");

  // S.6: Spec-corrector (final)
  console.log("S.6: Running spec-corrector (final)...");
  await spawnStep({
    type: "spec-corrector",
    model: "opus",
    inputFiles: [specV02, critique2],
    outputFile: join(specDir, "SPEC-v1.0.md"),
    rules: getAgentRules("spec-corrector"),
    instructionBlocks: [SELF_REVIEW_BLOCK],
    memoryContent,
  }, config, constitutionContent, tracker);

  console.log("SPEC stage complete. 6 artifacts produced.");
}

const MODEL_MAX_TOKENS = 200_000; // Conservative estimate for structured output

async function spawnStep(agentConfig: AgentConfig, hiveMindConfig: HiveMindConfig, constitutionContent?: string, tracker?: CostTracker): Promise<void> {
  const config = constitutionContent ? { ...agentConfig, constitutionContent } : agentConfig;
  const result = await spawnAgentWithRetry(config, hiveMindConfig);
  tracker?.recordAgentCost("SPEC", agentConfig.type, result.costUsd, result.durationMs);
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
