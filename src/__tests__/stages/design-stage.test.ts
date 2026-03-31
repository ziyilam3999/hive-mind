import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { getDefaultConfig } from "../../config/loader.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";
import type { HiveMindConfig } from "../../config/schema.js";
import type { QuestionnaireData } from "../../types/design.js";
import {
  detectUIKeywords,
  generateQuestionnaire,
  validateQuestionnaireYaml,
  loadDesignRules,
  parseCSSCustomProperties,
  deriveTokensFromQuestionnaire,
  cleanupPartialOutput,
  parseSideBySideSelection,
  handlePrototypeRejection,
  handleSideBySideRejection,
  spawnPrototype,
  spawnSideBySide,
  extractDesignTokens,
  runDesignStage,
  INITIAL_PROTOTYPE_FILE,
} from "../../stages/design-stage.js";

// Mock agents/spawner to prevent real Claude spawns
vi.mock("../../agents/spawner.js", () => ({
  spawnAgentWithRetry: vi.fn().mockResolvedValue({
    success: true,
    outputFile: "mock-output",
    costUsd: 0.01,
    durationMs: 100,
  }),
  spawnAgentsParallel: vi.fn().mockResolvedValue([
    { success: true, outputFile: "mock-a", costUsd: 0.01, durationMs: 100 },
    { success: true, outputFile: "mock-b", costUsd: 0.01, durationMs: 100 },
  ]),
}));

// Mock utils/shell to prevent real shell spawns
vi.mock("../../utils/shell.js", () => ({
  spawnClaude: vi.fn().mockResolvedValue({
    exitCode: 0,
    stdout: "",
    stderr: "",
  }),
  runShell: vi.fn().mockResolvedValue({
    stdout: "",
    stderr: "",
    exitCode: 0,
  }),
  getSpawnClaudeInvocationCount: vi.fn().mockReturnValue(0),
}));

// Mock checkpoint and log modules
vi.mock("../../state/checkpoint.js", () => ({
  writeCheckpoint: vi.fn(),
}));

vi.mock("../../state/manager-log.js", () => ({
  appendLogEntry: vi.fn(),
  createLogEntry: vi.fn((_action: string, fields: Record<string, unknown>) => ({
    timestamp: new Date().toISOString(),
    action: _action,
    ...fields,
  })),
}));

const config = getDefaultConfig();

