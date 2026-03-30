export type PipelineStage =
  | "NORMALIZE" | "SPEC" | "PLAN" | "EXECUTE" | "REPORT" | "COMPLETE" | "DESIGN";

export interface TimelineEntry {
  timestamp: string;   // ISO 8601
  event: string;       // e.g., "US-03 PASSED", "Wave 2 complete (3/3 passed)"
  detail?: string;     // Optional extra context
}
