import type { AgentConfig } from "../types/agents.js";
import type { Story, SubTask } from "../types/execution-plan.js";
import { spawnAgentWithRetry, spawnAgentsParallel } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, writeFileAtomic, ensureDir, fileExists } from "../utils/file-io.js";
import type { HiveMindConfig } from "../config/schema.js";
import { join } from "node:path";

function extractStepFiles(planJsonPath: string, stepsDir: string): void {
  const content = readFileSafe(planJsonPath);
  if (!content) return;

  let plan: Record<string, unknown>;
  try {
    plan = JSON.parse(content);
  } catch {
    console.warn("Warning: execution-plan.json is not valid JSON, skipping step extraction.");
    return;
  }

  const stories = plan.stories as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(stories)) return;

  for (const story of stories) {
    if (typeof story.stepContent === "string" && typeof story.stepFile === "string") {
      const stepPath = join(stepsDir, "..", "..", story.stepFile as string);
      ensureDir(stepsDir);
      writeFileAtomic(stepPath, story.stepContent);
    }
  }

  // Remove stepContent from the plan file to keep it clean
  const cleanStories = stories.map((s) => {
    const { stepContent, ...rest } = s;
    return rest;
  });
  plan.stories = cleanStories;
  writeFileAtomic(planJsonPath, JSON.stringify(plan, null, 2) + "\n");
}

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

export async function runPlanStage(
  hiveMindDir: string,
  config: HiveMindConfig,
  feedback?: string,
): Promise<void> {
  const plansDir = join(hiveMindDir, "plans");
  const roleReportsDir = join(plansDir, "role-reports");
  const stepsDir = join(plansDir, "steps");
  ensureDir(plansDir);
  ensureDir(roleReportsDir);
  ensureDir(stepsDir);

  const memoryPath = join(hiveMindDir, "memory.md");
  const memoryContent = readMemory(memoryPath);
  const feedbackMemory = feedback
    ? `${memoryContent}\n\n## HUMAN FEEDBACK (from rejection)\n${feedback}`
    : memoryContent;

  // Load SPEC
  const specPath = join(hiveMindDir, "spec", "SPEC-v1.0.md");
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
    };
  });

  console.log(`Spawning ${roleConfigs.length} role agents in parallel...`);
  const roleResults = await spawnAgentsParallel(roleConfigs, config);

  const roleReportPaths: string[] = [];
  for (let i = 0; i < roleResults.length; i++) {
    if (roleResults[i].success) {
      roleReportPaths.push(roleConfigs[i].outputFile);
    } else {
      console.warn(`Warning: Role agent ${activeRoles[i]} failed. Omitting report.`);
    }
  }

  // Step 3: Planner → AC-gen → EC-gen pipeline (replaces single synthesizer)
  console.log("Running planner...");
  const planJsonPath = join(plansDir, "execution-plan.json");

  // Detect multi-module from SPEC's ## Modules section
  const hasModules = specContent.includes("## Modules");
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
      "sourceFiles": ["src/file.ts"],
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
CRITICAL: schemaVersion MUST be exactly "2.0.0". Every story MUST have all fields listed above. Do NOT include stepContent or ACs/ECs — produce skeletons only (GOAL, SPEC REFS, INPUT, OUTPUT).${moduleIdInstruction}`;

  await spawnAgentWithRetry({
    type: "planner",
    model: "opus",
    inputFiles: [specPath, ...roleReportPaths],
    outputFile: planJsonPath,
    rules: [...getAgentRules("planner"), PLANNER_SCHEMA],
    memoryContent: feedbackMemory,
  }, config);

  if (!fileExists(planJsonPath)) {
    throw new Error("Planner failed to produce execution-plan.json");
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

  const stories = planData.stories;
  if (!Array.isArray(stories) || stories.length === 0) {
    throw new Error("execution-plan.json contains no stories");
  }

  // Write story skeletons for ac/ec generators
  for (const story of stories) {
    writeStorySkeleton(stepsDir, story);
  }

  // AC-generator per story (parallel)
  console.log(`Running ${stories.length} AC-generators in parallel...`);
  const acConfigs: AgentConfig[] = stories.map((story) => ({
    type: "ac-generator" as const,
    model: "sonnet" as const,
    inputFiles: [join(stepsDir, `${story.id}-skeleton.md`), specPath],
    outputFile: join(stepsDir, `${story.id}-acs.md`),
    rules: getAgentRules("ac-generator"),
    memoryContent: feedbackMemory,
  }));

  await spawnAgentsParallel(acConfigs, config);

  // EC-generator per story (parallel)
  console.log(`Running ${stories.length} EC-generators in parallel...`);
  const ecConfigs: AgentConfig[] = stories.map((story) => ({
    type: "ec-generator" as const,
    model: "sonnet" as const,
    inputFiles: [join(stepsDir, `${story.id}-skeleton.md`), join(stepsDir, `${story.id}-acs.md`)],
    outputFile: join(stepsDir, `${story.id}-ecs.md`),
    rules: getAgentRules("ec-generator"),
    memoryContent: feedbackMemory,
  }));

  await spawnAgentsParallel(ecConfigs, config);

  // Assembly: merge skeleton + ACs + ECs into final step files
  console.log("Assembling step files...");
  for (const story of stories) {
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
    // Filter role-reports by rolesUsed
    const filteredRoleReports = roleReportPaths.filter((rp) =>
      story.rolesUsed.some((role) => rp.includes(`${role}-report.md`)),
    );

    if (filteredRoleReports.length === 0) continue;

    try {
      await spawnAgentWithRetry({
        type: "enricher",
        model: "sonnet",
        inputFiles: [stepFilePath, ...filteredRoleReports],
        outputFile: stepFilePath,
        rules: getAgentRules("enricher"),
        memoryContent: feedbackMemory,
      }, config);

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
      const subTasks = await decomposeStory(story, stepsDir, feedbackMemory, config);
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
  console.log("Running AC consolidator...");
  const acPath = join(plansDir, "acceptance-criteria.md");
  await spawnAgentWithRetry({
    type: "synthesizer",
    model: "opus",
    inputFiles: [stepsDir],
    outputFile: acPath,
    rules: [
      "CONSOLIDATE: Collect all ACs and ECs from step files into one acceptance-criteria.md document.",
    ],
    memoryContent: feedbackMemory,
  }, config);

  console.log("PLAN stage complete.");
}

export function writeStorySkeleton(stepsDir: string, story: Story): void {
  const skeleton = `# ${story.id}: ${story.title}

