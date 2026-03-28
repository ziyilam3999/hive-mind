import type { AgentType, AgentConfig } from "../types/agents.js";
import type { RoleName } from "../types/execution-plan.js";
import { readFileSafe, fileExists } from "../utils/file-io.js";
import { join } from "node:path";
import { AGENT_JOBS, AGENT_RULES } from "./registry.js";

const ELI5_AGENTS: Set<AgentType> = new Set([
  "reporter", "retrospective", "diagnostician",
  "spec-drafter", "spec-corrector", "critic",
  "feature-spec-drafter",
  "scorecard",
]);

/** Agents that produce status reports (PASS/FAIL) — get structured output instruction */
const STATUS_AGENTS: Set<AgentType> = new Set([
  "tester-exec", "evaluator", "implementer", "fixer", "compliance-reviewer", "compliance-fixer",
]);

/** Agents that may create temporary helper scripts — get scratch directory instruction */
const SCRATCH_AGENTS: Set<AgentType> = new Set([
  "tester-exec", "evaluator",
]);

/** Agents that produce raw JSON output — do NOT add sentinel (breaks JSON parsing) */
const JSON_OUTPUT_AGENTS: Set<AgentType> = new Set([
  "planner", "decomposer",
]);

// AGENT_JOBS and AGENT_RULES are now derived from the central AGENT_REGISTRY.
// Re-exported here for backward compatibility — see ./registry.ts for the source of truth.

export const ROLE_REPORT_MAPPING: Partial<Record<AgentType, AgentType[]>> = {
  "implementer": ["architect", "security", "analyst"],
  "tester-exec": ["tester-role", "analyst", "security"],
  "diagnostician": ["architect", "security", "tester-role"],
  "refactorer": ["architect", "reviewer"],
  "learner": ["architect", "security", "analyst", "reviewer", "tester-role"],
};

export function getRoleReportsForAgent(
  agentType: AgentType,
  rolesUsed: AgentType[],
): AgentType[] {
  const mapping = ROLE_REPORT_MAPPING[agentType];
  if (!mapping) return [];
  const rolesSet = new Set(rolesUsed);
  return mapping.filter((role) => rolesSet.has(role));
}

export function getAgentRules(agentType: AgentType): string[] {
  return AGENT_RULES[agentType] ?? [];
}

export function buildPrompt(config: AgentConfig): string {
  // Normalize Windows backslash paths to forward slashes for Claude CLI (bash context).
  // Without this, agents strip backslashes and create garbled directory names (K13/K14).
  const toSlash = (p: string): string => p.replace(/\\/g, "/");

  const job = AGENT_JOBS[config.type] ?? config.type;
  const rules = config.rules.length > 0 ? config.rules : getAgentRules(config.type);
  const rulesBlock = rules.length > 0
    ? rules.map((r, i) => `- RULE-${i + 1}: ${r}`).join("\n")
    : "- (none)";

  let inputFiles = config.inputFiles;
  if (config.type === "critic") {
    inputFiles = inputFiles.filter(
      (f) => !f.includes("research-report") && !f.includes("justification"),
    );
  }
  const inputBlock = inputFiles.map((f) => `- ${toSlash(f)}`).join("\n");

  return `## ROLE
You are the ${config.type} agent. Your job: ${job}.

## RULES (max 5 Tier 1 rules)
${rulesBlock}

## INPUT
${inputBlock}

## OUTPUT (MANDATORY)
You MUST use the Write tool to create this file: ${toSlash(config.outputFile)}
This is not optional — if this file does not exist when you finish, you will be marked as FAILED.
If you also need to create source code files, use the Write tool for those too.
${ELI5_AGENTS.has(config.type) ? `
## ELI5 REQUIREMENT
For each major section or finding, include a blockquote explanation in plain language:
> **ELI5:** [analogy a non-programmer can understand]
Use everyday analogies (factory workers, recipe books, filing cabinets). Avoid jargon. The ELI5 explains WHY this matters, not just WHAT it is.` : ""}

${STATUS_AGENTS.has(config.type) ? `## STATUS BLOCK (REQUIRED)
Place this HTML comment in the FIRST 200 characters of your output file:
<!-- STATUS: {"result": "PASS"} -->
or
<!-- STATUS: {"result": "FAIL", "details": "brief reason"} -->
This must be a valid JSON object inside an HTML comment. "result" is "PASS" or "FAIL". "details" is optional.
This block is parsed mechanically — do NOT omit it, do NOT alter the format.
` : ""}${SCRATCH_AGENTS.has(config.type) && config.scratchDir ? `## SCRATCH DIRECTORY
Write any helper scripts or temporary files here: ${toSlash(config.scratchDir)}
Do NOT create .ts/.js files in the workspace root. The scratch directory already exists.
` : ""}${config.constitutionContent ? `## PROJECT CONSTITUTION
The following project conventions and standards apply to all work:
${config.constitutionContent}
` : ""}${config.roleReportContents ? `## ROLE REPORTS
The following role-report excerpts are relevant to your task:
${config.roleReportContents}
` : ""}${config.instructionBlocks?.length ? config.instructionBlocks.map((b) => `## ${b.heading}\n${b.content}\n`).join("\n") : ""}${!JSON_OUTPUT_AGENTS.has(config.type) ? `## OUTPUT SENTINEL
End your output file with the exact string \`<!-- HM-END -->\` as the very last line (after all content). This sentinel is checked mechanically to detect truncation.

` : ""}## MEMORY
${config.memoryContent}`;
}

const MAX_ROLE_REPORT_WORDS = 2000;

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "\n...(truncated)";
}

export function buildRoleReportContents(
  agentType: AgentType,
  rolesUsed: RoleName[],
  roleReportsDir: string,
): string | undefined {
  if (!fileExists(roleReportsDir)) return undefined;

  const relevantRoles = getRoleReportsForAgent(agentType, rolesUsed as AgentType[]);
  if (relevantRoles.length === 0) return undefined;

  const parts: string[] = [];
  for (const role of relevantRoles) {
    const reportPath = join(roleReportsDir, `${role}-report.md`);
    const content = readFileSafe(reportPath);
    if (content) {
      parts.push(`### ${role} report\n${truncateToWords(content, MAX_ROLE_REPORT_WORDS)}`);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
