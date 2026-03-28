export {
  READ_ONLY_TOOLS,
  OUTPUT_TOOLS,
  DEV_TOOLS,
  SHELL_ONLY_TOOLS,
} from "./tool-sets.js";

export { AGENT_TOOL_MAP } from "./registry.js";

import type { AgentType } from "../types/agents.js";
import { AGENT_TOOL_MAP } from "./registry.js";

export function getToolsForAgent(agentType: AgentType): string[] {
  return AGENT_TOOL_MAP[agentType];
}
