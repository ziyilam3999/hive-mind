import { describe, it, expect } from "vitest";
import { getRoleReportsForAgent, buildPrompt } from "../../agents/prompts.js";
import type { AgentConfig, AgentType } from "../../types/agents.js";

const ALL_ROLES: AgentType[] = ["architect", "security", "analyst", "reviewer", "tester-role"];

describe("role-report mapping", () => {
  it("implementer gets architect, security, analyst", () => {
    const result = getRoleReportsForAgent("implementer", ALL_ROLES);
    expect(result).toEqual(["architect", "security", "analyst"]);
  });

  it("tester-exec gets tester-role, analyst, security", () => {
    const result = getRoleReportsForAgent("tester-exec", ALL_ROLES);
    expect(result).toEqual(["tester-role", "analyst", "security"]);
  });

  it("diagnostician gets architect, security, tester-role", () => {
    const result = getRoleReportsForAgent("diagnostician", ALL_ROLES);
    expect(result).toEqual(["architect", "security", "tester-role"]);
  });

  it("refactorer gets architect, reviewer", () => {
    const result = getRoleReportsForAgent("refactorer", ALL_ROLES);
    expect(result).toEqual(["architect", "reviewer"]);
  });

  it("learner gets all 5 roles", () => {
    const result = getRoleReportsForAgent("learner", ALL_ROLES);
    expect(result).toEqual(["architect", "security", "analyst", "reviewer", "tester-role"]);
  });

  it("evaluator gets no roles", () => {
    const result = getRoleReportsForAgent("evaluator", ALL_ROLES);
    expect(result).toEqual([]);
  });

  it("filters by rolesUsed — only returns roles present in the set", () => {
    const result = getRoleReportsForAgent("implementer", ["architect", "analyst"]);
    expect(result).toEqual(["architect", "analyst"]);
    expect(result).not.toContain("security");
  });

  it("returns empty when rolesUsed has no matching roles", () => {
    const result = getRoleReportsForAgent("implementer", ["reviewer", "tester-role"]);
    expect(result).toEqual([]);
  });
});

describe("buildPrompt role-report injection", () => {
  const baseConfig: AgentConfig = {
    type: "implementer",
    model: "opus",
    inputFiles: ["step-file.md"],
    outputFile: "impl-report.md",
    rules: [],
    memoryContent: "test memory",
  };

  it("includes ## ROLE REPORTS section when roleReportContents is set", () => {
    const config: AgentConfig = {
      ...baseConfig,
      roleReportContents: "Architect says: use modular design.\nSecurity says: validate inputs.",
    };
    const prompt = buildPrompt(config);
    expect(prompt).toContain("## ROLE REPORTS");
    expect(prompt).toContain("Architect says: use modular design.");
    expect(prompt).toContain("Security says: validate inputs.");
  });

  it("omits ## ROLE REPORTS section when roleReportContents is undefined", () => {
    const prompt = buildPrompt(baseConfig);
    expect(prompt).not.toContain("## ROLE REPORTS");
  });

  it("omits ## ROLE REPORTS section when roleReportContents is empty string", () => {
    const config: AgentConfig = { ...baseConfig, roleReportContents: "" };
    const prompt = buildPrompt(config);
    expect(prompt).not.toContain("## ROLE REPORTS");
  });
});
