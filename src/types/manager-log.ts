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
  | "BUG_FIX_EXHAUSTED"
  | "BUILD_RETRY"
  | "BUILD_RETRY_EXHAUSTED"
  | "PIPELINE_START"
  | "SPEC_START"
  | "PLAN_START"
  | "EXECUTE_START"
  | "WAVE_START"
  | "WAVE_COMPLETE"
  | "REGISTRY_GAP_FIXED"
  | "PREFLIGHT_PAUSE";

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
  prdPath?: string;
  stopAfterPlan?: boolean;
  budget?: number;
  greenfield?: boolean;
  waveNumber?: number;
  registryFile?: string;
}
