import type { AgentConfig } from "../types/agents.js";
import { spawnAgentWithRetry, spawnAgentsParallel } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, ensureDir, fileExists, writeFileAtomic } from "../utils/file-io.js";
import type { HiveMindConfig } from "../config/schema.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConstitution } from "../config/loader.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import { checkTruncation } from "../utils/truncation-monitor.js";
import { estimateTokens } from "../utils/token-count.js";
import type { CostTracker } from "../utils/cost-tracker.js";
import { collectProjectFileListing } from "../utils/file-listing.js";
import { appendLogEntry, createLogEntry } from "../state/manager-log.js";

// 9 agent outputs for non-greenfield (project-listing.txt written by calling code, not an agent)
const SPEC_STEPS_FULL = [
  "relevance-map.md", "research-report.md", "spec-existing.md",
  "spec-new-features.md", "SPEC-draft.md",
  "critique-1.md", "SPEC-v0.2.md", "critique-2.md", "SPEC-v1.0.md",
] as const;

// 6 agent outputs for greenfield (SPEC-draft.md is a file copy, not in this array)
const SPEC_STEPS_GREENFIELD = [
  "research-report.md", "spec-new-features.md",
  "critique-1.md", "SPEC-v0.2.md", "critique-2.md", "SPEC-v1.0.md",
] as const;

export function getSpecSteps(greenfield: boolean): readonly string[] {
  return greenfield ? SPEC_STEPS_GREENFIELD : SPEC_STEPS_FULL;
}

// Backwards-compatible export for existing test consumers
const SPEC_STEPS = SPEC_STEPS_FULL;

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

/**
 * Builds a DESIGN_CONTEXT instruction block for SPEC agents based on
 * design stage artifacts. Four-case handling (§M-16, §FEAT-06):
 * 1. Both prototype + tokens exist → full context
 * 2. Only prototype exists → context with "tokens unavailable" note
 * 3. Design ran but no artifacts → warn, no block
 * 4. Design skipped or never started → no block, no warning
 */
function buildDesignContextBlock(
  dirs: PipelineDirs,
): { block: { heading: string; content: string } | null; warning: string | null } {
  const designDir = join(dirs.workingDir, "design");
  const prototypePath = join(designDir, "approved-prototype.html");
  const tokensPath = join(designDir, "design-tokens.json");

  const prototypeExists = fileExists(prototypePath);
  const tokensExist = fileExists(tokensPath);

  if (prototypeExists && tokensExist) {
    // Case 1: both artifacts exist
    const prototypeContent = readFileSafe(prototypePath) ?? "";
    const tokensContent = readFileSafe(tokensPath) ?? "";
    return {
      block: {
        heading: "DESIGN_CONTEXT",
        content: `The following design artifacts were approved by the user during the DESIGN stage. Use them to inform the SPEC.\n\n### approved-prototype.html\n\`\`\`html\n${prototypeContent.slice(0, 5000)}\n\`\`\`\n\n### design-tokens.json\n\`\`\`json\n${tokensContent}\n\`\`\``,
      },
      warning: null,
    };
  }

  if (prototypeExists && !tokensExist) {
    // Case 2: prototype only — tokens unavailable
    const prototypeContent = readFileSafe(prototypePath) ?? "";
    return {
      block: {
        heading: "DESIGN_CONTEXT",
        content: `The following design prototype was approved by the user during the DESIGN stage. Use it to inform the SPEC.\n\n### approved-prototype.html\n\`\`\`html\n${prototypeContent.slice(0, 5000)}\n\`\`\`\n\n### design-tokens.json\nDesign tokens were not extracted successfully. Refer to the prototype HTML for visual style decisions.`,
      },
      warning: null,
    };
  }

  // Check manager log to determine if design ran but produced nothing
  const logPath = join(dirs.workingDir, "manager-log.jsonl");
  const logContent = readFileSafe(logPath) ?? "";
  const hasDesignStart = logContent.includes('"DESIGN_START"');
  const hasDesignSkipped = logContent.includes('"DESIGN_SKIPPED"');

  if (hasDesignStart && !hasDesignSkipped) {
    // Case 3: design ran but produced no artifacts — warn
    return {
      block: null,
      warning: "Design stage ran but produced no artifacts — no DESIGN_CONTEXT injected.",
    };
  }

  // Case 4: design skipped or never started — no block, no warning
  return { block: null, warning: null };
}

