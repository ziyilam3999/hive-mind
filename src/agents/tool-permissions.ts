import type { AgentType } from "../types/agents.js";

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];
const DEV_TOOLS = [...READ_ONLY_TOOLS, "Write", "Edit", "Bash"];
const SHELL_ONLY_TOOLS = [...READ_ONLY_TOOLS, "Bash"];

const AGENT_TOOL_MAP: Record<AgentType, string[]> = {
  // SPEC stage — research and analysis (read-only)
  "researcher": READ_ONLY_TOOLS,
  "justifier": READ_ONLY_TOOLS,
  "spec-drafter": READ_ONLY_TOOLS,
  "critic": READ_ONLY_TOOLS,
  "spec-corrector": READ_ONLY_TOOLS,

  // PLAN stage — analysis roles (read-only)
  "analyst": READ_ONLY_TOOLS,
  "reviewer": READ_ONLY_TOOLS,
  "security": READ_ONLY_TOOLS,
  "architect": READ_ONLY_TOOLS,
  "tester-role": READ_ONLY_TOOLS,
  "synthesizer": READ_ONLY_TOOLS,

  // EXECUTE stage — build (full dev tools)
  "implementer": DEV_TOOLS,
  "refactorer": DEV_TOOLS,

  // EXECUTE stage — verify (shell for running tests)
  "tester-exec": SHELL_ONLY_TOOLS,
  "evaluator": SHELL_ONLY_TOOLS,

  // EXECUTE stage — fix (full dev tools)
  "diagnostician": READ_ONLY_TOOLS,
  "fixer": DEV_TOOLS,

  // EXECUTE stage — learn (read-only)
  "learner": READ_ONLY_TOOLS,

  // REPORT stage
  "reporter": READ_ONLY_TOOLS,
  "retrospective": READ_ONLY_TOOLS,

  // Tooling setup (needs shell to install tools)
  "tooling-setup": SHELL_ONLY_TOOLS,
};

export function getToolsForAgent(agentType: AgentType): string[] {
  return AGENT_TOOL_MAP[agentType];
}
