/** Tool permission sets used by the agent registry and tool-permissions module. */

export const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];
export const OUTPUT_TOOLS = [...READ_ONLY_TOOLS, "Write"];
export const DEV_TOOLS = [...READ_ONLY_TOOLS, "Write", "Edit", "Bash"];
export const SHELL_ONLY_TOOLS = [...READ_ONLY_TOOLS, "Bash", "Write"];
