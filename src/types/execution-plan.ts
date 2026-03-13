export type StoryStatus = "not-started" | "in-progress" | "passed" | "failed" | "skipped";
export type SubTaskStatus = "not-started" | "in-progress" | "passed" | "failed";
export type Complexity = "low" | "medium" | "high";
export type RoleName = "analyst" | "reviewer" | "security" | "architect" | "tester-role";

export interface SubTask {
  id: string;                    // e.g., "US-01.1", "US-01.2"
  title: string;
  targetFiles: string[];         // subset of story.sourceFiles
  acceptanceCriteria: string[];  // subset of story's ACs
  exitCriteria: string[];        // subset of story's ECs
  status: SubTaskStatus;
  attempts: number;
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
  subTasks?: SubTask[];          // only for complexity: "high"
}

export interface ExecutionPlan {
  schemaVersion: string;
  prdPath: string;
  specPath: string;
  stories: Story[];
}
