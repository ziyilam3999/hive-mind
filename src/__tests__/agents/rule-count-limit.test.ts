import { describe, it, expect } from "vitest";
import { getAgentRules } from "../../agents/prompts.js";
import type { AgentType } from "../../types/agents.js";

const ALL_AGENT_TYPES: AgentType[] = [
  "researcher", "spec-drafter", "critic", "spec-corrector",
  "tooling-setup", "analyst", "reviewer", "security", "architect",
  "tester-role", "synthesizer", "implementer", "refactorer", "tester-exec",
  "evaluator", "diagnostician", "fixer", "learner", "reporter", "retrospective",
  "planner", "ac-generator", "ec-generator", "code-reviewer", "log-summarizer", "enricher",
  "compliance-reviewer", "compliance-fixer", "decomposer", "integration-verifier",
  "diagnostician-bug", "workspace-cleanup", "normalizer", "relevance-scanner",
  "codebase-analyzer", "feature-spec-drafter", "reconciler", "scorecard",
  "plan-validator",
];

describe("agent rule count limit", () => {
  it("every agent has at most 5 rules", () => {
    for (const agentType of ALL_AGENT_TYPES) {
      const rules = getAgentRules(agentType);
      expect(rules.length, `${agentType} has ${rules.length} rules`).toBeLessThanOrEqual(5);
    }
  });

  it("reporter rules include SOURCE-OF-TRUTH for execution-plan authority", () => {
    const rules = getAgentRules("reporter");
    const sotRule = rules.find((r) => r.includes("SOURCE-OF-TRUTH"));
    expect(sotRule).toBeDefined();
    expect(sotRule).toContain("execution-plan.json");
  });
});
