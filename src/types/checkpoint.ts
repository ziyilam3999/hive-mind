export type CheckpointType =
  | "approve-normalize"
  | "approve-spec"
  | "approve-plan"
  | "approve-integration"
  | "approve-diagnosis"
  | "approve-preflight"
  | "approve-usage-limit"
  | "verify"
  | "ship"
  | "approve-design-skip"
  | "approve-design-choice"
  | "approve-design-questionnaire"
  | "approve-design-prototype";

export interface Checkpoint {
  awaiting: CheckpointType;
  message: string;
  timestamp: string;
  feedback: string | null;
  metadata?: Record<string, unknown>;
}

/** Sub-stage values for feature pipeline mid-story checkpointing (RD-07) */
export type SubStageType = "BUILD" | "TEST" | "VERIFY" | "COMMIT";

export interface StoryCheckpoint {
  storyId: string;
  lastCompletedSubStage: SubStageType;
  completedSubStages: SubStageType[];
  timestamp: string;
}
