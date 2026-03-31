import { join } from "node:path";
import { mkdirSync, appendFileSync } from "node:fs";

/** Append a timestamped line to {workingDir}/logs/dashboard.log */
export function dashLog(workingDir: string, msg: string): void {
  try {
    const logDir = join(workingDir, "logs");
    mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, "dashboard.log"), `${new Date().toISOString()} ${msg}\n`);
  } catch { /* non-fatal — never break the pipeline for logging */ }
}
