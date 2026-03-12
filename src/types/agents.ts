export type ModelTier = "opus" | "sonnet" | "haiku";

export type AgentType =
  | "researcher"
  | "justifier"
  | "spec-drafter"
  | "critic"
  | "spec-corrector"
  | "tooling-setup"
  | "analyst"
  | "reviewer"
  | "security"
  | "architect"
  | "tester-role"
  | "synthesizer"
  | "implementer"
  | "refactorer"
  | "tester-exec"
  | "evaluator"
  | "diagnostician"
  | "fixer"
  | "learner"
  | "reporter"
  | "retrospective";

export interface AgentConfig {
  type: AgentType;
  model: ModelTier;
  inputFiles: string[];
  outputFile: string;
  rules: string[];
  memoryContent: string;
}

export interface AgentResult {
  success: boolean;
  outputFile: string;
  error?: string;
  costUsd?: number;
  modelUsed?: string;
  sessionId?: string;
  durationMs?: number;
}
