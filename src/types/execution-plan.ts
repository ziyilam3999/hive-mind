export type StoryStatus = "not-started" | "in-progress" | "passed" | "failed" | "skipped";
export type Complexity = "low" | "medium" | "high";
export type RoleName = "analyst" | "reviewer" | "security" | "architect" | "tester-role";

export type SubTaskStatus = "not-started" | "in-progress" | "passed" | "failed";

export interface SubTask {
  id: string;
  title: string;
  description: string;
  sourceFiles: string[];
  status: SubTaskStatus;
  attempts: number;
  maxAttempts: number;
}

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
  subTasks?: SubTask[];
}

export interface ExecutionPlan {
  schemaVersion: string;
  prdPath: string;
  specPath: string;
  stories: Story[];
}
