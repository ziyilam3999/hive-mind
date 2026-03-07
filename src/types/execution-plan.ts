export type StoryStatus = "not-started" | "in-progress" | "passed" | "failed";
export type Complexity = "low" | "medium" | "high";
export type RoleName = "analyst" | "reviewer" | "security" | "architect" | "tester";

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
}

export interface ExecutionPlan {
  schemaVersion: string;
  prdPath: string;
  specPath: string;
  stories: Story[];
}
