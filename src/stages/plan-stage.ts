import type { AgentConfig } from "../types/agents.js";
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

  // Step 3: Synthesizer — produces execution-plan.json with embedded step content
  console.log("Running synthesizer...");
  const planJsonPath = join(plansDir, "execution-plan.json");

  const EXECUTION_PLAN_SCHEMA = `Output ONLY valid JSON (no markdown fences). Required schema:
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
      "rolesUsed": ["analyst"],
      "stepFile": "plans/steps/US-01.md",
      "stepContent": "Full step file content as markdown with ## SPEC REFERENCES, ## ACCEPTANCE CRITERIA (AC-0 is always lint+typecheck), ## EXIT CRITERIA (binary shell commands that echo PASS/FAIL), ## INPUT, ## OUTPUT (exact exports)",
      "status": "not-started",
      "attempts": 0,
      "maxAttempts": ${config.maxAttempts},
      "committed": false,
      "commitHash": null
    }
  ]
}
CRITICAL: schemaVersion MUST be exactly "2.0.0". Every story MUST have all fields listed above. stepContent must be self-contained (P16).`;

  await spawnAgentWithRetry({
    type: "synthesizer",
    model: "opus",
    inputFiles: [specPath, ...roleReportPaths],
    outputFile: planJsonPath,
    rules: [EXECUTION_PLAN_SCHEMA],
    memoryContent: feedbackMemory,
  }, config);

  if (!fileExists(planJsonPath)) {
    throw new Error("Synthesizer failed to produce execution-plan.json");
  }

  // Extract step files from embedded stepContent
  extractStepFiles(planJsonPath, stepsDir);

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
