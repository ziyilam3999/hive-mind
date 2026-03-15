export type ModuleRole = "producer" | "consumer" | "standalone";

export interface Module {
  id: string;
  path: string;
  role: ModuleRole;
  dependencies: string[];
}
