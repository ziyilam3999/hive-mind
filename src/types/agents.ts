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
  | "retrospective"
  | "planner"
  | "ac-generator"
  | "ec-generator"
  | "code-reviewer"
  | "log-summarizer"
  | "enricher"
  | "compliance-reviewer"
  | "compliance-fixer"
  | "decomposer"
  | "integration-verifier";

export interface AgentConfig {
  type: AgentType;
  model: ModelTier;
  inputFiles: string[];
  outputFile: string;
  rules: string[];
  memoryContent: string;
  roleReportContents?: string;
  cwd?: string;
  scratchDir?: string;
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
