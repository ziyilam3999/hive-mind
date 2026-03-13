import { describe, it, expect, vi } from "vitest";

vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn(async (config: { type: string; outputFile: string }) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(config.outputFile), { recursive: true });
    writeFileSync(config.outputFile, `# Mock ${config.type}`);
    return { success: true, outputFile: config.outputFile };
  }),
  spawnAgentsParallel: vi.fn(async (configs: Array<{ outputFile: string; type: string }>) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    return configs.map((c) => {
      mkdirSync(dirname(c.outputFile), { recursive: true });
      writeFileSync(c.outputFile, `# Mock ${c.type}`);
      return { success: true, outputFile: c.outputFile };
    });
  }),
}));

import { getToolsForAgent } from "../../agents/tool-permissions.js";
import { getAgentRules } from "../../agents/prompts.js";

describe("decomposer agent registration (FW-01)", () => {
  it("decomposer has OUTPUT_TOOLS (Read, Glob, Grep, Write)", () => {
    const tools = getToolsForAgent("decomposer");
    expect(tools).toContain("Write");
    expect(tools).toContain("Read");
    expect(tools).not.toContain("Bash"); // OUTPUT, not DEV
  });

  it("decomposer has SCOPE-SPLIT, AC-PARTITION, STRUCTURED-OUTPUT rules", () => {
    const rules = getAgentRules("decomposer");
    expect(rules.some((r) => r.includes("SCOPE-SPLIT"))).toBe(true);
    expect(rules.some((r) => r.includes("AC-PARTITION"))).toBe(true);
    expect(rules.some((r) => r.includes("STRUCTURED-OUTPUT"))).toBe(true);
    expect(rules.some((r) => r.includes("SIZE-BOUND"))).toBe(true);
  });
});
