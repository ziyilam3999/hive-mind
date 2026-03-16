export type LogAction =
  | "COMPLETED"
  | "COMMITTED"
  | "FAILED"
  | "COMMIT_FAILED"
  | "TOOLING_VERIFIED"
  | "TOOLING_INSTALLED"
  | "TOOLING_SETUP_FAILED"
  | "SPEC_COMPLETE"
  | "PLAN_COMPLETE"
  | "BUILD_COMPLETE"
  | "VERIFY_ATTEMPT"
  | "COMMIT_COMPLETE"
  | "EVAL_ATTEMPT"
  | "FIX_UNVERIFIED"
  | "COMPLIANCE_CHECK"
  | "COMPLIANCE_FIX"
  | "DIAGNOSE_COMPLETE"
  | "FIX_COMPLETE"
  | "VERIFY_COMPLETE"
  | "BUG_FIX_COMPLETE"
  | "BUG_FIX_EXHAUSTED";

export interface ManagerLogEntry {
  timestamp: string;
  cycle: number;
  storyId: string | null;
  action: LogAction;
  reason: string | null;
  testResults?: { total: number; passed: number; failed: number };
  evalVerdict?: string;
  fixApplied?: boolean;
  attempt?: number;
  commitHash?: string;
  files?: string[];
  tool?: string;
  version?: string;
  agent?: string;
  report?: string;
  artifactCount?: number;
  storyCount?: number;
  storyIds?: string[];
  parsedStatus?: string;
  parserConfidence?: "structured" | "matched" | "default";
  rawExcerpt?: string;
  error?: string;
  evalParsedStatus?: string;
  evalParserConfidence?: "structured" | "matched" | "default";
  passed?: boolean;
  missing?: number;
  done?: number;
  confidence?: string;
  shouldEscalate?: boolean;
  attempts?: number;
}
