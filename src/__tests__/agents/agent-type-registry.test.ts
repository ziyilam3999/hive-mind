import { describe, it, expect } from "vitest";
import { AGENT_MODEL_MAP } from "../../agents/model-map.js";
import { getAgentRules } from "../../agents/prompts.js";
import { DEFAULT_MODEL_ASSIGNMENTS } from "../../config/schema.js";
import type { AgentType } from "../../types/agents.js";

// Access AGENT_JOBS indirectly via buildPrompt — jobs are not exported directly,
// but we can verify via the prompt output containing the job description.
import { buildPrompt } from "../../agents/prompts.js";

const NEW_AGENT_TYPES: AgentType[] = [
  "planner", "ac-generator", "ec-generator",
  "code-reviewer", "log-summarizer", "enricher",
];

const EXPECTED_MODELS: Record<string, string> = {
  "planner": "opus",
  "ac-generator": "sonnet",
  "ec-generator": "sonnet",
  "code-reviewer": "sonnet",
  "log-summarizer": "haiku",
  "enricher": "sonnet",
};

describe("Phase 4 agent type registry", () => {
  it("all 6 new types exist in AGENT_MODEL_MAP", () => {
    for (const agentType of NEW_AGENT_TYPES) {
      expect(AGENT_MODEL_MAP[agentType], `${agentType} missing from AGENT_MODEL_MAP`).toBeDefined();
    }
  });

  it("all 6 new types have correct model assignments", () => {
    for (const agentType of NEW_AGENT_TYPES) {
      expect(AGENT_MODEL_MAP[agentType], `${agentType} model`).toBe(EXPECTED_MODELS[agentType]);
    }
  });

  it("all 6 new types exist in DEFAULT_MODEL_ASSIGNMENTS", () => {
    for (const agentType of NEW_AGENT_TYPES) {
      expect(DEFAULT_MODEL_ASSIGNMENTS[agentType], `${agentType} missing from DEFAULT_MODEL_ASSIGNMENTS`).toBeDefined();
    }
  });

  it("all 6 new types have AGENT_JOBS entries (non-empty prompt)", () => {
    for (const agentType of NEW_AGENT_TYPES) {
      const prompt = buildPrompt({
        type: agentType,
        model: EXPECTED_MODELS[agentType] as "opus" | "sonnet" | "haiku",
        inputFiles: ["test-input.md"],
        outputFile: "test-output.md",
        rules: [],
        memoryContent: "",
      });
      expect(prompt, `${agentType} prompt should contain agent type`).toContain(agentType);
      // Job description should be more than just the type name
      expect(prompt.length, `${agentType} prompt too short`).toBeGreaterThan(100);
    }
  });

  it("all 6 new types have AGENT_RULES entries", () => {
    for (const agentType of NEW_AGENT_TYPES) {
      const rules = getAgentRules(agentType);
      expect(rules.length, `${agentType} should have rules`).toBeGreaterThan(0);
      expect(rules.length, `${agentType} has too many rules`).toBeLessThanOrEqual(5);
    }
  });
});
