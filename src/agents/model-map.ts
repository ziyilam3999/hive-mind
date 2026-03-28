import type { AgentType, ModelTier } from "../types/agents.js";

export { AGENT_MODEL_MAP } from "./registry.js";

import { AGENT_MODEL_MAP } from "./registry.js";

export function getModelForAgent(agentType: AgentType): ModelTier {
  return AGENT_MODEL_MAP[agentType];
}
