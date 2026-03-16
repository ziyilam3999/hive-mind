export type StoryStatus = "not-started" | "in-progress" | "passed" | "failed" | "skipped";
export type Complexity = "low" | "medium" | "high";
export type RoleName = "analyst" | "reviewer" | "security" | "architect" | "tester-role";
export type ChangeType = "ADDED" | "MODIFIED" | "REMOVED";

export interface SourceFileEntry {
  path: string;
  changeType: ChangeType;
}

/** Extract file paths from sourceFiles (handles both string[] and SourceFileEntry[] formats) */
export function getSourceFilePaths(sourceFiles: Array<string | SourceFileEntry>): string[] {
  return sourceFiles.map((f) => typeof f === "string" ? f : f.path);
}

export type SubTaskStatus = "not-started" | "in-progress" | "passed" | "failed";

export interface SubTask {
  id: string;
  title: string;
  description: string;
  sourceFiles: Array<string | SourceFileEntry>;
  status: SubTaskStatus;
  attempts: number;
  maxAttempts: number;
}

export interface Story {
  id: string;
  title: string;
  specSections: string[];
  dependencies: string[];
  sourceFiles: Array<string | SourceFileEntry>;
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
  moduleId?: string;
}

export interface ExecutionPlan {
  schemaVersion: string;
  prdPath: string;
  specPath: string;
  stories: Story[];
  modules?: import("./module.js").Module[];
}
