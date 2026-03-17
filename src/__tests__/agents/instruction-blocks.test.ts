import { describe, it, expect } from "vitest";
import { buildPrompt } from "../../agents/prompts.js";
import type { AgentConfig } from "../../types/agents.js";

describe("instruction blocks in buildPrompt", () => {
  const baseConfig: AgentConfig = {
    type: "researcher",
    model: "opus",
    inputFiles: ["PRD.md"],
    outputFile: "research-report.md",
    rules: [],
    memoryContent: "test memory",
  };

  it("renders instruction blocks when provided", () => {
    const config: AgentConfig = {
      ...baseConfig,
      instructionBlocks: [
        { heading: "ENVIRONMENT CONTEXT", content: "Consider the runtime." },
        { heading: "SELF-REVIEW PROTOCOL", content: "Re-read your output." },
      ],
    };
    const prompt = buildPrompt(config);
    expect(prompt).toContain("## ENVIRONMENT CONTEXT");
    expect(prompt).toContain("Consider the runtime.");
    expect(prompt).toContain("## SELF-REVIEW PROTOCOL");
    expect(prompt).toContain("Re-read your output.");
  });

  it("omits instruction blocks section when not provided", () => {
    const prompt = buildPrompt(baseConfig);
    expect(prompt).not.toContain("ENVIRONMENT CONTEXT");
    expect(prompt).not.toContain("SELF-REVIEW PROTOCOL");
  });

  it("omits instruction blocks section when array is empty", () => {
    const config: AgentConfig = { ...baseConfig, instructionBlocks: [] };
    const prompt = buildPrompt(config);
    expect(prompt).not.toContain("ENVIRONMENT CONTEXT");
  });
});