export async function runSpecStage(
  prdPath: string,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  feedback?: string,
  greenfield?: boolean,
  tracker?: CostTracker,
  fromStep?: "drafter",
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

  // Add MULTI-MODULE rule when PRD declares modules
  const multiModuleRule = prdContent.includes("## Modules")
    ? "MULTI-MODULE: The PRD declares multiple modules. Include a ## Inter-Module Contracts section in the SPEC defining the API boundaries between modules (exports, imports, data formats). This section is used by the integration verifier after execution."
    : undefined;

  // Build DESIGN_CONTEXT injection (§M-16, §FEAT-06)
  const designContext = buildDesignContextBlock(dirs);
  if (designContext.warning) {
    console.warn(`[SPEC] Warning: ${designContext.warning}`);
    appendLogEntry(join(dirs.workingDir, "manager-log.jsonl"), createLogEntry("SPEC_START", {
      reason: designContext.warning,
    }));
  }

  if (greenfield) {
    await runGreenfieldFlow(specDir, prdPath, kbFiles, guidelinesPath, memoryContent, feedback, constitutionContent, config, tracker, fromStep, multiModuleRule, designContext.block);
  } else {
    await runNonGreenfieldFlow(specDir, prdPath, dirs, kbFiles, guidelinesPath, memoryContent, feedback, constitutionContent, config, tracker, fromStep, multiModuleRule, designContext.block);
  }
}

async function runGreenfieldFlow(
  specDir: string,
  prdPath: string,
  kbFiles: string[],
  guidelinesPath: string,
  memoryContent: string,
  feedback: string | undefined,
  constitutionContent: string | undefined,
  config: HiveMindConfig,
  tracker: CostTracker | undefined,
  fromStep: "drafter" | undefined,
  multiModuleRule: string | undefined,
  designContextBlock: { heading: string; content: string } | null = null,
): Promise<void> {
  if (!fromStep) {
    // S.1: Researcher
    console.log("S.1: Running researcher...");
    await spawnStep({
      type: "researcher",
      model: "opus",
      inputFiles: [prdPath, ...kbFiles],
      outputFile: join(specDir, "research-report.md"),
      rules: getAgentRules("researcher"),
      instructionBlocks: [ENVIRONMENT_CONTEXT_BLOCK, DEPLOYMENT_CONTEXT_BLOCK, GREENFIELD_CONTEXT_BLOCK],
      memoryContent,
    }, config, constitutionContent, tracker);
  }

  const researchReport = join(specDir, "research-report.md");

  // S.3: Feature Spec Drafter — input is research-report + PRD only
  console.log("S.3: Running feature-spec-drafter...");
  const drafterRules = [...getAgentRules("feature-spec-drafter")];
  if (multiModuleRule) drafterRules.push(multiModuleRule);

  const drafterBlocks: Array<{ heading: string; content: string }> = [SELF_REVIEW_BLOCK, GREENFIELD_CONTEXT_BLOCK];
  if (designContextBlock) drafterBlocks.push(designContextBlock);
  await spawnStep({
    type: "feature-spec-drafter",
    model: "opus",
    inputFiles: [researchReport, prdPath],
    outputFile: join(specDir, "spec-new-features.md"),
    rules: drafterRules,
    instructionBlocks: drafterBlocks,
    memoryContent: feedback
      ? `${memoryContent}\n\n## HUMAN FEEDBACK (from rejection)\n${feedback}`
      : memoryContent,
  }, config, constitutionContent, tracker);

  // File copy: spec-new-features.md -> SPEC-draft.md (keeps critique pipeline input consistent)
  const specNewFeatures = readFileSafe(join(specDir, "spec-new-features.md"));
  if (specNewFeatures) {
    writeFileAtomic(join(specDir, "SPEC-draft.md"), specNewFeatures);
  }

  await runCritiquePipeline(specDir, memoryContent, constitutionContent, config, tracker);

  console.log("SPEC stage complete (greenfield). 6 agents spawned.");
}

