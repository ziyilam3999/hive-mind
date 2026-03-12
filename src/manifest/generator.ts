import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { readFileSafe, writeFileAtomic, fileExists } from "../utils/file-io.js";
import { isoTimestamp } from "../utils/timestamp.js";

const INVENTORY_MARKER = "## Artifact Inventory";

const STATIC_TEMPLATE = `# Hive Mind — Project Manifest

> AI-first navigation map. Static sections are manually maintained.
> Artifact Inventory is auto-generated at pipeline stage boundaries.

## Project Identity

Hive Mind v3 — AI-orchestrated development pipeline with human checkpoints.
Stack: Node 18+, TypeScript (strict), Claude CLI. Test runner: Vitest.

## Architecture

4-stage pipeline: **SPEC** → **PLAN** → **EXECUTE** (build/verify/commit/learn) → **REPORT**
21 agent types across 4 groups: research, architecture, execution, learning.
Entry points: \`src/index.ts\` (CLI), \`src/orchestrator.ts\` (pipeline controller).

## Source Map

| Directory | Purpose | Key files |
|-----------|---------|-----------|
| \`src/agents/\` | Agent spawning, prompts, model assignments | \`spawner.ts\`, \`prompts.ts\`, \`model-map.ts\` |
| \`src/stages/\` | Pipeline stage implementations | \`spec-stage.ts\`, \`plan-stage.ts\`, \`execute-build.ts\`, \`execute-verify.ts\`, \`execute-commit.ts\`, \`execute-learn.ts\`, \`report-stage.ts\`, \`baseline-check.ts\` |
| \`src/types/\` | TypeScript interfaces | \`agents.ts\`, \`checkpoint.ts\`, \`execution-plan.ts\`, \`manager-log.ts\`, \`reports.ts\` |
| \`src/state/\` | Checkpoint & plan state management | \`checkpoint.ts\`, \`execution-plan.ts\`, \`manager-log.ts\` |
| \`src/memory/\` | Persistent learning & KB graduation | \`memory-manager.ts\`, \`graduation.ts\` |
| \`src/reports/\` | Report parsing & templates | \`parser.ts\`, \`templates.ts\` |
| \`src/utils/\` | File I/O, shell, tokens, timestamps, cost tracking | \`file-io.ts\`, \`shell.ts\`, \`cost-tracker.ts\`, \`notify.ts\` |
| \`src/tooling/\` | Tool dependency detection & setup | \`detect.ts\`, \`setup.ts\` |
| \`src/manifest/\` | Manifest generation (this file) | \`generator.ts\` |

## Navigation Hints

- **Pipeline flow** → \`src/orchestrator.ts\`
- **Agent behavior & rules** → \`src/agents/prompts.ts\` (AGENT_JOBS + AGENT_RULES)
- **Add a new agent type** → \`src/types/agents.ts\` + \`src/agents/prompts.ts\` + \`src/agents/model-map.ts\`
- **Memory & learnings** → \`.hive-mind/memory.md\` then \`.hive-mind/knowledge-base/\`
- **Roadmap & backlog** → \`docs/BACKLOG.md\`
- **Current pipeline state** → \`.hive-mind/.checkpoint\`

## Conventions

- All file I/O through \`src/utils/file-io.ts\` (\`writeFileAtomic\` for atomicity)
- Agents spawned via \`claude --print --dangerously-skip-permissions\`
- ELI5 requirement for 6 agent types (reporter, retrospective, diagnostician, spec-drafter, spec-corrector, critic)
- Max 5 Tier-1 rules per agent type

---

`;

interface FileEntry {
  path: string;
  sizeKb: number;
  modified: string;
}

interface CategoryGroup {
  name: string;
  files: FileEntry[];
}

function scanDirectory(dir: string, basePath: string): FileEntry[] {
  const entries: FileEntry[] = [];
  if (!fileExists(dir)) return entries;

  try {
    const items = readdirSync(dir);
    for (const item of items) {
      if (item.startsWith(".tmp-") || item === "MANIFEST.md") continue;
      const fullPath = join(dir, item);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          entries.push(...scanDirectory(fullPath, basePath));
        } else {
          entries.push({
            path: relative(basePath, fullPath).replace(/\\/g, "/"),
            sizeKb: Math.round(stat.size / 1024 * 10) / 10,
            modified: stat.mtime.toISOString().slice(0, 10),
          });
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return entries;
}

function categorizeFiles(files: FileEntry[]): CategoryGroup[] {
  const categories: Record<string, FileEntry[]> = {
    "Spec Artifacts": [],
    "Plan Artifacts": [],
    "Report Artifacts": [],
    "Knowledge Base": [],
    "State Files": [],
    "Other": [],
  };

  for (const file of files) {
    if (file.path.startsWith("spec/")) {
      categories["Spec Artifacts"].push(file);
    } else if (file.path.startsWith("plans/")) {
      categories["Plan Artifacts"].push(file);
    } else if (file.path.startsWith("reports/")) {
      categories["Report Artifacts"].push(file);
    } else if (file.path.startsWith("knowledge-base/")) {
      categories["Knowledge Base"].push(file);
    } else if (
      file.path === ".checkpoint" ||
      file.path === "manager-log.jsonl" ||
      file.path === "memory.md" ||
      file.path === "consolidated-report.md" ||
      file.path === "retrospective.md" ||
      file.path.endsWith(".json")
    ) {
      categories["State Files"].push(file);
    } else {
      categories["Other"].push(file);
    }
  }

  return Object.entries(categories)
    .filter(([, files]) => files.length > 0)
    .map(([name, files]) => ({ name, files }));
}

function formatInventory(groups: CategoryGroup[]): string {
  const lines: string[] = [];
  lines.push(INVENTORY_MARKER);
  lines.push("");
  lines.push(`> Auto-generated at ${isoTimestamp()} — do not edit below this line`);
  lines.push("");

  for (const group of groups) {
    lines.push(`### ${group.name} (${group.files.length} files)`);
    lines.push("");
    lines.push("| File | Size | Modified |");
    lines.push("|------|------|----------|");
    for (const file of group.files) {
      lines.push(`| \`${file.path}\` | ${file.sizeKb} KB | ${file.modified} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function updateManifest(hiveMindDir: string): Promise<void> {
  const manifestPath = join(hiveMindDir, "MANIFEST.md");

  // Preserve static content if manifest exists
  let staticContent = STATIC_TEMPLATE;
  if (fileExists(manifestPath)) {
    const existing = readFileSafe(manifestPath);
    if (existing) {
      const markerIdx = existing.indexOf(INVENTORY_MARKER);
      if (markerIdx > 0) {
        staticContent = existing.slice(0, markerIdx);
      }
    }
  }

  // Scan and categorize files
  const files = scanDirectory(hiveMindDir, hiveMindDir);
  const groups = categorizeFiles(files);
  const inventory = formatInventory(groups);

  writeFileAtomic(manifestPath, staticContent + inventory + "\n");
}
