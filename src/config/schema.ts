import type { ModelTier } from "../types/agents.js";
import { AGENT_MODEL_MAP } from "../agents/registry.js";

export interface HiveMindConfig {
  agentTimeout: number;
  shellTimeout: number;
  toolingDetectTimeout: number;
  maxRetries: number;
  maxAttempts: number;
  maxBuildAttempts: number;
  maxConcurrency: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  memoryWordCap: number;
  memoryGraduationThreshold: number;
  graduationMinDates: number;
  graduationMinStoryRefs: number;
  kbSizeWarningWords: number;
  reportExcerptLength: number;
  baselineBuildCommand: string;
  baselineTestCommand: string;
  modelAssignments: Record<string, ModelTier>;
  workingDir?: string;
  knowledgeDir?: string;
  skipNormalize: boolean;
  liveReport: boolean;
  labDir?: string;
}

/** Derived from the central AGENT_REGISTRY — kept as a named export for backward compatibility. */
export const DEFAULT_MODEL_ASSIGNMENTS = { ...AGENT_MODEL_MAP };

export const DEFAULT_CONFIG: HiveMindConfig = {
  agentTimeout: 600_000,
  shellTimeout: 120_000,
  toolingDetectTimeout: 30_000,
  maxRetries: 1,
  maxAttempts: 3,
  maxBuildAttempts: 2,
  maxConcurrency: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 16_000,
  memoryWordCap: 400,
  memoryGraduationThreshold: 300,
  graduationMinDates: 1,
  graduationMinStoryRefs: 2,
  kbSizeWarningWords: 5000,
  reportExcerptLength: 200,
  baselineBuildCommand: "npm run build",
  baselineTestCommand: "npm test",
  skipNormalize: false,
  liveReport: true,
  modelAssignments: { ...DEFAULT_MODEL_ASSIGNMENTS },
};