async function runNonGreenfieldFlow(
  specDir: string,
  prdPath: string,
  dirs: PipelineDirs,
  kbFiles: string[],
  guidelinesPath: string,
  memoryContent: string,
  feedback: string | undefined,
  constitutionContent: string | undefined,
  config: HiveMindConfig,
  tracker: CostTracker | undefined,
  fromStep: "drafter" | undefined,
  multiModuleRule: string | undefined,
  designContextBlock: { heading: string; content: string } | null = null,
): Promise<void> {
  if (!fromStep) {
    // Write project-listing.txt BEFORE spawning the scanner
    const projectListing = collectProjectFileListing({ root: process.cwd() });
    writeFileAtomic(join(specDir, "project-listing.txt"), projectListing);

    // S.0: Relevance Scanner
    console.log("S.0: Running relevance-scanner...");
    await spawnStep({
      type: "relevance-scanner",
      model: "sonnet",
      inputFiles: [join(specDir, "project-listing.txt"), prdPath],
      outputFile: join(specDir, "relevance-map.md"),
      rules: getAgentRules("relevance-scanner"),
      memoryContent,
    }, config, constitutionContent, tracker);

    // S.1 + S.2 in PARALLEL
    console.log("S.1+S.2: Running researcher + codebase-analyzer in parallel...");
    const researcherConfig: AgentConfig = {
      type: "researcher",
      model: "opus",
      inputFiles: [prdPath, ...kbFiles],
      outputFile: join(specDir, "research-report.md"),
      rules: getAgentRules("researcher"),
      instructionBlocks: [ENVIRONMENT_CONTEXT_BLOCK, DEPLOYMENT_CONTEXT_BLOCK],
      memoryContent,
    };

    const analyzerConfig: AgentConfig = {
      type: "codebase-analyzer",
      model: "opus",
      inputFiles: [join(specDir, "relevance-map.md")],
      outputFile: join(specDir, "spec-existing.md"),
      rules: getAgentRules("codebase-analyzer"),
      memoryContent,
      cwd: process.cwd(),
    };

    const parallelConfigs = [researcherConfig, analyzerConfig].map((c) =>
      constitutionContent ? { ...c, constitutionContent } : c,
    );
    const parallelResults = await spawnAgentsParallel(parallelConfigs, config);

    for (let i = 0; i < parallelResults.length; i++) {
      const r = parallelResults[i];
      const c = parallelConfigs[i];
      tracker?.recordAgentCost("SPEC", c.type, r.costUsd, r.durationMs);
      if (!r.success) {
        throw new Error(`Agent ${c.type} failed: ${r.error}`);
      }
    }
  }

  const researchReport = join(specDir, "research-report.md");

  // S.3: Feature Spec Drafter — NO codebase files
  console.log("S.3: Running feature-spec-drafter...");
  const drafterRules = [...getAgentRules("feature-spec-drafter")];
  if (multiModuleRule) drafterRules.push(multiModuleRule);

  const nonGfDrafterBlocks: Array<{ heading: string; content: string }> = [SELF_REVIEW_BLOCK];
  if (designContextBlock) nonGfDrafterBlocks.push(designContextBlock);
  await spawnStep({
    type: "feature-spec-drafter",
    model: "opus",
    inputFiles: [researchReport, prdPath],
    outputFile: join(specDir, "spec-new-features.md"),
    rules: drafterRules,
    instructionBlocks: nonGfDrafterBlocks,
    memoryContent: feedback
      ? `${memoryContent}\n\n## HUMAN FEEDBACK (from rejection)\n${feedback}`
      : memoryContent,
  }, config, constitutionContent, tracker);

  // S.4: Reconciler — merges spec-existing + spec-new-features
  console.log("S.4: Running reconciler...");
  await spawnStep({
    type: "reconciler",
    model: "opus",
    inputFiles: [join(specDir, "spec-existing.md"), join(specDir, "spec-new-features.md")],
    outputFile: join(specDir, "SPEC-draft.md"),
    rules: getAgentRules("reconciler"),
    instructionBlocks: [SELF_REVIEW_BLOCK],
    memoryContent,
  }, config, constitutionContent, tracker);

  await runCritiquePipeline(specDir, memoryContent, constitutionContent, config, tracker);

  console.log("SPEC stage complete. 9 agents spawned.");
}

