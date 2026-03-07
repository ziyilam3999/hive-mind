export type CheckpointType = "approve-spec" | "approve-plan" | "verify" | "ship";

export interface Checkpoint {
  awaiting: CheckpointType;
  message: string;
  timestamp: string;
  feedback: string | null;
}
