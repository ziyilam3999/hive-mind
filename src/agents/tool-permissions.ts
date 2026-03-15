import type { AgentType } from "../types/agents.js";

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];
const OUTPUT_TOOLS = [...READ_ONLY_TOOLS, "Write"];
const DEV_TOOLS = [...READ_ONLY_TOOLS, "Write", "Edit", "Bash"];
const SHELL_ONLY_TOOLS = [...READ_ONLY_TOOLS, "Bash", "Write"];

const AGENT_TOOL_MAP: Record<AgentType, string[]> = {
  // SPEC stage — read + write output file
  "researcher": OUTPUT_TOOLS,
  "justifier": OUTPUT_TOOLS,
  "spec-drafter": OUTPUT_TOOLS,
  "critic": OUTPUT_TOOLS,
  "spec-corrector": OUTPUT_TOOLS,

  // PLAN stage — read + write output file
  "analyst": OUTPUT_TOOLS,
  "reviewer": OUTPUT_TOOLS,
  "security": OUTPUT_TOOLS,
  "architect": OUTPUT_TOOLS,
  "tester-role": OUTPUT_TOOLS,
  "synthesizer": OUTPUT_TOOLS,

  // EXECUTE stage — build (full dev tools)
  "implementer": DEV_TOOLS,
  "refactorer": DEV_TOOLS,

  // EXECUTE stage — verify (shell for running tests + write report)
  "tester-exec": SHELL_ONLY_TOOLS,
  "evaluator": SHELL_ONLY_TOOLS,

  // EXECUTE stage — fix (full dev tools)
  "diagnostician": OUTPUT_TOOLS,
  "fixer": DEV_TOOLS,

  // EXECUTE stage — learn (read + write output)
  "learner": OUTPUT_TOOLS,

  // REPORT stage — read + write output
  "reporter": OUTPUT_TOOLS,
  "retrospective": OUTPUT_TOOLS,

  // Tooling setup (needs shell to install tools)
  "tooling-setup": SHELL_ONLY_TOOLS,

  // Phase 4 — pipeline quality agents (read + write output)
  "planner": OUTPUT_TOOLS,
  "ac-generator": OUTPUT_TOOLS,
  "ec-generator": OUTPUT_TOOLS,
  "code-reviewer": OUTPUT_TOOLS,
  "log-summarizer": OUTPUT_TOOLS,
  "enricher": OUTPUT_TOOLS,

  // Phase 5 — compliance agents
  "compliance-reviewer": OUTPUT_TOOLS,
  "compliance-fixer": DEV_TOOLS,

  // Phase 5 — decomposer (FW-01)
  "decomposer": OUTPUT_TOOLS,

  // Phase 6 — integration verification (multi-repo)
  "integration-verifier": OUTPUT_TOOLS,
};

export function getToolsForAgent(agentType: AgentType): string[] {
  return AGENT_TOOL_MAP[agentType];
}
