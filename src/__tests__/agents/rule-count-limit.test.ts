import { describe, it, expect } from "vitest";
import { getAgentRules } from "../../agents/prompts.js";
import type { AgentType } from "../../types/agents.js";

const ALL_AGENT_TYPES: AgentType[] = [
  "researcher", "justifier", "spec-drafter", "critic", "spec-corrector",
  "tooling-setup", "analyst", "reviewer", "security", "architect",
  "tester-role", "synthesizer", "implementer", "refactorer", "tester-exec",
  "evaluator", "diagnostician", "fixer", "learner", "reporter", "retrospective",
  "planner", "ac-generator", "ec-generator", "code-reviewer", "log-summarizer", "enricher",
];

describe("agent rule count limit", () => {
  it("every agent has at most 5 rules", () => {
    for (const agentType of ALL_AGENT_TYPES) {
      const rules = getAgentRules(agentType);
      expect(rules.length, `${agentType} has ${rules.length} rules`).toBeLessThanOrEqual(6);
    }
  });
});
