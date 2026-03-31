import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync, readdirSync, appendFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { stringify, parse } from "yaml";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { QuestionnaireData, DesignTokens } from "../types/design.js";
import type { CostTracker } from "../utils/cost-tracker.js";
import type { AgentConfig } from "../types/agents.js";
import { spawnAgentWithRetry, spawnAgentsParallel } from "../agents/spawner.js";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { writeCheckpoint } from "../state/checkpoint.js";
import { appendLogEntry, createLogEntry } from "../state/manager-log.js";

// ── UI keyword detection (FEAT-01) ──────────────────────────────────────

const UI_KEYWORDS = ["dashboard", "web UI", "frontend", "screen", "mobile app"];

/**
 * Detects whether a PRD text contains UI-related keywords.
 * Uses \b word boundaries to prevent false positives on substrings.
 */
export function detectUIKeywords(text: string): boolean {
  return UI_KEYWORDS.some((kw) => {
    const pattern = new RegExp(`\\b${kw.replace(/\s+/g, "\\s+")}\\b`, "i");
    return pattern.test(text);
  });
}

// ── Allowed enum values ─────────────────────────────────────────────────

const ALLOWED_STYLE = ["minimal", "bold", "corporate", "playful"];
const ALLOWED_PALETTE_MODE = ["warm", "cool", "neutral", "vibrant"];
const ALLOWED_DENSITY = ["compact", "balanced", "spacious"];
const ALLOWED_LAYOUT = ["sidebar-main", "top-nav", "split", "single-column"];
const ALLOWED_FONT = ["system", "serif", "sans-serif", "monospace"];
const ALLOWED_INTERACTIVITY = ["static", "interactive"];

// ── CSS property mapping ────────────────────────────────────────────────

const HEX_REGEX = /^#[0-9a-fA-F]{3,8}$/;

interface CSSPropertyMap {
  style?: string;
  paletteMode?: string;
  density?: string;
  layout?: string;
  font?: string;
  interactivity?: string;
  customColors: string[];
}

/**
 * Extracts CSS custom properties from fenced ```css blocks in markdown.
 * Strips newlines from values (CRITICAL-01 security fix).
 */