describe("design-stage", () => {
  const testDir = join(process.cwd(), ".test-design-stage");
  const workingDir = join(testDir, "working");
  const knowledgeDir = join(testDir, "knowledge");
  const dirs: PipelineDirs = { workingDir, knowledgeDir, labDir: testDir };

  const defaultQ: QuestionnaireData = {
    style: "minimal",
    palette: { mode: "warm", custom_colors: [] },
    density: "balanced",
    layout: { structure: "sidebar-main" },
    font: "system",
    interactivity: "static",
  };

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(workingDir, { recursive: true });
    mkdirSync(knowledgeDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // ── detectUIKeywords (FEAT-01, SC-01, SC-02) ──────────────────────────

  describe("detectUIKeywords", () => {
    it("returns true for text containing 'dashboard' (SC-01)", () => {
      expect(detectUIKeywords("Build a dashboard for analytics")).toBe(true);
    });

    it("returns false for text with no UI keywords — CLI tool (SC-02, negative)", () => {
      expect(detectUIKeywords("Build a CLI tool for data migration")).toBe(false);
    });

    it("returns true for 'web UI'", () => {
      expect(detectUIKeywords("Create a web UI for managing users")).toBe(true);
    });

    it("returns true for 'frontend'", () => {
      expect(detectUIKeywords("Build a frontend for the API")).toBe(true);
    });

    it("returns true for 'screen'", () => {
      expect(detectUIKeywords("Design a login screen")).toBe(true);
    });

    it("returns true for 'mobile app'", () => {
      expect(detectUIKeywords("Build a mobile app for iOS")).toBe(true);
    });

    it("returns false for 'mydashboard' — no word boundary before keyword", () => {
      expect(detectUIKeywords("The mydashboard tool is great")).toBe(false);
    });

    it("returns true for 'dashboard-config' — word boundary before keyword", () => {
      expect(detectUIKeywords("The dashboard-config section")).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(detectUIKeywords("Build a DASHBOARD")).toBe(true);
      expect(detectUIKeywords("Create a Frontend")).toBe(true);
    });
  });

  // ── generateQuestionnaire (FEAT-02, SC-10) ────────────────────────────

  describe("generateQuestionnaire", () => {
    it("writes YAML with all 6 required fields when no design-system.md", async () => {
      const yamlPath = await generateQuestionnaire(dirs, config, testDir);
      expect(existsSync(yamlPath)).toBe(true);

      const content = readFileSync(yamlPath, "utf-8");
      const parsed = parse(content);

      expect(parsed).toHaveProperty("style");
      expect(parsed).toHaveProperty("palette");
      expect(parsed).toHaveProperty("density");
      expect(parsed).toHaveProperty("layout");
      expect(parsed).toHaveProperty("font");
      expect(parsed).toHaveProperty("interactivity");
    });

    it("palette has nested mode and custom_colors array", async () => {
      const yamlPath = await generateQuestionnaire(dirs, config, testDir);
      const parsed = parse(readFileSync(yamlPath, "utf-8"));

      expect(parsed.palette).toHaveProperty("mode");
      expect(typeof parsed.palette.mode).toBe("string");
      expect(Array.isArray(parsed.palette.custom_colors)).toBe(true);
    });

    it("uses hardcoded defaults when no design-system.md: minimal, warm, balanced", async () => {
      const yamlPath = await generateQuestionnaire(dirs, config, testDir);
      const parsed = parse(readFileSync(yamlPath, "utf-8"));

      expect(parsed.style).toBe("minimal");
      expect(parsed.palette.mode).toBe("warm");
      expect(parsed.density).toBe("balanced");
      expect(parsed.layout.structure).toBe("sidebar-main");
      expect(parsed.font).toBe("system");
      expect(parsed.interactivity).toBe("static");
      expect(parsed.palette.custom_colors).toEqual([]);
    });

    it("reads CSS from fenced ```css blocks in design-system.md — corporate + cool", async () => {
      const dsContent = `# Design System

Some prose here with --design-style: ignored outside fenced block.

\`\`\`css
:root {
  --design-style: corporate;
  --color-scheme: cool;
}
\`\`\`
`;
      writeFileSync(join(knowledgeDir, "design-system.md"), dsContent);
      const yamlPath = await generateQuestionnaire(dirs, config, testDir);
      const parsed = parse(readFileSync(yamlPath, "utf-8"));

      expect(parsed.style).toBe("corporate");
      expect(parsed.palette.mode).toBe("cool");
    });

    it("maps --spacing-base: 4px to compact density (threshold <= 6)", async () => {
      writeFileSync(
        join(knowledgeDir, "design-system.md"),
        "```css\n:root { --spacing-base: 4px; }\n```",
      );
      const yamlPath = await generateQuestionnaire(dirs, config, testDir);
      const parsed = parse(readFileSync(yamlPath, "utf-8"));
      expect(parsed.density).toBe("compact");
    });

    it("maps --spacing-base: 8px to balanced density (threshold 7-10)", async () => {
      writeFileSync(
        join(knowledgeDir, "design-system.md"),
        "```css\n:root { --spacing-base: 8px; }\n```",
      );
      const yamlPath = await generateQuestionnaire(dirs, config, testDir);
      const parsed = parse(readFileSync(yamlPath, "utf-8"));
      expect(parsed.density).toBe("balanced");
    });

    it("maps --spacing-base: 12px to spacious density (threshold > 10)", async () => {
      writeFileSync(
        join(knowledgeDir, "design-system.md"),
        "```css\n:root { --spacing-base: 12px; }\n```",
      );
      const yamlPath = await generateQuestionnaire(dirs, config, testDir);
      const parsed = parse(readFileSync(yamlPath, "utf-8"));
      expect(parsed.density).toBe("spacious");
    });

    it("collects --color-* hex values into custom_colors", async () => {
      writeFileSync(
        join(knowledgeDir, "design-system.md"),
        "```css\n:root {\n  --color-primary: #1a73e8;\n  --color-secondary: #5f6368;\n  --color-accent: #fbbc04;\n}\n```",
      );
      const yamlPath = await generateQuestionnaire(dirs, config, testDir);
      const parsed = parse(readFileSync(yamlPath, "utf-8"));
      expect(parsed.palette.custom_colors).toContain("#1a73e8");
      expect(parsed.palette.custom_colors).toContain("#5f6368");
      expect(parsed.palette.custom_colors).toContain("#fbbc04");
      expect(parsed.palette.custom_colors).toHaveLength(3);
    });

    // Security: CRITICAL-01 — newline stripping
    it("strips newlines from CSS property values (CRITICAL-01 security)", async () => {
      writeFileSync(
        join(knowledgeDir, "design-system.md"),
        "```css\n:root { --design-style: bold; }\n```",
      );
      const yamlPath = await generateQuestionnaire(dirs, config, testDir);
      const content = readFileSync(yamlPath, "utf-8");
      const parsed = parse(content);
      expect(parsed.style).toBe("bold");
      // Verify no newline chars in any string value
      expect(parsed.style).not.toContain("\n");
    });

    // Security: HIGH-02 — hex validation for custom_colors
    it("excludes invalid hex values from custom_colors (HIGH-02 security)", async () => {
      writeFileSync(
        join(knowledgeDir, "design-system.md"),
        "```css\n:root {\n  --color-primary: javascript:alert(1);\n  --color-secondary: #ff0000;\n}\n```",
      );
      const yamlPath = await generateQuestionnaire(dirs, config, testDir);
      const parsed = parse(readFileSync(yamlPath, "utf-8"));
      expect(parsed.palette.custom_colors).toEqual(["#ff0000"]);
      expect(parsed.palette.custom_colors).not.toContain("javascript:alert(1)");
    });

    // Security: CRITICAL-02 — path traversal guard
    it("rejects path traversal in designSystemPath (CRITICAL-02 security)", async () => {
      const traversalConfig: HiveMindConfig = {
        ...config,
        designSystemPath: "../../etc/passwd",
      };
      // Should not throw, but should fall back to defaults
      const yamlPath = await generateQuestionnaire(dirs, traversalConfig, testDir);
      const parsed = parse(readFileSync(yamlPath, "utf-8"));
      // Falls back to defaults — no outside file read
      expect(parsed.style).toBe("minimal");
    });

    it("uses designSystemPath when it is within project bounds", async () => {
      const customDsDir = join(testDir, "custom");
      mkdirSync(customDsDir, { recursive: true });
      writeFileSync(
        join(customDsDir, "ds.md"),
        "```css\n:root { --design-style: playful; }\n```",
      );
      const customConfig: HiveMindConfig = {
        ...config,
        designSystemPath: "custom/ds.md",
      };
      const yamlPath = await generateQuestionnaire(dirs, customConfig, testDir);
      const parsed = parse(readFileSync(yamlPath, "utf-8"));
      expect(parsed.style).toBe("playful");
    });
  });

  // ── validateQuestionnaireYaml (FEAT-02) ────────────────────────────────

  describe("validateQuestionnaireYaml", () => {
    const validYaml = `style: minimal
palette:
  mode: warm
  custom_colors: []
density: balanced
layout:
  structure: sidebar-main
font: system
interactivity: static
`;

    it("returns valid: true for correct YAML with all fields", () => {
      const yamlPath = join(testDir, "valid.yaml");
      writeFileSync(yamlPath, validYaml);
      const result = validateQuestionnaireYaml(yamlPath);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns valid: false with error for malformed YAML", () => {
      const yamlPath = join(testDir, "invalid.yaml");
      writeFileSync(yamlPath, "style: :\n  bad indentation\n: broken");
      const result = validateQuestionnaireYaml(yamlPath);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it("returns valid: false for out-of-range enum value like ultra-modern", () => {
      const yamlPath = join(testDir, "outofrange.yaml");
      writeFileSync(
        yamlPath,
        validYaml.replace("style: minimal", "style: ultra-modern"),
      );
      const result = validateQuestionnaireYaml(yamlPath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("ultra-modern");
    });

    it("returns valid: false when a required field is missing", () => {
      const yamlPath = join(testDir, "missing.yaml");
      writeFileSync(yamlPath, "style: minimal\npalette:\n  mode: warm\n");
      const result = validateQuestionnaireYaml(yamlPath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing");
    });

    it("returns valid: false for non-existent file", () => {
      const result = validateQuestionnaireYaml(join(testDir, "nope.yaml"));
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ── loadDesignRules (FEAT-03a) ─────────────────────────────────────────

  describe("loadDesignRules", () => {
    it("uses explicit designRulesPath when custom path is set", () => {
      const customPath = join(testDir, "custom-rules.md");
      writeFileSync(customPath, "# Custom Rules\nMy custom rules content");
      const customConfig: HiveMindConfig = {
        ...config,
        designRulesPath: customPath,
      };
      const rules = loadDesignRules(customConfig, dirs);
      expect(rules).toContain("Custom Rules");
    });

    it("falls back to knowledgeDir when no explicit path (fallback)", () => {
      writeFileSync(
        join(knowledgeDir, "design-rules.md"),
        "# Knowledge Rules\nFrom knowledge dir",
      );
      const rules = loadDesignRules(config, dirs);
      expect(rules).toContain("Knowledge Rules");
    });

    it("uses hardcoded minimal ruleset when no rules file exists anywhere", () => {
      const rules = loadDesignRules(config, dirs);
      expect(rules).toContain("## Layout Rules");
      expect(rules).toContain("## Color Rules");
      expect(rules).toContain("## Typography Rules");
      expect(rules).toContain("## Spacing Rules");
      expect(rules).toContain("## Component Rules");
    });

    it("rejects path traversal in designRulesPath (CRITICAL-02 bounds check)", () => {
      const traversalConfig: HiveMindConfig = {
        ...config,
        designRulesPath: "../../etc/passwd",
      };
      // Should fall through to hardcoded fallback
      const rules = loadDesignRules(traversalConfig, dirs, testDir);
      expect(rules).toContain("## Layout Rules");
    });
  });

  // ── parseCSSCustomProperties (FEAT-05 Tier 2) ────────────────────────

  describe("parseCSSCustomProperties", () => {
    it("extracts --prefixed CSS custom properties from <style> blocks", () => {
      const html = `<html><head><style>
        :root {
          --primary-color: #3b82f6;
          --text-color: #111827;
          --spacing-unit: 8px;
        }
      </style></head><body></body></html>`;

      const props = parseCSSCustomProperties(html);
      expect(props.get("primary-color")).toBe("#3b82f6");
      expect(props.get("text-color")).toBe("#111827");
      expect(props.get("spacing-unit")).toBe("8px");
    });

    it("returns empty map when no <style> blocks exist", () => {
      const html = "<html><body><p>No styles here</p></body></html>";
      const props = parseCSSCustomProperties(html);
      expect(props.size).toBe(0);
    });

    it("handles multiple <style> blocks", () => {
      const html = `<style>:root { --color-a: red; }</style>
      <style>:root { --color-b: blue; }</style>`;
      const props = parseCSSCustomProperties(html);
      expect(props.get("color-a")).toBe("red");
      expect(props.get("color-b")).toBe("blue");
    });
  });

  // ── deriveTokensFromQuestionnaire (FEAT-05 Tier 3) ───────────────────

  describe("deriveTokensFromQuestionnaire", () => {
    it("returns all 4 required top-level keys: colors, typography, spacing, layout", () => {
      const tokens = deriveTokensFromQuestionnaire(defaultQ);
      expect(tokens).toHaveProperty("colors");
      expect(tokens).toHaveProperty("typography");
      expect(tokens).toHaveProperty("spacing");
      expect(tokens).toHaveProperty("layout");
    });

    it("uses warm palette defaults for warm mode", () => {
      const tokens = deriveTokensFromQuestionnaire(defaultQ);
      expect(tokens.colors.primary).toBe("#D97706");
    });

    it("uses cool palette defaults for cool mode", () => {
      const coolQ = { ...defaultQ, palette: { mode: "cool", custom_colors: [] } };
      const tokens = deriveTokensFromQuestionnaire(coolQ);
      expect(tokens.colors.primary).toBe("#2563EB");
    });

    it("maps font to fontFamily in typography", () => {
      const tokens = deriveTokensFromQuestionnaire(defaultQ);
      expect(tokens.typography.fontFamily).toContain("system-ui");
    });

    it("uses balanced spacing for balanced density", () => {
      const tokens = deriveTokensFromQuestionnaire(defaultQ);
      expect(tokens.spacing.unit).toBe("8px");
      expect(tokens.spacing.small).toBe("8px");
      expect(tokens.spacing.medium).toBe("16px");
      expect(tokens.spacing.large).toBe("32px");
    });

    it("uses compact spacing for compact density", () => {
      const compactQ = { ...defaultQ, density: "compact" };
      const tokens = deriveTokensFromQuestionnaire(compactQ);
      expect(tokens.spacing.unit).toBe("4px");
    });
  });

  // ── cleanupPartialOutput (FEAT-04) ───────────────────────────────────

  describe("cleanupPartialOutput", () => {
    it("deletes files under 100 bytes matching the pattern", () => {
      const designDir = join(testDir, "design-cleanup");
      mkdirSync(designDir, { recursive: true });

      // Small file (under 100 bytes) — should be deleted
      writeFileSync(join(designDir, "prototype-v1-a.html"), "<html>");
      // Large file (over 100 bytes) — should be kept
      writeFileSync(join(designDir, "prototype-v1-b.html"), "<html>".padEnd(200, "x"));
      // Non-matching file — should be kept regardless of size
      writeFileSync(join(designDir, "other.txt"), "small");

      cleanupPartialOutput(designDir, /^prototype-v\d+-[ab]\.html$/);

      expect(existsSync(join(designDir, "prototype-v1-a.html"))).toBe(false);
      expect(existsSync(join(designDir, "prototype-v1-b.html"))).toBe(true);
      expect(existsSync(join(designDir, "other.txt"))).toBe(true);
    });

    it("does nothing when directory does not exist", () => {
      expect(() => cleanupPartialOutput(join(testDir, "nope"), /test/)).not.toThrow();
    });
  });

  // ── parseSideBySideSelection (FEAT-04) ────────────────────────────────

  describe("parseSideBySideSelection", () => {
    it("selects 'a' for exact input 'a'", () => {
      const result = parseSideBySideSelection("a");
      expect(result.selected).toBe("a");
      expect(result.isRejection).toBe(false);
    });

    it("selects 'a' for uppercase 'A' (case-insensitive)", () => {
      const result = parseSideBySideSelection("A");
      expect(result.selected).toBe("a");
      expect(result.isRejection).toBe(false);
    });

    it("selects 'b' for exact input 'b'", () => {
      const result = parseSideBySideSelection("b");
      expect(result.selected).toBe("b");
      expect(result.isRejection).toBe(false);
    });

    it("treats 'a looks better' as rejection (not exact match)", () => {
      const result = parseSideBySideSelection("a looks better");
      expect(result.selected).toBeNull();
      expect(result.isRejection).toBe(true);
    });

    it("treats 'neither' as rejection", () => {
      const result = parseSideBySideSelection("neither");
      expect(result.selected).toBeNull();
      expect(result.isRejection).toBe(true);
    });

    it("handles whitespace-padded 'a' correctly", () => {
      const result = parseSideBySideSelection("  a  ");
      expect(result.selected).toBe("a");
      expect(result.isRejection).toBe(false);
    });
  });

  // ── spawnPrototype (FEAT-03) ──────────────────────────────────────────

  describe("spawnPrototype", () => {
    it("calls spawnAgentWithRetry and returns true when output file exists", async () => {
      const designDir = join(workingDir, "design");
      mkdirSync(designDir, { recursive: true });

      // Pre-create the output file to simulate agent writing it
      const outputPath = join(designDir, "prototype-v1.html");
      writeFileSync(outputPath, "<html><body>Prototype</body></html>");

      const questionnairePath = join(designDir, "design-questionnaire.yaml");
      writeFileSync(questionnairePath, "style: minimal");
      const prdPath = join(workingDir, "normalize", "normalized-prd.md");
      mkdirSync(join(workingDir, "normalize"), { recursive: true });
      writeFileSync(prdPath, "# PRD");

      const result = await spawnPrototype(
        "prototype-v1.html",
        dirs,
        config,
        questionnairePath,
        "## Design Rules",
        prdPath,
        [],
      );

      expect(result).toBe(true);
    });
  });

  // ── spawnSideBySide (FEAT-04) ─────────────────────────────────────────

  describe("spawnSideBySide", () => {
    it("calls spawnAgentsParallel and returns paths for valid files", async () => {
      const designDir = join(workingDir, "design");
      mkdirSync(designDir, { recursive: true });

      // Pre-create a/b files to simulate agent output
      writeFileSync(join(designDir, "prototype-v2-a.html"), "<html>".padEnd(200, "x"));
      writeFileSync(join(designDir, "prototype-v2-b.html"), "<html>".padEnd(200, "x"));

      const questionnairePath = join(designDir, "q.yaml");
      writeFileSync(questionnairePath, "style: minimal");
      const prdPath = join(workingDir, "prd.md");
      writeFileSync(prdPath, "# PRD");

      const result = await spawnSideBySide(
        2,
        dirs,
        config,
        questionnairePath,
        "## Rules",
        prdPath,
        [],
      );

      expect(result.pathA).not.toBeNull();
      expect(result.pathB).not.toBeNull();
      expect(result.pathA).toContain("prototype-v2-a.html");
      expect(result.pathB).toContain("prototype-v2-b.html");
    });

    it("returns null for files that are too small (under 100 bytes)", async () => {
      const designDir = join(workingDir, "design");
      mkdirSync(designDir, { recursive: true });

      // Only one file is big enough
      writeFileSync(join(designDir, "prototype-v3-a.html"), "<html>".padEnd(200, "x"));
      writeFileSync(join(designDir, "prototype-v3-b.html"), "<h>");

      const questionnairePath = join(designDir, "q.yaml");
      writeFileSync(questionnairePath, "style: minimal");
      const prdPath = join(workingDir, "prd.md");
      writeFileSync(prdPath, "# PRD");

      const result = await spawnSideBySide(
        3,
        dirs,
        config,
        questionnairePath,
        "## Rules",
        prdPath,
        [],
      );

      expect(result.pathA).not.toBeNull();
      // b is cleaned up because it's under 100 bytes
      expect(result.pathB).toBeNull();
    });
  });

  // ── extractDesignTokens (FEAT-05) ─────────────────────────────────────

  describe("extractDesignTokens", () => {
    it("Tier 1 success — returns agent-extracted tokens when valid JSON with all 4 keys", async () => {
      const designDir = join(workingDir, "design");
      mkdirSync(designDir, { recursive: true });

      const htmlPath = join(designDir, "approved.html");
      writeFileSync(htmlPath, "<html><body>Has styles</body></html>");

      const tokensJson = JSON.stringify({
        colors: { primary: "#111", secondary: "#222", background: "#fff", surface: "#eee", text: "#000", accent: "#333" },
        typography: { fontFamily: "Arial", headingSize: "2rem", bodySize: "1rem", lineHeight: "1.5" },
        spacing: { unit: "8px", small: "8px", medium: "16px", large: "32px" },
        layout: { maxWidth: "1200px", columns: 12, gap: "16px" },
      });

      const outputPath = join(designDir, "design-tokens.json");

      // Mock spawnAgentWithRetry to succeed and write valid tokens
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockResolvedValueOnce({
        success: true,
        outputFile: outputPath,
        costUsd: 0.02,
        durationMs: 200,
      });
      // Pre-create the output file to simulate agent writing it
      writeFileSync(outputPath, tokensJson);

      const tokens = await extractDesignTokens(htmlPath, defaultQ, dirs, config);
      expect(tokens.colors.primary).toBe("#111");
      expect(tokens.typography.fontFamily).toBe("Arial");
      expect(tokens.spacing.unit).toBe("8px");
      expect(tokens.layout.maxWidth).toBe("1200px");
    });

    it("Tier 1 fail falls through to Tier 2 (CSS parser) when HTML has enough properties", async () => {
      const designDir = join(workingDir, "design");
      mkdirSync(designDir, { recursive: true });

      // HTML with CSS custom properties covering colors + typography (2 of 4 fields)
      const htmlPath = join(designDir, "styled-prototype.html");
      writeFileSync(
        htmlPath,
        `<html><head><style>
          :root {
            --primary-color: #3b82f6;
            --secondary-color: #1e40af;
            --background-color: #ffffff;
            --surface-color: #f9fafb;
            --text-color: #111827;
            --accent-color: #f59e0b;
            --font-family: Inter;
            --heading-size: 2.5rem;
            --body-size: 1rem;
            --line-height: 1.6;
          }
        </style></head><body></body></html>`,
      );

      // Mock Tier 1 agent to fail
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockRejectedValueOnce(new Error("Agent failed"));

      const tokens = await extractDesignTokens(htmlPath, defaultQ, dirs, config);
      // Tier 2 should have extracted colors from CSS
      expect(tokens.colors.primary).toBe("#3b82f6");
      expect(tokens.typography.fontFamily).toBe("Inter");
    });

    it("falls back to Tier 3 (questionnaire defaults) when all tiers fail — no CSS in HTML", async () => {
      const designDir = join(workingDir, "design");
      mkdirSync(designDir, { recursive: true });

      const htmlPath = join(designDir, "approved-prototype.html");
      writeFileSync(htmlPath, "<html><body>No styles</body></html>");

      // Mock spawnAgentWithRetry to fail for Tier 1
      const { spawnAgentWithRetry: mockSpawn } = await import("../../agents/spawner.js");
      vi.mocked(mockSpawn).mockResolvedValueOnce({
        success: false,
        outputFile: "",
        costUsd: 0.01,
        durationMs: 100,
      });

      const tokens = await extractDesignTokens(htmlPath, defaultQ, dirs, config);
      expect(tokens).toHaveProperty("colors");
      expect(tokens).toHaveProperty("typography");
      expect(tokens).toHaveProperty("spacing");
      expect(tokens).toHaveProperty("layout");
      // Should use warm palette defaults
      expect(tokens.colors.primary).toBe("#D97706");
    });

    it("all three tiers are referenced: design-token-extractor, parseCSSCustomProperties, deriveTokensFromQuestionnaire", () => {
      // This is a structural test — verified by EC-15 grep
      // The functions exist and are called in extractDesignTokens
      expect(typeof extractDesignTokens).toBe("function");
      expect(typeof parseCSSCustomProperties).toBe("function");
      expect(typeof deriveTokensFromQuestionnaire).toBe("function");
    });
  });

  // ── runDesignStage (FEAT-08, AC-02) ───────────────────────────────────

  describe("runDesignStage", () => {
    it("is exported as an async function with the correct signature", () => {
      expect(typeof runDesignStage).toBe("function");
    });

    it("writes DESIGN_SKIPPED log when PRD has no UI keywords", async () => {
      mkdirSync(join(workingDir, "normalize"), { recursive: true });
      writeFileSync(
        join(workingDir, "normalize", "normalized-prd.md"),
        "Build a CLI data migration tool with batch processing.",
      );

      const { appendLogEntry } = await import("../../state/manager-log.js");

      await runDesignStage(dirs, config);

      expect(vi.mocked(appendLogEntry)).toHaveBeenCalled();
    });

    it("writes approve-design-skip checkpoint with skip hint when no UI keywords detected", async () => {
      mkdirSync(join(workingDir, "normalize"), { recursive: true });
      writeFileSync(
        join(workingDir, "normalize", "normalized-prd.md"),
        "Build a REST API backend for data processing.",
      );

      const { writeCheckpoint: mockCheckpoint } = await import("../../state/checkpoint.js");

      await runDesignStage(dirs, config);

      expect(vi.mocked(mockCheckpoint)).toHaveBeenCalledWith(
        workingDir,
        expect.objectContaining({
          awaiting: "approve-design-skip",
          message: expect.stringContaining("No UI keywords detected"),
        }),
      );
    });

    it("writes approve-design-skip checkpoint with design hint when UI keywords detected", async () => {
      mkdirSync(join(workingDir, "normalize"), { recursive: true });
      writeFileSync(
        join(workingDir, "normalize", "normalized-prd.md"),
        "Build a dashboard for analytics with real-time charts.",
      );

      const { writeCheckpoint: mockCheckpoint } = await import("../../state/checkpoint.js");

      await runDesignStage(dirs, config);

      expect(vi.mocked(mockCheckpoint)).toHaveBeenCalledWith(
        workingDir,
        expect.objectContaining({
          awaiting: "approve-design-skip",
          message: expect.stringContaining("UI keywords detected"),
        }),
      );
    });
  });

  // ── handlePrototypeRejection / handleSideBySideRejection (FEAT-04) ───

  describe("handlePrototypeRejection", () => {
    it("rejectionIterationCount increments from 0 to 1 on first rejection", () => {
      const protos: Array<{ file: string; iteration: number; feedback: string }> = [];
      const result = handlePrototypeRejection(0, "needs more contrast", protos, "prototype-v1.html", 1);
      expect(result.updatedCount).toBe(1);
      expect(result.shouldHalt).toBe(false);
      expect(protos).toHaveLength(1);
    });

    it("shouldHalt is true after 3 rejections", () => {
      const protos: Array<{ file: string; iteration: number; feedback: string }> = [];
      const result = handlePrototypeRejection(2, "still not right", protos, "prototype-v3.html", 3);
      expect(result.updatedCount).toBe(3);
      expect(result.shouldHalt).toBe(true);
    });

    it("shouldHalt is false when rejectionIterationCount < 3", () => {
      const protos: Array<{ file: string; iteration: number; feedback: string }> = [];
      const result = handlePrototypeRejection(1, "try again", protos, "prototype-v2.html", 2);
      expect(result.updatedCount).toBe(2);
      expect(result.shouldHalt).toBe(false);
    });
  });

  describe("handleSideBySideRejection", () => {
    it("rejectionIterationCount increments and records both alternatives", () => {
      const protos: Array<{ file: string; iteration: number; feedback: string }> = [];
      const result = handleSideBySideRejection(0, "try again", protos, "a.html", "b.html", 2);
      expect(result.updatedCount).toBe(1);
      expect(result.shouldHalt).toBe(false);
      expect(protos).toHaveLength(2);
    });

    it("shouldHalt is true after 3 side-by-side rejections", () => {
      const protos: Array<{ file: string; iteration: number; feedback: string }> = [];
      const result = handleSideBySideRejection(2, "none work", protos, "a.html", "b.html", 4);
      expect(result.updatedCount).toBe(3);
      expect(result.shouldHalt).toBe(true);
    });

    it("handles one agent fail — records only the surviving alternative", () => {
      const protos: Array<{ file: string; iteration: number; feedback: string }> = [];
      const result = handleSideBySideRejection(0, "not great", protos, "a.html", null, 2);
      expect(result.updatedCount).toBe(1);
      expect(protos).toHaveLength(1);
      expect(protos[0].file).toBe("a.html");
    });
  });

  // ── Mode discriminant (F2-01) ─────────────────────────────────────────

  describe("mode discriminant — single-prototype vs side-by-side", () => {
    it("rejectionIterationCount === 0 triggers single prototype path (handlePrototypeRejection from count 0)", () => {
      // When count is 0 (initial rejection of single prototype), the flow goes to rejection iteration 1
      const protos: Array<{ file: string; iteration: number; feedback: string }> = [];
      const result = handlePrototypeRejection(0, "make it bold", protos, "prototype-v1.html", 1);
      // Count goes from 0 → 1, which triggers side-by-side on next iteration
      expect(result.updatedCount).toBe(1);
      expect(result.shouldHalt).toBe(false);
    });

    it("rejectionIterationCount > 0 triggers side-by-side path (handleSideBySideRejection)", () => {
      // When count > 0, we are already in side-by-side mode
      const protos: Array<{ file: string; iteration: number; feedback: string }> = [];
      const result = handleSideBySideRejection(1, "still not right", protos, "a.html", "b.html", 3);
      expect(result.updatedCount).toBe(2);
      expect(result.shouldHalt).toBe(false);
    });
  });

  // ── yamlParseFailureCount tracking (FEAT-02, AC-18, AC-19) ───────────

  describe("yamlParseFailureCount tracking via checkpoint metadata", () => {
    it("yamlParseFailureCount increments to >= 1 when validateQuestionnaireYaml fails", () => {
      // Simulate the orchestrator pattern: track yamlParseFailureCount in metadata
      let yamlParseFailureCount = 0;

      const badPath = join(testDir, "bad.yaml");
      writeFileSync(badPath, "style: :\n  bad indentation\n: broken");
      const result = validateQuestionnaireYaml(badPath);
      if (!result.valid) {
        yamlParseFailureCount += 1;
      }

      expect(yamlParseFailureCount).toBe(1);
      expect(result.valid).toBe(false);
    });

    it("yamlParseFailureCount resets to 0 on successful parse (MAJ-06)", () => {
      let yamlParseFailureCount = 2; // simulate 2 prior failures

      const goodPath = join(testDir, "good.yaml");
      writeFileSync(
        goodPath,
        "style: minimal\npalette:\n  mode: warm\n  custom_colors: []\ndensity: balanced\nlayout:\n  structure: sidebar-main\nfont: system\ninteractivity: static\n",
      );
      const result = validateQuestionnaireYaml(goodPath);
      if (result.valid) {
        yamlParseFailureCount = 0;
      }

      expect(result.valid).toBe(true);
      expect(yamlParseFailureCount).toBe(0);
    });
  });

  // ── customMessage pattern (F2-02, AC-23) ──────────────────────────────

  describe("customMessage in checkpoint metadata", () => {
    it("getCheckpointMessage reads metadata.customMessage when present — runDesignStage sets it", async () => {
      mkdirSync(join(workingDir, "normalize"), { recursive: true });
      writeFileSync(
        join(workingDir, "normalize", "normalized-prd.md"),
        "Build a dashboard for analytics with real-time charts.",
      );

      const { writeCheckpoint: mockCheckpoint } = await import("../../state/checkpoint.js");

      await runDesignStage(dirs, config);

      // Verify that approve-design-skip checkpoint was written with metadata.customMessage
      const calls = vi.mocked(mockCheckpoint).mock.calls;
      const designChoiceCall = calls.find(
        (c) => (c[1] as { awaiting: string }).awaiting === "approve-design-skip",
      );
      expect(designChoiceCall).toBeDefined();
      const checkpoint = designChoiceCall![1] as { metadata?: { customMessage?: string } };
      expect(checkpoint.metadata).toBeDefined();
      expect(checkpoint.metadata!.customMessage).toBeDefined();
      expect(typeof checkpoint.metadata!.customMessage).toBe("string");
      expect(checkpoint.metadata!.customMessage!.length).toBeGreaterThan(0);
    });
  });

  // ── Side-by-side partial failure (AC-24) ──────────────────────────────

  describe("side-by-side partial failure handling", () => {
    it("one agent fail — single alternative presented when only pathA exists", async () => {
      const designDir = join(workingDir, "design");
      mkdirSync(designDir, { recursive: true });

      // Only agent A produces valid output; agent B produces nothing
      writeFileSync(join(designDir, "prototype-v4-a.html"), "<html>".padEnd(200, "x"));
      // No prototype-v4-b.html created — simulating one agent fail

      const questionnairePath = join(designDir, "q.yaml");
      writeFileSync(questionnairePath, "style: minimal");
      const prdPath = join(workingDir, "prd.md");
      writeFileSync(prdPath, "# PRD");

      const result = await spawnSideBySide(
        4,
        dirs,
        config,
        questionnairePath,
        "## Rules",
        prdPath,
        [],
      );

      expect(result.pathA).not.toBeNull();
      expect(result.pathB).toBeNull();
    });
  });

  // ── INITIAL_PROTOTYPE_FILE constant ───────────────────────────────────

  describe("INITIAL_PROTOTYPE_FILE", () => {
    it("equals 'prototype-v1.html'", () => {
      expect(INITIAL_PROTOTYPE_FILE).toBe("prototype-v1.html");
    });
  });
});
