export type ReportStatus = "PASS" | "FAIL";
export type EvalVerdict = "PASS" | "FAIL";
export type RefactorStatus = "PASS" | "SKIP";

export interface ImplReport {
  storyId: string;
  status: ReportStatus;
  filesCreated: { file: string; lines: number; exports: string[] }[];
  designDecisions: { decision: string; rationale: string }[];
  outputContractVerification: {
    requiredExport: string;
    present: boolean;
    location: string;
  }[];
  timestamp: string;
}

export interface RefactorReport {
  storyId: string;
  status: RefactorStatus;
  changes: { file: string; change: string; rationale: string }[];
  qualityImprovements: { before: string; after: string }[];
  timestamp: string;
}

export interface ACResult {
  acId: string;
  description: string;
  command: string;
  output: string;
  result: ReportStatus;
}

export interface TestReport {
  storyId: string;
  status: ReportStatus;
  results: ACResult[];
  summary: { total: number; passed: number; failed: number };
  timestamp: string;
}

export interface ECResult {
  ecId: string;
  description: string;
  specRef: string;
  command: string;
  output: string;
  result: ReportStatus;
}

export interface EvalReport {
  storyId: string;
  verdict: EvalVerdict;
  results: ECResult[];
  summary: { total: number; passed: number; failed: number };
  blockingIssues: { ec: string; issue: string; specViolation: string }[];
  timestamp: string;
}

export interface DiagnosisReport {
  storyId: string;
  attempt: number;
  failingACs: { acId: string; description: string; observedOutput: string }[];
  rootCause: { symptom: string; cause: string; evidence: string };
  previousAttempts: {
    attempt: number;
    whatWasTried: string;
    whyItFailed: string;
  }[];
  recommendedFix: { files: string[]; change: string; risk: string };
  timestamp: string;
}

export interface FixReport {
  storyId: string;
  attempt: number;
  escalated: boolean;
  fixesApplied: { index: number; file: string; description: string }[];
  acFixMapping: { ac: string; issue: string; fix: string }[];
  diagnosisReference: string | null;
  previousAttempts: { attempt: number; fixApplied: string; result: string }[];
  tscOutput: string;
  timestamp: string;
}

export interface LearningReport {
  storyId: string;
  whatWorked: string[];
  whatFailed: string[];
  whatWasSurprising: string[];
  whatToDoDifferently: string[];
  eli5Summary: string;
  timestamp: string;
}

export interface RoleReport {
  role: string;
  findings: string[];
  recommendations: string[];
  risksIdentified: { risk: string; severity: string; mitigation: string }[];
  timestamp: string;
}

export interface ResearchReport {
  prdAnalysis: { keyRequirements: string[]; implementationItems: string[] };
  codebaseAnalysis: {
    relevantFiles: string[];
    existingPatterns: string[];
    dependencies: string[];
  };
  designEvidence: {
    provenPatterns: string[];
    antiPatterns: string[];
    designConstraints: string[];
    enforcementTiers: string[];
  };
  gapsAndRisks: string[];
  timestamp: string;
}

export interface CritiqueReport {
  round: number;
  strategicIssues: {
    index: number;
    issue: string;
    severity: string;
    recommendation: string;
  }[];
  tacticalIssues: {
    index: number;
    issue: string;
    severity: string;
    recommendation: string;
  }[];
  structuralChecks: {
    outOfScopeExists: boolean;
    requiredToolingExists: boolean;
    traceabilityComplete: boolean;
    allDecisionsHaveRationale: boolean;
    contractsAreExact: boolean;
  };
  overallAssessment: string;
  timestamp: string;
}

export interface ConsolidatedReport {
  progress: { status: string; count: number }[];
  storyStatus: {
    id: string;
    title: string;
    status: string;
    attempts: number;
    committed: boolean;
    verdict: string;
  }[];
  verificationSummary: { check: string; result: string }[];
  fixLog: { story: string; attempt: number; issue: string; fix: string }[];
  eli5Summary: string;
  timestamp: string;
}

export interface RetrospectiveReport {
  synthesizedLearnings: string[];
  patternsDetected: {
    pattern: string;
    frequency: number;
    stories: string[];
    action: string;
  }[];
  mistakesToAvoid: string[];
  thingsThatWorkedWell: string[];
  keyInsightsForMemory: string[];
  timestamp: string;
}
