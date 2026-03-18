export type ModelTier = "opus" | "sonnet" | "haiku";

export type AgentType =
  | "researcher"
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
  | "integration-verifier"
  | "diagnostician-bug"
  | "workspace-cleanup"
  | "normalizer";

export interface AgentConfig {
  type: AgentType;
  model: ModelTier;
  inputFiles: string[];
  outputFile: string;
  rules: string[];
  instructionBlocks?: Array<{ heading: string; content: string }>;
  memoryContent: string;
  roleReportContents?: string;
  cwd?: string;
  scratchDir?: string;
  constitutionContent?: string;
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
