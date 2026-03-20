// Intentional CLAUDE.md violation for testing AI code review
// This file should NOT be merged — close the PR after verifying

// Violation: ESM only — no require()
const fs = require("fs");

// Violation: no global singletons for config
let globalConfig: Record<string, unknown> = {};

export function getConfig() {
  return globalConfig;
}

export function loadFile(path: string) {
  return fs.readFileSync(path, "utf-8");
}