async function runCritiquePipeline(
  specDir: string,
  memoryContent: string,
  constitutionContent: string | undefined,
  config: HiveMindConfig,
  tracker: CostTracker | undefined,
): Promise<void> {
  const specDraft = join(specDir, "SPEC-draft.md");

  // S.5: Critic round 1 — ONLY receives SPEC-draft.md (isolation)
  console.log("S.5: Running critic (round 1)...");
  await spawnStep({
    type: "critic",
    model: "sonnet",
    inputFiles: [specDraft],
    outputFile: join(specDir, "critique-1.md"),
    rules: getAgentRules("critic"),
    memoryContent,
  }, config, constitutionContent, tracker);

  const critique1 = join(specDir, "critique-1.md");

  // S.6: Spec-corrector
  console.log("S.6: Running spec-corrector...");
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

  // S.7: Critic round 2 — ONLY receives SPEC-v0.2.md (isolation) + regression check
  console.log("S.7: Running critic (round 2)...");
  await spawnStep({
    type: "critic",
    model: "sonnet",
    inputFiles: [specV02],
    outputFile: join(specDir, "critique-2.md"),
    rules: [
      ...getAgentRules("critic"),
      "REGRESSION-CHECK: You are Round 2. The document you're reviewing was corrected after Round 1. Actively look for NEW problems introduced by the corrections — inconsistencies between fixed sections and untouched sections, broken cross-references, or overcorrections that lost important content. Flag regressions with severity CRITICAL and tag them [REGRESSION].",
    ],
    memoryContent,
  }, config, constitutionContent, tracker);

  const critique2 = join(specDir, "critique-2.md");

  // S.8: Spec-corrector (final)
  console.log("S.8: Running spec-corrector (final)...");
  await spawnStep({
    type: "spec-corrector",
    model: "opus",
    inputFiles: [specV02, critique2],
    outputFile: join(specDir, "SPEC-v1.0.md"),
    rules: getAgentRules("spec-corrector"),
    instructionBlocks: [SELF_REVIEW_BLOCK],
    memoryContent,
  }, config, constitutionContent, tracker);

  // Compile critique log from both rounds (non-agent, local file-write)
  compileCritiqueLog(specDir);
}

function compileCritiqueLog(specDir: string): void {
  const critique1 = readFileSafe(join(specDir, "critique-1.md")) ?? "";
  const critique2 = readFileSafe(join(specDir, "critique-2.md")) ?? "";

  const countSeverity = (text: string, pattern: string): number =>
    (text.match(new RegExp(pattern, "gi")) || []).length;

  const log = `# Critique Log

## Round 1 Summary
- Critical: ${countSeverity(critique1, "critical")}
- Major: ${countSeverity(critique1, "major")}
- Minor: ${countSeverity(critique1, "minor")}

## Round 2 Summary
- Critical: ${countSeverity(critique2, "critical")}
- Major: ${countSeverity(critique2, "major")}
- Minor: ${countSeverity(critique2, "minor")}
- Regressions: ${countSeverity(critique2, "\\[REGRESSION\\]")}

## Round 1 Findings
${critique1 || "(empty)"}

## Round 2 Findings
${critique2 || "(empty)"}

## Generated: ${new Date().toISOString()}
`;

  writeFileAtomic(join(specDir, "critique-log.md"), log);
  console.log("Compiled critique-log.md");
}

const MODEL_MAX_TOKENS = 200_000;

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

export { SPEC_STEPS, SPEC_STEPS_FULL, SPEC_STEPS_GREENFIELD };
