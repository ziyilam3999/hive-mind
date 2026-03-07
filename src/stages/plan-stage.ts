import type { AgentConfig } from "../types/agents.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, ensureDir, fileExists } from "../utils/file-io.js";
import { join } from "node:path";

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

  // Step 2: Spawn role agents (independent subagents)
  const roleReportPaths: string[] = [];
  for (const role of activeRoles) {
    const agentType = role as AgentConfig["type"];
    const reportPath = join(roleReportsDir, `${role}-report.md`);
    console.log(`Spawning role agent: ${role}...`);

    const result = await spawnAgentWithRetry({
      type: agentType,
      model: role === "analyst" || role === "architect" ? "opus" : "sonnet",
      inputFiles: [specPath],
      outputFile: reportPath,
      rules: getAgentRules(agentType),
      memoryContent: feedbackMemory,
    });

    if (result.success) {
      roleReportPaths.push(reportPath);
    } else {
      console.warn(`Warning: Role agent ${role} failed. Omitting report.`);
    }
  }

  // Step 3: Synthesizer — Phase A: Planner (produces execution-plan.json)
  console.log("Running synthesizer planner...");
  const planJsonPath = join(plansDir, "execution-plan.json");
  await spawnAgentWithRetry({
    type: "synthesizer",
    model: "opus",
    inputFiles: [specPath, ...roleReportPaths],
    outputFile: planJsonPath,
    rules: getAgentRules("synthesizer"),
    memoryContent: feedbackMemory,
  });

  if (!fileExists(planJsonPath)) {
    throw new Error("Synthesizer failed to produce execution-plan.json");
  }

  // Step 4: Synthesizer — Phase B: Step writers (produce step files)
  console.log("Running step writer agents...");
  await spawnAgentWithRetry({
    type: "synthesizer",
    model: "opus",
    inputFiles: [planJsonPath, specPath, ...roleReportPaths],
    outputFile: join(stepsDir, ".done"),
    rules: [
      ...getAgentRules("synthesizer"),
      `STEP-FILES: Write one step file per story in ${stepsDir}/. Each step file must be self-contained with SPEC REFERENCES, ACs (AC-0 is always lint), ECs, INPUT, OUTPUT with exact exports.`,
    ],
    memoryContent: feedbackMemory,
  });

  // Step 5: Synthesizer — Phase C: AC consolidator
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
  });

  console.log("PLAN stage complete.");
}
