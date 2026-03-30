import type { AgentConfig } from "../types/agents.js";
import type { Story, SubTask } from "../types/execution-plan.js";
import { spawnAgentWithRetry, spawnAgentsParallel } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, writeFileAtomic, ensureDir, fileExists } from "../utils/file-io.js";
import type { HiveMindConfig } from "../config/schema.js";
import { join } from "node:path";
import { parseModules, resolveAndValidateModules } from "../utils/module-parser.js";
import { loadConstitution } from "../config/loader.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import { getSourceFilePaths } from "../types/execution-plan.js";
import type { CostTracker } from "../utils/cost-tracker.js";

const ROLE_KEYWORDS: Record<string, string[]> = {
  security: [
    "auth", "token", "password", "encrypt", "session",
    "permission", "payment", "credit", "PII", "GDPR",
  ],
  architect: [
    "interface", "refactor", "migration", "dependency", "API", "schema",
  ],
  "tester-role": [
    "function", "class", "export", "module", "endpoint", "handler",
  ],
};

const MANDATORY_ROLES = ["analyst", "reviewer"];

export function shouldActivateRole(role: string, specContent: string): boolean {
  if (MANDATORY_ROLES.includes(role)) return true;
  const keywords = ROLE_KEYWORDS[role];
  if (!keywords) return false;
  const lowerSpec = specContent.toLowerCase();
  return keywords.some((kw) => lowerSpec.includes(kw.toLowerCase()));
}

export function scanForRoleKeywords(specContent: string): string[] {
  const roles = [...MANDATORY_ROLES];
  for (const role of Object.keys(ROLE_KEYWORDS)) {
    if (shouldActivateRole(role, specContent)) {
      roles.push(role);
    }
  }
  return roles;
}

/** Check if an agent's output file already exists with non-empty content (resume support). */
function outputReady(path: string): boolean {
  return fileExists(path) && (readFileSafe(path) ?? "").length > 0;
}

const GREENFIELD_PLAN_BLOCK = {
  heading: "GREENFIELD PROJECT",
  content: `This is a greenfield project with NO existing code.
- Don't assume any files, packages, or configuration exist.
- The FIRST story MUST create package.json, tsconfig.json, .gitignore, and boilerplate.
- ALL other stories MUST depend on it.`,
};

export interface PlanStageResult {
  registryGapsFixed: Array<{ registryFile: string; storyId: string }>;
}

