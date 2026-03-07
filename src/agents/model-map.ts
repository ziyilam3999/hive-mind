import type { AgentType, ModelTier } from "../types/agents.js";

export const AGENT_MODEL_MAP: Record<AgentType, ModelTier> = {
  "researcher": "opus",
  "justifier": "opus",
  "spec-drafter": "opus",
  "critic": "sonnet",
  "spec-corrector": "opus",
  "tooling-setup": "sonnet",
  "analyst": "opus",
  "reviewer": "sonnet",
  "security": "sonnet",
  "architect": "opus",
  "tester-role": "sonnet",
  "synthesizer": "opus",
  "implementer": "opus",
  "refactorer": "sonnet",
  "tester-exec": "haiku",
  "evaluator": "haiku",
  "diagnostician": "sonnet",
  "fixer": "sonnet",
  "learner": "haiku",
  "reporter": "haiku",
  "retrospective": "sonnet",
};

export function getModelForAgent(agentType: AgentType): ModelTier {
  return AGENT_MODEL_MAP[agentType];
}