## GOAL
Implement ${story.title} as specified.

## SPEC REFERENCES
${story.specSections.map((s) => `- ${s}`).join("\n")}

## INPUT
${story.sourceFiles.map((f) => `- ${f}`).join("\n") || "- (none)"}

## OUTPUT
${story.sourceFiles.map((f) => `- ${f}`).join("\n") || "- (TBD)"}

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
): Promise<SubTask[]> {
  // Decompose all high-complexity stories regardless of file count.
  // Dogfood finding: planner always creates 1-file stories, so the old 3-file gate was dead code.
  if (story.sourceFiles.length === 0) return [];

  const stepFilePath = join(stepsDir, `${story.id}.md`);
  const outputPath = join(stepsDir, `${story.id}-subtasks.json`);

  try {
    await spawnAgentWithRetry({
      type: "decomposer",
      model: "sonnet",
      inputFiles: [stepFilePath],
      outputFile: outputPath,
      rules: getAgentRules("decomposer"),
      memoryContent,
    }, config);

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

  const stepFile = `# ${story.id}: ${story.title}

## GOAL
Implement ${story.title} as specified.

## SPEC REFERENCES
${story.specSections.map((s) => `- ${s}`).join("\n")}

## INPUT
${story.sourceFiles.map((f) => `- ${f}`).join("\n") || "- (none)"}

## OUTPUT
${story.sourceFiles.map((f) => `- ${f}`).join("\n") || "- (TBD)"}

## ACCEPTANCE CRITERIA
${acsContent}

## EXIT CRITERIA
${ecsContent}
`;

  const stepFilePath = join(stepsDir, `${story.id}.md`);
  writeFileAtomic(stepFilePath, stepFile);
}