export async function runPlanStage(
  dirs: PipelineDirs,
  config: HiveMindConfig,
  feedback?: string,
  greenfield?: boolean,
  tracker?: CostTracker,
): Promise<PlanStageResult> {
  const plansDir = join(dirs.workingDir, "plans");
  const roleReportsDir = join(plansDir, "role-reports");
  const stepsDir = join(plansDir, "steps");
  ensureDir(plansDir);
  ensureDir(roleReportsDir);
  ensureDir(stepsDir);

  const memoryPath = join(dirs.knowledgeDir, "memory.md");
  const memoryContent = readMemory(memoryPath);
  const feedbackMemory = feedback
    ? `${memoryContent}\n\n## HUMAN FEEDBACK (from rejection)\n${feedback}`
    : memoryContent;

  const constitutionContent = loadConstitution(dirs.knowledgeDir);

  // Resume counters — track how many agents were skipped vs ran
  let agentsSkipped = 0;
  let agentsRan = 0;

  // Load SPEC
  const specPath = join(dirs.workingDir, "spec", "SPEC-v1.0.md");
  const specContent = readFileSafe(specPath);
  if (!specContent) {
    throw new Error(`SPEC-v1.0.md not found at: ${specPath}`);
  }

  // Step 1: Keyword scan for role activation
  const activeRoles = scanForRoleKeywords(specContent);
  console.log(`Active roles: ${activeRoles.join(", ")}`);

  // Step 2: Spawn role agents in parallel (independent subagents)
  const roleConfigs: AgentConfig[] = activeRoles.map((role) => {
    const agentType = role as AgentConfig["type"];
    return {
      type: agentType,
      model: (role === "analyst" || role === "architect" ? "opus" : "sonnet") as AgentConfig["model"],
      inputFiles: [specPath],
      outputFile: join(roleReportsDir, `${role}-report.md`),
      rules: getAgentRules(agentType),
      memoryContent: feedbackMemory,
      constitutionContent,
    };
  });

  // Resume: skip role agents whose output already exists
  const pendingRoleConfigs = roleConfigs.filter(c => !outputReady(c.outputFile));
  const skippedRoleConfigs = roleConfigs.filter(c => outputReady(c.outputFile));
  agentsSkipped += skippedRoleConfigs.length;

  if (skippedRoleConfigs.length > 0) {
    console.log(`[PLAN] Resuming: skipping ${skippedRoleConfigs.length} role agent(s)`);
  }

  const roleReportPaths: string[] = skippedRoleConfigs.map(c => c.outputFile);

  if (pendingRoleConfigs.length > 0) {
    console.log(`Spawning ${pendingRoleConfigs.length} role agents in parallel...`);
    const roleResults = await spawnAgentsParallel(pendingRoleConfigs, config);
    agentsRan += pendingRoleConfigs.length;

    for (let i = 0; i < roleResults.length; i++) {
      tracker?.recordAgentCost("PLAN", pendingRoleConfigs[i].type, roleResults[i].costUsd, roleResults[i].durationMs);
      if (roleResults[i].success) {
        roleReportPaths.push(pendingRoleConfigs[i].outputFile);
      } else {
        console.warn(`Warning: Role agent ${pendingRoleConfigs[i].type} failed. Omitting report.`);
      }
    }
  }

  // Step 3: Planner → AC-gen → EC-gen pipeline (replaces single synthesizer)
  console.log("Running planner...");
  const planJsonPath = join(plansDir, "execution-plan.json");

  // Detect multi-module from SPEC's module section (handles numbered headings and variants)
  const hasModules = /^## (?:\d+\.\s*)?Module(?!.*Contract)/m.test(specContent);
  const moduleIdField = hasModules
    ? `\n      "moduleId": "<module id from ## Modules table>",`
    : "";
  const moduleIdInstruction = hasModules
    ? "\nMULTI-MODULE: The SPEC declares modules in ## Modules. Assign each story a moduleId matching one of the declared module ids. Stories' sourceFiles are relative to their module's path."
    : "";

  const PLANNER_SCHEMA = `Output ONLY valid JSON (no markdown fences). Required schema:
{
  "schemaVersion": "2.0.0",
  "prdPath": "<relative path to PRD>",
  "specPath": "<relative path to SPEC>",
  "stories": [
    {
      "id": "US-01",
      "title": "Short title",
      "specSections": ["§3.1"],
      "dependencies": [],
      "sourceFiles": [{"path": "src/file.ts", "changeType": "ADDED"}],
      "complexity": "low",
      "securityRisk": "optional — describe security concerns if any",
      "complexityJustification": "optional — explain complexity rating",
      "dependencyImpact": "optional — describe cross-story impacts",${moduleIdField}
      "rolesUsed": ["analyst"],
      "stepFile": "plans/steps/US-01.md",
      "status": "not-started",
      "attempts": 0,
      "maxAttempts": ${config.maxAttempts},
      "committed": false,
      "commitHash": null
    }
  ]
}
CRITICAL: schemaVersion MUST be exactly "2.0.0". Every story MUST have all fields listed above. Do NOT include stepContent or ACs/ECs — produce skeletons only (GOAL, SPEC REFS, INPUT, OUTPUT).
DELTA MARKERS: Every sourceFiles entry MUST be an object with "path" (file path) and "changeType" ("ADDED" for new files, "MODIFIED" for existing files being changed, "REMOVED" for files being deleted). Do NOT use plain strings.${moduleIdInstruction}`;

  const plannerRules = [...getAgentRules("planner"), PLANNER_SCHEMA];
  if (greenfield) {
    plannerRules.push(`${GREENFIELD_PLAN_BLOCK.heading}: ${GREENFIELD_PLAN_BLOCK.content}`);
  }
  // Resume: skip planner if execution-plan.json already exists
  if (!outputReady(planJsonPath)) {
    const plannerResult = await spawnAgentWithRetry({
      type: "planner",
      model: "opus",
      inputFiles: [specPath, ...roleReportPaths],
      outputFile: planJsonPath,
      rules: plannerRules,
      memoryContent: feedbackMemory,
      constitutionContent,
    }, config);
    tracker?.recordAgentCost("PLAN", "planner", plannerResult.costUsd, plannerResult.durationMs);
    agentsRan++;

    if (!fileExists(planJsonPath)) {
      throw new Error("Planner failed to produce execution-plan.json");
    }
  } else {
    console.log("[PLAN] Resuming: skipping planner — execution-plan.json exists");
    agentsSkipped++;
  }

  // Parse planner output
  const planContent = readFileSafe(planJsonPath);
  if (!planContent) {
    throw new Error("execution-plan.json is empty");
  }

  let planData: { stories: Story[] };
  try {
    planData = JSON.parse(planContent);
  } catch {
    throw new Error("execution-plan.json is not valid JSON");
  }

  let stories = planData.stories;
  if (!Array.isArray(stories) || stories.length === 0) {
    throw new Error("execution-plan.json contains no stories");
  }

  // Parse and wire modules from SPEC content
  const parsedModules = parseModules(specContent);
  if (parsedModules.length > 0) {
    // Module paths are relative to workspace root (parent of .hive-mind/).
    // resolveAndValidateModules uses dirname(basePath) as resolve base,
    // so pass a file path whose dirname is the workspace root.
    const workspaceRoot = join(dirs.workingDir, "..");
    const resolvedModules = resolveAndValidateModules(parsedModules, join(workspaceRoot, "dummy"));
    (planData as Record<string, unknown>).modules = resolvedModules;
    // Persist modules into execution-plan.json
    writeFileAtomic(planJsonPath, JSON.stringify(planData, null, 2) + "\n");
    console.log(`  Modules parsed: ${resolvedModules.map((m) => m.id).join(", ")}`);
  }

  // Plan Validation — detect cross-story structural gaps
  const validationReportPath = join(dirs.workingDir, "plans/plan-validation-report.md");

  if (!outputReady(validationReportPath)) {
    console.log("[PLAN] Validating execution plan structure...");
    const validatorConfig: AgentConfig = {
      type: "plan-validator",
      model: "sonnet",
      inputFiles: [planJsonPath, specPath],
      outputFile: validationReportPath,
      rules: getAgentRules("plan-validator"),
      memoryContent: feedbackMemory,
      constitutionContent,
    };

    const validatorResult = await spawnAgentWithRetry(validatorConfig, config);
    tracker?.recordAgentCost("PLAN", "plan-validator", validatorResult.costUsd, validatorResult.durationMs);
    agentsRan++;
  } else {
    console.log("[PLAN] Resuming: skipping plan-validator");
    agentsSkipped++;
  }

  // Apply corrections unconditionally (works for both fresh and resume paths)
  const validationReport = readFileSafe(validationReportPath);
  if (validationReport) {
    const correctedPlan = extractCorrectedPlan(validationReport);
    if (correctedPlan) {
      // Merge only stories — preserve modules, schemaVersion, and other top-level fields
      planData = { ...planData, stories: correctedPlan.stories };
      stories = planData.stories;
      writeFileAtomic(planJsonPath, JSON.stringify(planData, null, 2) + "\n");
      console.log("[PLAN] Validator applied corrections to execution plan");
    }
  }

  // Fallback heuristic: warn about registry gaps the validator may have missed
  const workspaceRoot = join(dirs.workingDir, "..");
  const registryGaps = warnRegistryGaps(planData.stories, workspaceRoot, parsedModules.length > 0);

  // Auto-fix registry gaps: add missing registry files to suggested owner's sourceFiles
  const registryGapsFixed: Array<{ registryFile: string; storyId: string }> = [];
  if (registryGaps.length > 0) {
    for (const gap of registryGaps) {
      const ownerStory = stories.find(s => s.id === gap.suggestedOwner);
      if (!ownerStory) continue;

      const alreadyListed = ownerStory.sourceFiles.some(sf => {
        const path = typeof sf === "string" ? sf : sf.path;
        return path === gap.registryFile;
      });
      if (alreadyListed) continue;

      const changeType = fileExists(join(workspaceRoot, gap.registryFile)) ? "MODIFIED" : "ADDED";
      ownerStory.sourceFiles.push({ path: gap.registryFile, changeType });
      registryGapsFixed.push({ registryFile: gap.registryFile, storyId: gap.suggestedOwner });
      console.log(`[PLAN] Auto-fixed registry gap: added ${gap.registryFile} to ${gap.suggestedOwner} sourceFiles`);
    }
    // Re-save execution plan with patched sourceFiles
    planData.stories = stories;
    writeFileAtomic(planJsonPath, JSON.stringify(planData, null, 2) + "\n");
  }

  // Write story skeletons for ac/ec generators
  for (const story of stories) {
    writeStorySkeleton(stepsDir, story);
  }

  // AC-generator per story (parallel) — resume: skip stories with existing output
  const acConfigs: AgentConfig[] = stories.map((story) => ({
    type: "ac-generator" as const,
    model: "sonnet" as const,
    inputFiles: [join(stepsDir, `${story.id}-skeleton.md`), specPath],
    outputFile: join(stepsDir, `${story.id}-acs.md`),
    rules: getAgentRules("ac-generator"),
    memoryContent: feedbackMemory,
    constitutionContent,
  }));

  const pendingAcConfigs = acConfigs.filter(c => !outputReady(c.outputFile));
  agentsSkipped += acConfigs.length - pendingAcConfigs.length;

  if (pendingAcConfigs.length < acConfigs.length) {
    console.log(`[PLAN] Resuming: skipping ${acConfigs.length - pendingAcConfigs.length} AC-generator(s)`);
  }
  if (pendingAcConfigs.length > 0) {
    console.log(`Running ${pendingAcConfigs.length} AC-generators in parallel...`);
    const acResults = await spawnAgentsParallel(pendingAcConfigs, config);
    agentsRan += pendingAcConfigs.length;
    for (let i = 0; i < acResults.length; i++) {
      tracker?.recordAgentCost("PLAN", "ac-generator", acResults[i].costUsd, acResults[i].durationMs);
    }
  }

  // EC-generator per story (parallel) — resume: skip stories with existing output
  const ecConfigs: AgentConfig[] = stories.map((story) => ({
    type: "ec-generator" as const,
    model: "sonnet" as const,
    inputFiles: [join(stepsDir, `${story.id}-skeleton.md`), join(stepsDir, `${story.id}-acs.md`)],
    outputFile: join(stepsDir, `${story.id}-ecs.md`),
    rules: getAgentRules("ec-generator"),
    memoryContent: feedbackMemory,
    constitutionContent,
  }));

  const pendingEcConfigs = ecConfigs.filter(c => !outputReady(c.outputFile));
  agentsSkipped += ecConfigs.length - pendingEcConfigs.length;

  if (pendingEcConfigs.length < ecConfigs.length) {
    console.log(`[PLAN] Resuming: skipping ${ecConfigs.length - pendingEcConfigs.length} EC-generator(s)`);
  }
  if (pendingEcConfigs.length > 0) {
    console.log(`Running ${pendingEcConfigs.length} EC-generators in parallel...`);
    const ecResults = await spawnAgentsParallel(pendingEcConfigs, config);
    agentsRan += pendingEcConfigs.length;
    for (let i = 0; i < ecResults.length; i++) {
      tracker?.recordAgentCost("PLAN", "ec-generator", ecResults[i].costUsd, ecResults[i].durationMs);
    }
  }

  // Assembly: merge skeleton + ACs + ECs into final step files
  // Resume: skip assembly for stories already enriched (enricher appends sections we'd lose)
  console.log("Assembling step files...");
  for (const story of stories) {
    const stepPath = join(stepsDir, `${story.id}.md`);
    const existing = readFileSafe(stepPath);
    if (existing?.includes("## Implementation Guidance")) continue;
    assembleStepFile(
      stepsDir,
      story,
      join(stepsDir, `${story.id}-acs.md`),
      join(stepsDir, `${story.id}-ecs.md`),
    );
  }

  // Step 3b: Enricher — add Implementation Guidance / Security / Edge Cases per story
  console.log("Running enricher per story...");
  for (const story of stories) {
    const stepFilePath = join(stepsDir, `${story.id}.md`);

    // Resume: skip enricher if step file already contains enricher-appended sections
    const existingStepContent = readFileSafe(stepFilePath);
    if (existingStepContent?.includes("## Implementation Guidance")) {
      console.log(`[PLAN] Resuming: skipping enricher for ${story.id}`);
      agentsSkipped++;
      continue;
    }

    // Filter role-reports by rolesUsed
    const filteredRoleReports = roleReportPaths.filter((rp) =>
      story.rolesUsed.some((role) => rp.includes(`${role}-report.md`)),
    );

    if (filteredRoleReports.length === 0) continue;

    try {
      const enricherResult = await spawnAgentWithRetry({
        type: "enricher",
        model: "sonnet",
        inputFiles: [stepFilePath, ...filteredRoleReports],
        outputFile: stepFilePath,
        rules: getAgentRules("enricher"),
        memoryContent: feedbackMemory,
      }, config);
      tracker?.recordAgentCost("PLAN", "enricher", enricherResult.costUsd, enricherResult.durationMs);
      agentsRan++;

      // Validate step file still has required sections
      const enrichedContent = readFileSafe(stepFilePath);
      if (enrichedContent) {
        const hasAC = enrichedContent.includes("## ACCEPTANCE CRITERIA");
        const hasEC = enrichedContent.includes("## EXIT CRITERIA");
        if (!hasAC || !hasEC) {
          console.warn(`Warning: Enricher corrupted ${story.id} step file — missing sections. Reassembling.`);
          assembleStepFile(
            stepsDir,
            story,
            join(stepsDir, `${story.id}-acs.md`),
            join(stepsDir, `${story.id}-ecs.md`),
          );
        }
      }
    } catch (err) {
      console.warn(`Warning: Enricher failed for ${story.id}: ${err instanceof Error ? err.message : String(err)}. Keeping original step file.`);
    }
  }

  // Step 3c: Decomposer — break high-complexity stories into sub-tasks (FW-01)
  // Runs AFTER enrichment so decomposer can see the enriched step file
  const highComplexityStories = stories.filter((s) => s.complexity === "high");
  if (highComplexityStories.length > 0) {
    console.log(`Running decomposer for ${highComplexityStories.length} high-complexity stories...`);
    for (const story of highComplexityStories) {
      // Resume: skip decomposer if subtasks JSON already exists and is loadable
      const subtasksPath = join(stepsDir, `${story.id}-subtasks.json`);
      if (outputReady(subtasksPath)) {
        let loaded = false;
        const existingSubtasks = readFileSafe(subtasksPath);
        if (existingSubtasks) {
          try {
            const parsed = JSON.parse(existingSubtasks) as Record<string, unknown>;
            if (Array.isArray(parsed.subTasks) && parsed.subTasks.length > 0) {
              story.subTasks = (parsed.subTasks as Array<Record<string, unknown>>).map((st, i) => ({
                id: typeof st.id === "string" ? st.id : `${story.id}.${i + 1}`,
                title: typeof st.title === "string" ? st.title : `Sub-task ${i + 1}`,
                description: typeof st.description === "string" ? st.description : "",
                sourceFiles: Array.isArray(st.sourceFiles) ? st.sourceFiles as string[] : [],
                status: "not-started" as const,
                attempts: 0,
                maxAttempts: story.maxAttempts,
              }));
              console.log(`[PLAN] Resuming: skipping decomposer for ${story.id} (${story.subTasks.length} sub-tasks loaded)`);
              loaded = true;
            }
          } catch {
            console.debug(`[PLAN] Could not parse existing subtasks for ${story.id}, re-running decomposer`);
          }
        }
        if (loaded) {
          agentsSkipped++;
          continue;
        }
      }

      const subTasks = await decomposeStory(story, stepsDir, feedbackMemory, config, tracker);
      agentsRan++;
      if (subTasks.length > 0) {
        story.subTasks = subTasks;
        console.log(`  ${story.id}: decomposed into ${subTasks.length} sub-tasks`);
      }
    }
    // Persist sub-tasks into execution-plan.json
    planData.stories = stories;
    writeFileAtomic(planJsonPath, JSON.stringify(planData, null, 2) + "\n");
  }

  // Step 4: AC consolidator
  const acPath = join(plansDir, "acceptance-criteria.md");

  if (!outputReady(acPath)) {
    console.log("Running AC consolidator...");
    const synthResult = await spawnAgentWithRetry({
      type: "synthesizer",
      model: "opus",
      inputFiles: [stepsDir],
      outputFile: acPath,
      rules: [
        "CONSOLIDATE: Collect all ACs and ECs from step files into one acceptance-criteria.md document.",
      ],
      memoryContent: feedbackMemory,
    }, config);
    tracker?.recordAgentCost("PLAN", "synthesizer", synthResult.costUsd, synthResult.durationMs);
    agentsRan++;
  } else {
    console.log("[PLAN] Resuming: skipping AC consolidator");
    agentsSkipped++;
  }

  if (agentsSkipped > 0) {
    console.log(`[PLAN] Complete. Ran ${agentsRan} agent(s), skipped ${agentsSkipped} (resume).`);
  } else {
    console.log("PLAN stage complete.");
  }
  return { registryGapsFixed };
}

