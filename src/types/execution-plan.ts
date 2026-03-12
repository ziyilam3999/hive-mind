export type StoryStatus = "not-started" | "in-progress" | "passed" | "failed" | "skipped";
export type Complexity = "low" | "medium" | "high";
export type RoleName = "analyst" | "reviewer" | "security" | "architect" | "tester-role";

export interface Story {
  id: string;
  title: string;
  specSections: string[];
  dependencies: string[];
  sourceFiles: string[];
  complexity: Complexity;
  rolesUsed: RoleName[];
  stepFile: string;
  status: StoryStatus;
  attempts: number;
  maxAttempts: number;
  committed: boolean;
  commitHash: string | null;
  errorMessage?: string;
  lastFailedStage?: string;
  securityRisk?: string;
  complexityJustification?: string;
  dependencyImpact?: string;
}

export interface ExecutionPlan {
  schemaVersion: string;
  prdPath: string;
  specPath: string;
  stories: Story[];
}
