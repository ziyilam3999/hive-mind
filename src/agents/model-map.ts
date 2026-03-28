import type { AgentType, ModelTier } from "../types/agents.js";

import { AGENT_MODEL_MAP } from "./registry.js";
export { AGENT_MODEL_MAP };

export function getModelForAgent(agentType: AgentType): ModelTier {
  return AGENT_MODEL_MAP[agentType];
}