function extractCSSFromFencedBlocks(content: string): Map<string, string> {
  const props = new Map<string, string>();
  const fencedBlockRegex = /```css\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fencedBlockRegex.exec(content)) !== null) {
    const block = match[1];
    const propRegex = /--([\w-]+)\s*:\s*([^;}\n]+)/g;
    let propMatch: RegExpExecArray | null;

    while ((propMatch = propRegex.exec(block)) !== null) {
      const name = propMatch[1].trim();
      // CRITICAL-01: Strip newlines from CSS property values
      const value = propMatch[2].trim().replace(/[\n\r]/g, "");
      props.set(name, value);
    }
  }

  return props;
}

function mapCSSToQuestionnaire(cssProps: Map<string, string>): CSSPropertyMap {
  const result: CSSPropertyMap = { customColors: [] };

  for (const [name, value] of cssProps) {
    if (name === "design-style") {
      result.style = value;
    } else if (name === "color-scheme") {
      result.paletteMode = value;
    } else if (name === "spacing-base") {
      const px = parseInt(value, 10);
      if (!isNaN(px)) {
        if (px <= 6) result.density = "compact";
        else if (px <= 10) result.density = "balanced";
        else result.density = "spacious";
      }
    } else if (name === "layout-structure") {
      result.layout = value;
    } else if (name === "font-family-primary") {
      result.font = value;
    } else if (name === "interactivity") {
      result.interactivity = value;
    } else if (name.startsWith("color-")) {
      // HIGH-02: Validate hex color values before including
      if (HEX_REGEX.test(value)) {
        result.customColors.push(value);
      }
    }
  }

  return result;
}

// ── Security: path traversal guard (CRITICAL-02) ────────────────────────

function validatePathWithinProject(filePath: string, projectRoot: string): boolean {
  const resolved = resolve(projectRoot, filePath);
  const resolvedRoot = resolve(projectRoot);
  const rel = relative(resolvedRoot, resolved);
  // Path traversal if relative path starts with .. or is absolute
  if (rel.startsWith("..") || resolve(rel) === rel) {
    return false;
  }
  return true;
}

// ── Safe file reader with path traversal guard (CRITICAL-02) ───────────

/**
 * Reads a file at filePath (optionally resolved under projectRoot),
 * rejecting paths that escape projectRoot via traversal.
 * Returns undefined if path traversal detected or file does not exist.
 */
function safeReadFile(filePath: string, projectRoot?: string): string | undefined {
  if (projectRoot && !validatePathWithinProject(filePath, projectRoot)) {
    return undefined;
  }
  const resolved = projectRoot ? resolve(projectRoot, filePath) : filePath;
  return existsSync(resolved) ? readFileSync(resolved, "utf-8") : undefined;
}

// ── Design rules lookup (FEAT-03a) ──────────────────────────────────────

const HARDCODED_DESIGN_RULES = `## Layout Rules
- Use consistent spacing between sections
- Maintain visual hierarchy with clear headings

## Color Rules
- Use sufficient contrast ratios (WCAG AA minimum)
- Limit palette to 3-5 primary colors

## Typography Rules
- Use no more than 2-3 font families
- Maintain readable line lengths (45-75 characters)

## Spacing Rules
- Use a consistent spacing scale (4px or 8px base)
- Ensure adequate whitespace between interactive elements

## Component Rules
- Keep components self-contained and reusable
- Use consistent border-radius and shadow values`;

/**
 * Looks up design rules using the 3-step fallback chain:
 * 1. Explicit designRulesPath from config
 * 2. <knowledgeDir>/design-rules.md
 * 3. Hardcoded minimal ruleset
 */
export function loadDesignRules(
  config: HiveMindConfig,
  dirs: PipelineDirs,
  projectRoot?: string,
): string {
  // Step 1: explicit config path
  if (config.designRulesPath) {
    const content = safeReadFile(config.designRulesPath, projectRoot);
    if (content !== undefined) return content;
  }

  // Step 2: knowledgeDir fallback
  const knowledgePath = join(dirs.knowledgeDir, "design-rules.md");
  if (existsSync(knowledgePath)) {
    return readFileSync(knowledgePath, "utf-8");
  }

  // Step 3: hardcoded fallback
  return HARDCODED_DESIGN_RULES;
}

// ── Questionnaire generation (FEAT-02) ──────────────────────────────────

const DEFAULT_QUESTIONNAIRE: QuestionnaireData = {
  style: "minimal",
  palette: {
    mode: "warm",
    custom_colors: [],
  },
  density: "balanced",
  layout: {
    structure: "sidebar-main",
  },
  font: "system",
  interactivity: "static",
};

/**
 * Generates design-questionnaire.yaml in workingDir/design/.
 * Reads design-system.md (if available) to extract CSS custom property defaults.
 * Security: validates designSystemPath within project bounds (CRITICAL-02).
 */
export async function generateQuestionnaire(
  dirs: PipelineDirs,
  config: HiveMindConfig,
  projectRoot?: string,
): Promise<string> {
  const designDir = join(dirs.workingDir, "design");
  mkdirSync(designDir, { recursive: true });

  const outputPath = join(designDir, "design-questionnaire.yaml");

  // Start from defaults
  const data: QuestionnaireData = JSON.parse(JSON.stringify(DEFAULT_QUESTIONNAIRE));

  // Try to read design-system.md
  let designSystemContent: string | undefined;

  if (config.designSystemPath) {
    designSystemContent = safeReadFile(config.designSystemPath, projectRoot);
  }

  // Fallback: try knowledgeDir
  if (!designSystemContent) {
    const knowledgeDsPath = join(dirs.knowledgeDir, "design-system.md");
    if (existsSync(knowledgeDsPath)) {
      designSystemContent = readFileSync(knowledgeDsPath, "utf-8");
    }
  }

  // If design-system.md found, extract CSS properties from fenced blocks
  if (designSystemContent) {
    const cssProps = extractCSSFromFencedBlocks(designSystemContent);
    const mapped = mapCSSToQuestionnaire(cssProps);

    if (mapped.style && ALLOWED_STYLE.includes(mapped.style)) data.style = mapped.style;
    if (mapped.paletteMode && ALLOWED_PALETTE_MODE.includes(mapped.paletteMode)) data.palette.mode = mapped.paletteMode;
    if (mapped.density) data.density = mapped.density;
    if (mapped.layout && ALLOWED_LAYOUT.includes(mapped.layout)) data.layout.structure = mapped.layout;
    if (mapped.font && ALLOWED_FONT.includes(mapped.font)) data.font = mapped.font;
    if (mapped.interactivity && ALLOWED_INTERACTIVITY.includes(mapped.interactivity)) data.interactivity = mapped.interactivity;
    if (mapped.customColors.length > 0) data.palette.custom_colors = mapped.customColors;
  }

  const yamlContent = stringify(data);
  writeFileSync(outputPath, yamlContent, "utf-8");

  return outputPath;
}

// ── Questionnaire validation (FEAT-02) ──────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a design-questionnaire.yaml file:
 * 1. YAML syntax is valid
 * 2. All 6 top-level fields exist
 * 3. Field values are within allowed enum sets
 */
export function validateQuestionnaireYaml(filePath: string): ValidationResult {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return { valid: false, error: `Cannot read file: ${filePath}` };
  }

  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `YAML parse error at ${filePath}: ${msg.split("\n")[0]}` };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { valid: false, error: "YAML content is not an object" };
  }

  const obj = parsed as Record<string, unknown>;

  // Check all 6 required top-level keys
  const requiredKeys = ["style", "palette", "density", "layout", "font", "interactivity"];
  for (const key of requiredKeys) {
    if (!(key in obj)) {
      return { valid: false, error: `Missing required field: ${key}` };
    }
  }

  // Validate enum values
  if (typeof obj.style === "string" && !ALLOWED_STYLE.includes(obj.style)) {
    return { valid: false, error: `Invalid style value: "${obj.style}". Allowed: ${ALLOWED_STYLE.join(", ")}` };
  }

  if (typeof obj.density === "string" && !ALLOWED_DENSITY.includes(obj.density)) {
    return { valid: false, error: `Invalid density value: "${obj.density}". Allowed: ${ALLOWED_DENSITY.join(", ")}` };
  }

  if (typeof obj.font === "string" && !ALLOWED_FONT.includes(obj.font)) {
    return { valid: false, error: `Invalid font value: "${obj.font}". Allowed: ${ALLOWED_FONT.join(", ")}` };
  }

  if (typeof obj.interactivity === "string" && !ALLOWED_INTERACTIVITY.includes(obj.interactivity)) {
    return { valid: false, error: `Invalid interactivity value: "${obj.interactivity}". Allowed: ${ALLOWED_INTERACTIVITY.join(", ")}` };
  }

  // Validate palette sub-object
  const palette = obj.palette;
  if (typeof palette === "object" && palette !== null) {
    const p = palette as Record<string, unknown>;
    if (typeof p.mode === "string" && !ALLOWED_PALETTE_MODE.includes(p.mode)) {
      return { valid: false, error: `Invalid palette.mode value: "${p.mode}". Allowed: ${ALLOWED_PALETTE_MODE.join(", ")}` };
    }
  }

  // Validate layout sub-object
  const layout = obj.layout;
  if (typeof layout === "object" && layout !== null) {
    const l = layout as Record<string, unknown>;
    if (typeof l.structure === "string" && !ALLOWED_LAYOUT.includes(l.structure)) {
      return { valid: false, error: `Invalid layout.structure value: "${l.structure}". Allowed: ${ALLOWED_LAYOUT.join(", ")}` };
    }
  }

  return { valid: true };
}

// ── Orphaned file cleanup (FEAT-04) ────────────────────────────────────

/**
 * Cleans up orphaned/truncated prototype files under a given size threshold.
 * Files smaller than 100 bytes are considered truncated and are removed.
 */
export function cleanupPartialOutput(designDir: string, filePattern: RegExp): void {
  if (!existsSync(designDir)) return;
  const files = readdirSync(designDir);
  for (const file of files) {
    if (!filePattern.test(file)) continue;
    const filePath = join(designDir, file);
    const stat = statSync(filePath);
    if (stat.size < 100) {
      unlinkSync(filePath);
    }
  }
}

// ── CSS custom property extraction from HTML style blocks (FEAT-05 Tier 2) ──

/**
 * Extracts CSS custom properties from <style> blocks in HTML content.
 * Targets -- prefixed properties (e.g., --primary-color: #fff).
 * Uses anchored regex with size limit (MEDIUM-01 mitigation).
 */
export function parseCSSCustomProperties(html: string): Map<string, string> {
  const props = new Map<string, string>();
  // Size limit to prevent ReDoS (MEDIUM-01)
  const safeHtml = html.slice(0, 200_000);
  const styleBlockRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = styleBlockRegex.exec(safeHtml)) !== null) {
    const block = blockMatch[1];
    const propRegex = /--([\w-]+)\s*:\s*([^;}\n]+)/g;
    let propMatch: RegExpExecArray | null;

    while ((propMatch = propRegex.exec(block)) !== null) {
      const name = propMatch[1].trim();
      const value = propMatch[2].trim().replace(/[\n\r]/g, "");
      props.set(name, value);
    }
  }

  return props;
}

// ── Token mapping from CSS properties (FEAT-05 Tier 2) ─────────────────

function mapPropertiesToTokens(cssProps: Map<string, string>): Partial<DesignTokens> {
  const tokens: Partial<DesignTokens> = {};

  // Colors
  const colors: Record<string, string> = {};
  const colorMapping: Record<string, string> = {
    "primary-color": "primary",
    "secondary-color": "secondary",
    "background-color": "background",
    "surface-color": "surface",
    "text-color": "text",
    "accent-color": "accent",
  };

  for (const [cssName, tokenName] of Object.entries(colorMapping)) {
    const value = cssProps.get(cssName);
    if (value) colors[tokenName] = value;
  }
  if (Object.keys(colors).length > 0) {
    tokens.colors = {
      primary: colors.primary ?? "",
      secondary: colors.secondary ?? "",
      background: colors.background ?? "",
      surface: colors.surface ?? "",
      text: colors.text ?? "",
      accent: colors.accent ?? "",
    };
  }

  // Typography
  const fontFamily = cssProps.get("font-family") ?? cssProps.get("font-family-primary");
  const headingSize = cssProps.get("heading-size") ?? cssProps.get("font-size-heading");
  const bodySize = cssProps.get("body-size") ?? cssProps.get("font-size-body");
  const lineHeight = cssProps.get("line-height");
  if (fontFamily || headingSize || bodySize || lineHeight) {
    tokens.typography = {
      fontFamily: fontFamily ?? "",
      headingSize: headingSize ?? "",
      bodySize: bodySize ?? "",
      lineHeight: lineHeight ?? "",
    };
  }

  // Spacing
  const spacingUnit = cssProps.get("spacing-unit") ?? cssProps.get("spacing-base");
  const spacingSmall = cssProps.get("spacing-small") ?? cssProps.get("spacing-sm");
  const spacingMedium = cssProps.get("spacing-medium") ?? cssProps.get("spacing-md");
  const spacingLarge = cssProps.get("spacing-large") ?? cssProps.get("spacing-lg");
  if (spacingUnit || spacingSmall || spacingMedium || spacingLarge) {
    tokens.spacing = {
      unit: spacingUnit ?? "",
      small: spacingSmall ?? "",
      medium: spacingMedium ?? "",
      large: spacingLarge ?? "",
    };
  }

  // Layout
  const maxWidth = cssProps.get("max-width") ?? cssProps.get("container-max-width");
  const gap = cssProps.get("grid-gap") ?? cssProps.get("gap");
  if (maxWidth || gap) {
    tokens.layout = {
      maxWidth: maxWidth ?? "",
      columns: 12,
      gap: gap ?? "",
    };
  }

  return tokens;
}

// ── Tier 3 fallback: derive tokens from questionnaire (FEAT-05) ────────

/**
 * Derives default design tokens from questionnaire data when Tier 1
 * (agent extraction) and Tier 2 (CSS parsing) both fail.
 * Returns all 4 required keys: colors, typography, spacing, layout.
 */
export function deriveTokensFromQuestionnaire(questionnaire: QuestionnaireData): DesignTokens {
  const paletteDefaults: Record<string, { primary: string; secondary: string; accent: string }> = {
    warm: { primary: "#D97706", secondary: "#92400E", accent: "#F59E0B" },
    cool: { primary: "#2563EB", secondary: "#1E40AF", accent: "#3B82F6" },
    neutral: { primary: "#6B7280", secondary: "#374151", accent: "#9CA3AF" },
    vibrant: { primary: "#7C3AED", secondary: "#4C1D95", accent: "#A78BFA" },
  };

  const fontDefaults: Record<string, string> = {
    system: "system-ui, -apple-system, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    "sans-serif": "'Helvetica Neue', Arial, sans-serif",
    monospace: "'Fira Code', 'Courier New', monospace",
  };

  const spacingDefaults: Record<string, { unit: string; small: string; medium: string; large: string }> = {
    compact: { unit: "4px", small: "4px", medium: "8px", large: "16px" },
    balanced: { unit: "8px", small: "8px", medium: "16px", large: "32px" },
    spacious: { unit: "12px", small: "12px", medium: "24px", large: "48px" },
  };

  const palette = paletteDefaults[questionnaire.palette.mode] ?? paletteDefaults.warm;
  const spacing = spacingDefaults[questionnaire.density] ?? spacingDefaults.balanced;

  return {
    colors: {
      primary: palette.primary,
      secondary: palette.secondary,
      background: "#FFFFFF",
      surface: "#F9FAFB",
      text: "#111827",
      accent: palette.accent,
    },
    typography: {
      fontFamily: fontDefaults[questionnaire.font] ?? fontDefaults.system,
      headingSize: "2rem",
      bodySize: "1rem",
      lineHeight: "1.5",
    },
    spacing,
    layout: {
      maxWidth: "1280px",
      columns: 12,
      gap: spacing.medium,
    },
  };
}

// ── Three-tier token extraction (FEAT-05) ──────────────────────────────

/**
 * Extracts design tokens using a 3-tier fallback:
 * Tier 1: Agent-based extraction (design-token-extractor)
 * Tier 2: parseCSSCustomProperties from approved HTML
 * Tier 3: deriveTokensFromQuestionnaire defaults
 */
export async function extractDesignTokens(
  approvedHtmlPath: string,
  questionnaire: QuestionnaireData,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  tracker?: CostTracker,
): Promise<DesignTokens> {
  const designDir = join(dirs.workingDir, "design");
  const outputPath = join(designDir, "design-tokens.json");

  // Tier 1: agent extraction
  try {
    const entry = AGENT_REGISTRY["design-token-extractor"];
    const agentConfig: AgentConfig = {
      type: "design-token-extractor",
      model: entry.modelTier,
      inputFiles: [approvedHtmlPath],
      outputFile: outputPath,
      rules: entry.rules,
      memoryContent: "",
      cwd: dirs.workingDir,
    };

    const result = await spawnAgentWithRetry(agentConfig, config);
    if (tracker && result.costUsd !== undefined) {
      tracker.recordAgentCost("design", "design-token-extractor", result.costUsd, result.durationMs);
    }

    if (result.success && existsSync(outputPath)) {
      const content = readFileSync(outputPath, "utf-8");
      const parsed = JSON.parse(content) as DesignTokens;
      if (parsed.colors && parsed.typography && parsed.spacing && parsed.layout) {
        return parsed;
      }
    }
  } catch {
    // Tier 1 failed, fall through to Tier 2
  }

  // Tier 2: CSS property parsing from approved HTML
  try {
    if (existsSync(approvedHtmlPath)) {
      const html = readFileSync(approvedHtmlPath, "utf-8");
      const cssProps = parseCSSCustomProperties(html);
      if (cssProps.size > 0) {
        const partial = mapPropertiesToTokens(cssProps);
        const fieldCount = [partial.colors, partial.typography, partial.spacing, partial.layout]
          .filter(Boolean).length;
        // Use Tier 2 result if at least 50% of fields (2 of 4) are populated
        if (fieldCount >= 2) {
          const fallback = deriveTokensFromQuestionnaire(questionnaire);
          const tokens: DesignTokens = {
            colors: partial.colors ?? fallback.colors,
            typography: partial.typography ?? fallback.typography,
            spacing: partial.spacing ?? fallback.spacing,
            layout: partial.layout ?? fallback.layout,
          };
          writeFileSync(outputPath, JSON.stringify(tokens, null, 2), "utf-8");
          return tokens;
        }
      }
    }
  } catch {
    // Tier 2 failed, fall through to Tier 3
  }

  // Tier 3: questionnaire-based defaults
  const tokens = deriveTokensFromQuestionnaire(questionnaire);
  writeFileSync(outputPath, JSON.stringify(tokens, null, 2), "utf-8");
  return tokens;
}

// ── Shared instruction block builder (used by spawnPrototype + spawnSideBySide) ─

function buildBaseInstructionBlocks(
  designRules: string,
  previousFeedback: string[],
): Array<{ heading: string; content: string }> {
  const blocks: Array<{ heading: string; content: string }> = [
    { heading: "Design Rules", content: designRules },
  ];
  if (previousFeedback.length > 0) {
    blocks.push({
      heading: "Previous Rejection Feedback",
      content: previousFeedback.join("\n---\n"),
    });
  }
  return blocks;
}

// ── Prototype generation (FEAT-03) ─────────────────────────────────────

/** Output filename for the first prototype iteration (§FEAT-03, SC-03). */
export const INITIAL_PROTOTYPE_FILE = "prototype-v1.html";

interface PrototypeRecord {
  file: string;
  iteration: number;
  feedback: string;
}

/**
 * Spawns a single prototype agent to generate an HTML prototype file.
 */
export async function spawnPrototype(
  outputFileName: string,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  questionnairePath: string,
  designRules: string,
  prdPath: string,
  previousFeedback: string[],
  tracker?: CostTracker,
): Promise<boolean> {
  const designDir = join(dirs.workingDir, "design");
  mkdirSync(designDir, { recursive: true });
  const outputPath = join(designDir, outputFileName);

  const entry = AGENT_REGISTRY["design-prototype"];
  const instructionBlocks = buildBaseInstructionBlocks(designRules, previousFeedback);

  const agentConfig: AgentConfig = {
    type: "design-prototype",
    model: entry.modelTier,
    inputFiles: [questionnairePath, prdPath],
    outputFile: outputPath,
    rules: entry.rules,
    instructionBlocks,
    memoryContent: "",
    cwd: dirs.workingDir,
  };

  const result = await spawnAgentWithRetry(agentConfig, config);
  if (tracker && result.costUsd !== undefined) {
    tracker.recordAgentCost("design", "design-prototype", result.costUsd, result.durationMs);
  }

  if (!result.success && result.error) {
    try {
      const logDir = join(dirs.workingDir, "logs");
      mkdirSync(logDir, { recursive: true });
      appendFileSync(
        join(logDir, "design-agent-error.log"),
        `${new Date().toISOString()} [design-prototype] ${result.error}\n`,
      );
    } catch { /* non-fatal */ }
  }

  return result.success && existsSync(outputPath);
}

// ── Side-by-side generation (FEAT-04) ──────────────────────────────────

/**
 * Spawns two prototype agents in parallel for side-by-side comparison.
 * Returns paths to the generated files (only files that exist and are non-truncated).
 */
export async function spawnSideBySide(
  iteration: number,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  questionnairePath: string,
  designRules: string,
  prdPath: string,
  previousFeedback: string[],
  tracker?: CostTracker,
): Promise<{ pathA: string | null; pathB: string | null }> {
  const designDir = join(dirs.workingDir, "design");
  mkdirSync(designDir, { recursive: true });

  const fileA = `prototype-v${iteration}-a.html`;
  const fileB = `prototype-v${iteration}-b.html`;
  const pathA = join(designDir, fileA);
  const pathB = join(designDir, fileB);

  const entry = AGENT_REGISTRY["design-prototype"];
  const instructionBlocks = buildBaseInstructionBlocks(designRules, previousFeedback);

  const configA: AgentConfig = {
    type: "design-prototype",
    model: entry.modelTier,
    inputFiles: [questionnairePath, prdPath],
    outputFile: pathA,
    rules: entry.rules,
    instructionBlocks: [
      ...instructionBlocks,
      { heading: "Variant", content: "Generate variant A — explore a distinct visual direction." },
    ],
    memoryContent: "",
    cwd: dirs.workingDir,
  };

  const configB: AgentConfig = {
    type: "design-prototype",
    model: entry.modelTier,
    inputFiles: [questionnairePath, prdPath],
    outputFile: pathB,
    rules: entry.rules,
    instructionBlocks: [
      ...instructionBlocks,
      { heading: "Variant", content: "Generate variant B — explore a contrasting visual direction." },
    ],
    memoryContent: "",
    cwd: dirs.workingDir,
  };

  const results = await spawnAgentsParallel([configA, configB], config);

  if (tracker) {
    for (const result of results) {
      if (result.costUsd !== undefined) {
        tracker.recordAgentCost("design", "design-prototype", result.costUsd, result.durationMs);
      }
    }
  }

  // Clean up orphaned/truncated files
  cleanupPartialOutput(designDir, /^prototype-v\d+-[ab]\.html$/);

  return {
    pathA: existsSync(pathA) && statSync(pathA).size >= 100 ? pathA : null,
    pathB: existsSync(pathB) && statSync(pathB).size >= 100 ? pathB : null,
  };
}

// ── A/B selection parsing (FEAT-04) ────────────────────────────────────

/**
 * Parses user feedback for side-by-side selection.
 * Exact match of "a" or "b" (case-insensitive, trimmed) selects that variant.
 * Anything else is treated as rejection feedback.
 */
export function parseSideBySideSelection(feedback: string): { selected: "a" | "b" | null; isRejection: boolean } {
  const trimmed = feedback.trim().toLowerCase();
  if (trimmed === "a") return { selected: "a", isRejection: false };
  if (trimmed === "b") return { selected: "b", isRejection: false };
  return { selected: null, isRejection: true };
}

// ── Rejection iteration tracking (FEAT-04) ─────────────────────────────

/**
 * Handles rejection iteration logic for the prototype approval loop.
 * Returns true if the rejection limit has been reached and the loop should halt.
 * Increments rejectionIterationCount and records feedback to generatedPrototypes.
 */
export function handlePrototypeRejection(
  rejectionIterationCount: number,
  feedback: string,
  generatedPrototypes: PrototypeRecord[],
  lastPrototypeFile: string,
  iteration: number,
): { shouldHalt: boolean; updatedCount: number } {
  const updatedCount = rejectionIterationCount + 1;

  generatedPrototypes.push({
    file: lastPrototypeFile,
    iteration,
    feedback,
  });

  if (updatedCount >= 3) {
    return { shouldHalt: true, updatedCount };
  }

  return { shouldHalt: false, updatedCount };
}

/**
 * Handles rejection for the side-by-side flow.
 * Increments rejectionIterationCount and records both alternatives.
 */
export function handleSideBySideRejection(
  rejectionIterationCount: number,
  feedback: string,
  generatedPrototypes: PrototypeRecord[],
  fileA: string | null,
  fileB: string | null,
  iteration: number,
): { shouldHalt: boolean; updatedCount: number } {
  const updatedCount = rejectionIterationCount + 1;

  if (fileA) {
    generatedPrototypes.push({ file: fileA, iteration, feedback });
  }
  if (fileB) {
    generatedPrototypes.push({ file: fileB, iteration, feedback });
  }

  if (updatedCount >= 3) {
    return { shouldHalt: true, updatedCount };
  }

  return { shouldHalt: false, updatedCount };
}

// ── Main design stage entry point (FEAT-08) ────────────────────────────

/**
 * Runs the full design stage: UI detection, questionnaire, prototype generation,
 * rejection loop, token extraction, and SPEC handoff.
 */
export async function runDesignStage(
  dirs: PipelineDirs,
  config: HiveMindConfig,
  tracker?: CostTracker,
): Promise<void> {
  const logPath = join(dirs.workingDir, "manager-log.jsonl");
  const checkpointDir = dirs.workingDir;
  const designDir = join(dirs.workingDir, "design");
  mkdirSync(designDir, { recursive: true });

  // Log design start
  appendLogEntry(logPath, createLogEntry("DESIGN_START", { reason: "Design stage initiated" }));

  // Step 1: Read normalized PRD and detect UI keywords
  const normalizedPrdPath = join(dirs.workingDir, "normalize", "normalized-prd.md");
  if (!existsSync(normalizedPrdPath)) {
    appendLogEntry(logPath, createLogEntry("DESIGN_SKIPPED", { reason: "No normalized PRD found" }));
    writeCheckpoint(checkpointDir, {
      awaiting: "approve-design-skip",
      message: "No normalized PRD found. Skip design stage?",
      timestamp: new Date().toISOString(),
      feedback: null,
      metadata: { customMessage: "No normalized PRD found — design stage will be skipped." },
    });
    return;
  }

  const prdContent = readFileSync(normalizedPrdPath, "utf-8");
  const hasUI = detectUIKeywords(prdContent);
  const detectedKeywords = UI_KEYWORDS.filter((kw) => {
    const pattern = new RegExp(`\\b${kw.replace(/\s+/g, "\\s+")}\\b`, "i");
    return pattern.test(prdContent);
  });

  // Always ask the user whether design is needed (keyword detection is a hint, not a gate)
  const hint = hasUI
    ? `UI keywords detected: ${detectedKeywords.join(", ")} — design recommended`
    : "No UI keywords detected — skip recommended";
  appendLogEntry(logPath, createLogEntry("DESIGN_CHOICE_PENDING", { reason: hint }));
  writeCheckpoint(checkpointDir, {
    awaiting: "approve-design-skip",
    message: hint,
    timestamp: new Date().toISOString(),
    feedback: null,
    metadata: { customMessage: `${hint}. Approve to skip design, or reject with feedback to enter design flow.`, detectedKeywords },
  });
  console.log(`[design] ${hint}. Awaiting user decision.`);
  return;

  // Step 2: Generate questionnaire (reached only via approve-design-skip rejection in orchestrator)
  const questionnairePath = await generateQuestionnaire(dirs, config, dirs.workingDir);
  appendLogEntry(logPath, createLogEntry("DESIGN_QUESTIONNAIRE_COMPLETE", {
    reason: `Questionnaire generated at ${questionnairePath}`,
  }));

  // Write checkpoint for user to review/edit the questionnaire
  writeCheckpoint(checkpointDir, {
    awaiting: "approve-design-questionnaire",
    message: "Review and edit the design questionnaire, then approve.",
    timestamp: new Date().toISOString(),
    feedback: null,
    metadata: {
      customMessage: `Review and edit the design questionnaire at ${questionnairePath}, then approve.`,
    },
  });

  // Note: In the actual pipeline, the orchestrator resumes from this checkpoint.
  // The remaining steps (prototype generation, token extraction) run after
  // the user approves the questionnaire. For the stage function itself,
  // we return here and let the orchestrator handle resume flow.
}
