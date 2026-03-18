export type CheckpointType = "approve-normalize" | "approve-spec" | "approve-plan" | "approve-integration" | "approve-diagnosis" | "verify" | "ship";

export interface Checkpoint {
  awaiting: CheckpointType;
  message: string;
  timestamp: string;
  feedback: string | null;
}

/** Sub-stage values for feature pipeline mid-story checkpointing (RD-07) */
export type SubStageType = "BUILD" | "TEST" | "VERIFY" | "COMMIT";

export interface StoryCheckpoint {
  storyId: string;
  lastCompletedSubStage: SubStageType;
  completedSubStages: SubStageType[];
  timestamp: string;
}
