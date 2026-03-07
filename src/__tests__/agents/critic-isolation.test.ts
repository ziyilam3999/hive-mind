import { describe, it, expect } from "vitest";
import { buildPrompt } from "../../agents/prompts.js";
import type { AgentConfig } from "../../types/agents.js";

describe("critic agent isolation", () => {
  it("filters out research-report and justification from critic input", () => {
    const config: AgentConfig = {
      type: "critic",
      model: "sonnet",
      inputFiles: [
        "spec/research-report.md",
        "spec/justification.md",
        "spec/SPEC-draft.md",
      ],
      outputFile: "spec/critique-1.md",
      rules: [],
      memoryContent: "test memory",
    };
    const prompt = buildPrompt(config);
    expect(prompt).not.toContain("research-report");
    expect(prompt).not.toContain("justification");
    expect(prompt).toContain("SPEC-draft.md");
  });
});