export function writeStorySkeleton(stepsDir: string, story: Story): void {
  const filePaths = getSourceFilePaths(story.sourceFiles);
  // Format source files with changeType when available
  const formatSourceFile = (f: string | { path: string; changeType: string }): string => {
    if (typeof f === "string") return `- ${f}`;
    return `- ${f.path} (${f.changeType})`;
  };
  const sourceFileLines = story.sourceFiles.map(formatSourceFile).join("\n") || "- (none)";

  const skeleton = `# ${story.id}: ${story.title}

## GOAL
Implement ${story.title} as specified.

## SPEC REFERENCES
${story.specSections.map((s) => `- ${s}`).join("\n")}

## INPUT
${sourceFileLines}

## OUTPUT
${filePaths.map((f) => `- ${f}`).join("\n") || "- (TBD)"}

## METADATA
- Complexity: ${story.complexity}
- Dependencies: ${story.dependencies.length > 0 ? story.dependencies.join(", ") : "none"}
- Roles Used: ${story.rolesUsed.join(", ")}
${story.securityRisk ? `- Security Risk: ${story.securityRisk}` : ""}
${story.complexityJustification ? `- Complexity Justification: ${story.complexityJustification}` : ""}
${story.dependencyImpact ? `- Dependency Impact: ${story.dependencyImpact}` : ""}
`;
  writeFileAtomic(join(stepsDir, `${story.id}-skeleton.md`), skeleton);
}

