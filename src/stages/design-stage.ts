import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { stringify, parse } from "yaml";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { QuestionnaireData } from "../types/design.js";

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
