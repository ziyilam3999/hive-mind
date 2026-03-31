import { join } from "node:path";
import { appendFileSync } from "node:fs";

/** Append a timestamped line to {projectRoot}/.hive-mind-dashboard.log.
 *  Accepts either a project root or a working directory for backwards compat. */
export function dashLog(projectRoot: string, msg: string): void {
  try {
    appendFileSync(join(projectRoot, ".hive-mind-dashboard.log"), `${new Date().toISOString()} ${msg}\n`);
  } catch { /* non-fatal — never break the pipeline for logging */ }
}