/**
 * FW-01: Decompose a high-complexity story into sub-tasks.
 * Non-fatal (P39): if decomposer crashes or returns unparseable output, returns [].
 * Decomposer output contract: { subTasks: [{ id, title, description, sourceFiles }] }
 */
async function decomposeStory(
  story: Story,
  stepsDir: string,
  memoryContent: string,
  config: HiveMindConfig,
  tracker?: CostTracker,
): Promise<SubTask[]> {
  // Decompose all high-complexity stories regardless of file count.
  // Dogfood finding: planner always creates 1-file stories, so the old 3-file gate was dead code.
  if (story.sourceFiles.length === 0) return [];

  const stepFilePath = join(stepsDir, `${story.id}.md`);
  const outputPath = join(stepsDir, `${story.id}-subtasks.json`);

  try {
    const decomposerResult = await spawnAgentWithRetry({
      type: "decomposer",
      model: "sonnet",
      inputFiles: [stepFilePath],
      outputFile: outputPath,
      rules: getAgentRules("decomposer"),
      memoryContent,
    }, config);
    tracker?.recordAgentCost("PLAN", "decomposer", decomposerResult.costUsd, decomposerResult.durationMs);

    const content = readFileSafe(outputPath);
    if (!content) {
      console.warn(`[${story.id}] Decomposer produced no output — skipping decomposition (P39)`);
      return [];
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn(`[${story.id}] Decomposer output is not valid JSON — skipping decomposition (P44)`);
      return [];
    }

    // Validate output contract: { subTasks: [...] }
    const rawSubTasks = parsed.subTasks;
    if (!Array.isArray(rawSubTasks)) {
      console.warn(`[${story.id}] Decomposer output missing subTasks array — skipping decomposition (P44)`);
      return [];
    }

    if (rawSubTasks.length === 0) return [];

    // Validate and normalize sub-tasks
    const subTasks: SubTask[] = rawSubTasks.map((st: Record<string, unknown>, i: number) => ({
      id: typeof st.id === "string" ? st.id : `${story.id}.${i + 1}`,
      title: typeof st.title === "string" ? st.title : `Sub-task ${i + 1}`,
      description: typeof st.description === "string" ? st.description : "",
      sourceFiles: Array.isArray(st.sourceFiles) ? st.sourceFiles as string[] : [],
      status: "not-started" as const,
      attempts: 0,
      maxAttempts: story.maxAttempts,
    }));

    return subTasks;
  } catch (err) {
    console.warn(`[${story.id}] Decomposer crashed — skipping decomposition (P39): ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export function assembleStepFile(
  stepsDir: string,
  story: Story,
  acsPath: string,
  ecsPath: string,
): void {
  const acsContent = readFileSafe(acsPath) ?? "*(AC generation failed)*";
  const ecsContent = readFileSafe(ecsPath) ?? "*(EC generation failed)*";

  const filePaths = getSourceFilePaths(story.sourceFiles);
  const formatSourceFile = (f: string | { path: string; changeType: string }): string => {
    if (typeof f === "string") return `- ${f}`;
    return `- ${f.path} (${f.changeType})`;
  };
  const sourceFileLines = story.sourceFiles.map(formatSourceFile).join("\n") || "- (none)";

  const stepFile = `# ${story.id}: ${story.title}

## GOAL
Implement ${story.title} as specified.

## SPEC REFERENCES
${story.specSections.map((s) => `- ${s}`).join("\n")}

## INPUT
${sourceFileLines}

## OUTPUT
${filePaths.map((f) => `- ${f}`).join("\n") || "- (TBD)"}

## ACCEPTANCE CRITERIA
${acsContent}

## EXIT CRITERIA
${ecsContent}
`;

  const stepFilePath = join(stepsDir, `${story.id}.md`);
  writeFileAtomic(stepFilePath, stepFile);
}

export function extractCorrectedPlan(report: string): { stories: Story[] } | null {
  const jsonMatch = report.match(/```json\n([\s\S]*?)\n```/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
    if (parsed.schemaVersion === "2.0.0" && Array.isArray(parsed.stories)) {
      return parsed as unknown as { stories: Story[] };
    }
  } catch {
    console.warn("[PLAN] Validator output contained invalid JSON — skipping corrections");
  }
  return null;
}

export interface RegistryGap {
  registryFile: string;
  addingStories: string[];
  suggestedOwner: string;
}

export function warnRegistryGaps(stories: Story[], workspaceRoot: string, hasModules: boolean): RegistryGap[] {
  if (hasModules) return [];

  const addedDirs = new Map<string, string[]>();
  const modifiedFiles = new Set<string>();

  for (const story of stories) {
    for (const sf of story.sourceFiles) {
      const entry = typeof sf === "string" ? { path: sf, changeType: "MODIFIED" as const } : sf;
      const dir = entry.path.substring(0, entry.path.lastIndexOf("/"));
      if (entry.changeType === "ADDED" && dir) {
        const list = addedDirs.get(dir) ?? [];
        list.push(story.id);
        addedDirs.set(dir, list);
      }
      if (entry.changeType === "MODIFIED") {
        modifiedFiles.add(entry.path);
      }
    }
  }

  const gaps: RegistryGap[] = [];
  const REGISTRY_NAMES = ["index.ts", "index.js", "registry.ts", "mod.ts"];
  for (const [dir, storyIds] of addedDirs) {
    for (const name of REGISTRY_NAMES) {
      const registryPath = `${dir}/${name}`;
      if (fileExists(join(workspaceRoot, registryPath)) && !modifiedFiles.has(registryPath)) {
        console.warn(
          `[PLAN] Registry gap: stories ${storyIds.join(", ")} add files to ${dir}/ ` +
          `but no story modifies ${registryPath}`,
        );
        gaps.push({
          registryFile: registryPath,
          addingStories: storyIds,
          suggestedOwner: storyIds[storyIds.length - 1],
        });
      }
    }
  }

  return gaps;
}
