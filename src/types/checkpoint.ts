export type CheckpointType = "approve-spec" | "approve-plan" | "approve-integration" | "verify" | "ship";

export interface Checkpoint {
  awaiting: CheckpointType;
  message: string;
  timestamp: string;
  feedback: string | null;
}
