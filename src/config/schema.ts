import type { AgentType, ModelTier } from "../types/agents.js";

export interface HiveMindConfig {
  agentTimeout: number;
  shellTimeout: number;
  toolingDetectTimeout: number;
  maxRetries: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  memoryWordCap: number;
  memoryGraduationThreshold: number;
  graduationMinDates: number;
  graduationMinStoryRefs: number;
  kbSizeWarningWords: number;
  reportExcerptLength: number;
  modelAssignments: Record<string, ModelTier>;
}

export const DEFAULT_MODEL_ASSIGNMENTS: Record<AgentType, ModelTier> = {
  "researcher": "opus",
  "justifier": "opus",
  "spec-drafter": "opus",
  "critic": "sonnet",
  "spec-corrector": "opus",
  "tooling-setup": "sonnet",
  "analyst": "opus",
  "reviewer": "sonnet",
  "security": "sonnet",
  "architect": "opus",
  "tester-role": "sonnet",
  "synthesizer": "opus",
  "implementer": "opus",
  "refactorer": "sonnet",
  "tester-exec": "haiku",
  "evaluator": "haiku",
  "diagnostician": "sonnet",
  "fixer": "sonnet",
  "learner": "haiku",
  "reporter": "haiku",
  "retrospective": "sonnet",
};

export const DEFAULT_CONFIG: HiveMindConfig = {
  agentTimeout: 600_000,
  shellTimeout: 120_000,
  toolingDetectTimeout: 30_000,
  maxRetries: 1,
  maxAttempts: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 16_000,
  memoryWordCap: 400,
  memoryGraduationThreshold: 300,
  graduationMinDates: 1,
  graduationMinStoryRefs: 2,
  kbSizeWarningWords: 5000,
  reportExcerptLength: 200,
  modelAssignments: { ...DEFAULT_MODEL_ASSIGNMENTS },
};
