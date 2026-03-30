import { DEFAULT_CONFIG } from "./schema.js";
import type { HiveMindConfig } from "./schema.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import type { ModelTier } from "../types/agents.js";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const CONFIG_FILENAME = ".hivemindrc.json";

export function getDefaultConfig(): HiveMindConfig {
  return { ...DEFAULT_CONFIG, modelAssignments: { ...DEFAULT_CONFIG.modelAssignments } };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, errors: ["Config must be a JSON object"], warnings };
  }

  const obj = raw as Record<string, unknown>;
  const knownKeys = new Set([...Object.keys(DEFAULT_CONFIG), "workingDir", "knowledgeDir", "labDir"]);

  for (const key of Object.keys(obj)) {
    if (!knownKeys.has(key)) {
      warnings.push(`Unknown config key: "${key}"`);
    }
  }

  const positiveNumbers: Array<keyof HiveMindConfig> = [
    "agentTimeout",
    "shellTimeout",
    "toolingDetectTimeout",
    "maxConcurrency",
    "memoryWordCap",
    "memoryGraduationThreshold",
    "kbSizeWarningWords",
    "reportExcerptLength",
    "retryBaseDelayMs",
    "retryMaxDelayMs",
  ];

  for (const key of positiveNumbers) {
    if (key in obj) {
      const val = obj[key];
      if (typeof val !== "number" || val <= 0) {
        errors.push(`${key} must be a positive number, got: ${JSON.stringify(val)}`);
      }
    }
  }

  const nonNegativeIntegers: Array<keyof HiveMindConfig> = [
    "maxRetries",
    "maxAttempts",
    "graduationMinDates",
    "graduationMinStoryRefs",
  ];

  for (const key of nonNegativeIntegers) {
    if (key in obj) {
      const val = obj[key];
      if (typeof val !== "number" || val < 0 || !Number.isInteger(val)) {
        errors.push(`${key} must be a non-negative integer, got: ${JSON.stringify(val)}`);
      }
    }
  }

  if ("skipNormalize" in obj && typeof obj.skipNormalize !== "boolean") {
    errors.push("skipNormalize must be a boolean");
  }

  if ("liveReport" in obj && typeof obj.liveReport !== "boolean") {
    errors.push("liveReport must be a boolean");
  }

  for (const dirKey of ["workingDir", "knowledgeDir", "labDir"] as const) {
    if (dirKey in obj && typeof obj[dirKey] !== "string") {
      errors.push(`${dirKey} must be a string, got: ${JSON.stringify(obj[dirKey])}`);
    }
  }

  if ("modelAssignments" in obj) {
    const ma = obj.modelAssignments;
    if (typeof ma !== "object" || ma === null || Array.isArray(ma)) {
      errors.push("modelAssignments must be an object");
    } else {
      const validModels = new Set(["opus", "sonnet", "haiku"]);
      for (const [agent, model] of Object.entries(ma as Record<string, unknown>)) {
        if (typeof model !== "string" || !validModels.has(model)) {
          errors.push(`modelAssignments.${agent} must be "opus", "sonnet", or "haiku", got: ${JSON.stringify(model)}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function findConfigFile(startDir: string): string | undefined {
  let dir = resolve(startDir);
  const root = resolve("/");

  while (true) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir || dir === root) return undefined;
    dir = parent;
  }
}

export function resolvePipelineDirs(config: HiveMindConfig, cwd: string): PipelineDirs {
  const resolvePath = (p: string) => isAbsolute(p) ? p : resolve(cwd, p);
  return {
    workingDir: resolvePath(config.workingDir ?? ".hive-mind-working"),
    knowledgeDir: resolvePath(config.knowledgeDir ?? "../.hive-mind-persist"),
    labDir: resolvePath(config.labDir ?? ".hive-mind-lab"),
  };
}

export function loadConstitution(knowledgeDir: string): string | undefined {
  const constitutionPath = join(knowledgeDir, "constitution.md");
  if (!existsSync(constitutionPath)) return undefined;
  const constitutionContent = readFileSync(constitutionPath, "utf-8").trim();
  return constitutionContent || undefined;
}

export function loadConfig(projectRoot: string): HiveMindConfig {
  const defaults = getDefaultConfig();
  const configPath = findConfigFile(projectRoot);

  if (!configPath) return defaults;

  let raw: unknown;
  try {
    const content = readFileSync(configPath, "utf-8");
    raw = JSON.parse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse ${configPath}: ${msg}`);
  }

  const validation = validateConfig(raw);

  for (const warning of validation.warnings) {
    console.warn(`Config warning (${configPath}): ${warning}`);
  }

  if (!validation.valid) {
    throw new Error(
      `Invalid config in ${configPath}:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  const obj = raw as Record<string, unknown>;

  // Deep merge: modelAssignments merges with defaults, other keys override
  const modelAssignments: Record<string, ModelTier> = typeof obj.modelAssignments === "object" && obj.modelAssignments !== null
    ? { ...defaults.modelAssignments, ...(obj.modelAssignments as Record<string, ModelTier>) }
    : { ...defaults.modelAssignments };

  return {
    agentTimeout: (obj.agentTimeout as number | undefined) ?? defaults.agentTimeout,
    shellTimeout: (obj.shellTimeout as number | undefined) ?? defaults.shellTimeout,
    toolingDetectTimeout: (obj.toolingDetectTimeout as number | undefined) ?? defaults.toolingDetectTimeout,
    maxRetries: (obj.maxRetries as number | undefined) ?? defaults.maxRetries,
    maxAttempts: (obj.maxAttempts as number | undefined) ?? defaults.maxAttempts,
    maxBuildAttempts: (obj.maxBuildAttempts as number | undefined) ?? defaults.maxBuildAttempts,
    maxConcurrency: (obj.maxConcurrency as number | undefined) ?? defaults.maxConcurrency,
    retryBaseDelayMs: (obj.retryBaseDelayMs as number | undefined) ?? defaults.retryBaseDelayMs,
    retryMaxDelayMs: (obj.retryMaxDelayMs as number | undefined) ?? defaults.retryMaxDelayMs,
    memoryWordCap: (obj.memoryWordCap as number | undefined) ?? defaults.memoryWordCap,
    memoryGraduationThreshold: (obj.memoryGraduationThreshold as number | undefined) ?? defaults.memoryGraduationThreshold,
    graduationMinDates: (obj.graduationMinDates as number | undefined) ?? defaults.graduationMinDates,
    graduationMinStoryRefs: (obj.graduationMinStoryRefs as number | undefined) ?? defaults.graduationMinStoryRefs,
    kbSizeWarningWords: (obj.kbSizeWarningWords as number | undefined) ?? defaults.kbSizeWarningWords,
    reportExcerptLength: (obj.reportExcerptLength as number | undefined) ?? defaults.reportExcerptLength,
    baselineBuildCommand: (obj.baselineBuildCommand as string | undefined) ?? defaults.baselineBuildCommand,
    baselineTestCommand: (obj.baselineTestCommand as string | undefined) ?? defaults.baselineTestCommand,
    skipNormalize: (obj.skipNormalize as boolean | undefined) ?? defaults.skipNormalize,
    liveReport: (obj.liveReport as boolean | undefined) ?? defaults.liveReport,
    modelAssignments,
    workingDir: (obj.workingDir as string | undefined) ?? undefined,
    knowledgeDir: (obj.knowledgeDir as string | undefined) ?? undefined,
    labDir: (obj.labDir as string | undefined) ?? undefined,
    designSystemPath: (obj.designSystemPath as string | undefined) ?? defaults.designSystemPath,
    designRulesPath: (obj.designRulesPath as string | undefined) ?? defaults.designRulesPath,
  };
}
