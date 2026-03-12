#!/usr/bin/env npx tsx
/**
 * Atomic progress updater for MVP progress.md
 *
 * Usage:
 *   npx tsx scripts/update-progress.ts --item 2 --status done --next "Begin Phase 2"
 *   npx tsx scripts/update-progress.ts --item 2 --status done
 *   npx tsx scripts/update-progress.ts --gate tier1
 *   npx tsx scripts/update-progress.ts --gate tier2
 *   npx tsx scripts/update-progress.ts --metrics
 *   npx tsx scripts/update-progress.ts --learnings
 *   npx tsx scripts/update-progress.ts --dry-run --item 2 --status done
 */

import { readFileSync, writeFileSync, renameSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execSync } from "node:child_process";

// ── Config ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const PROGRESS_PATH = join(PROJECT_ROOT, ".hive-mind", "plans", "mvp", "progress.md");
const SRC_DIR = join(PROJECT_ROOT, "src");

// ── Atomic write (mirrors src/utils/file-io.ts) ────────────────────────────

function writeFileAtomic(path: string, content: string): void {
  const dir = dirname(path);
  const tmpPath = join(dir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, path);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function countFiles(dir: string, ext: string): number {
  let count = 0;
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        count++;
      }
    }
  }
  walk(dir);
  return count;
}

/** Count .ts files excluding test files and __tests__ directories */
function countNonTestTs(dir: string): number {
  let count = 0;
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "__tests__") {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        count++;
      }
    }
  }
  walk(dir);
  return count;
}

/** Strip ANSI escape codes from string */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[\d+m/g, "");
}

function parseVitestOutput(raw: string): { testFiles: number; totalTests: number } | null {
  const output = stripAnsi(raw);
  const filesMatch = output.match(/Test Files\s+(\d+) passed/);
  const testsMatch = output.match(/Tests\s+(\d+) passed/);
  if (filesMatch || testsMatch) {
    return {
      testFiles: filesMatch ? parseInt(filesMatch[1], 10) : countFiles(SRC_DIR, ".test.ts"),
      totalTests: testsMatch ? parseInt(testsMatch[1], 10) : -1,
    };
  }
  return null;
}

function countTests(): { testFiles: number; totalTests: number } {
  try {
    const output = execSync("npx vitest run 2>&1", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      timeout: 60_000,
    });
    const result = parseVitestOutput(output);
    if (result) return result;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "stdout" in err) {
      const result = parseVitestOutput((err as { stdout: string }).stdout);
      if (result) return result;
    }
  }
  console.warn("Warning: Could not run vitest for test counts. Counting .test.ts files instead.");
  return { testFiles: countFiles(SRC_DIR, ".test.ts"), totalTests: -1 };
}

function countTsErrors(): number {
  try {
    execSync("npx tsc --noEmit", { cwd: PROJECT_ROOT, encoding: "utf-8", timeout: 30_000 });
    return 0;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "stdout" in err) {
      const output = (err as { stdout: string }).stdout;
      const matches = output.match(/error TS\d+/g);
      return matches?.length ?? 1;
    }
    return 1;
  }
}

// ── Parsers / Mutators ──────────────────────────────────────────────────────

function updateItemStatus(content: string, itemNum: number, status: "done" | "in-progress"): string {
  const lines = content.split("\n");
  const dateStr = today();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match table row: | {num} | ...
    const match = line.match(/^\|\s*(\d+)\s*\|/);
    if (match && parseInt(match[1], 10) === itemNum) {
      if (status === "done") {
        lines[i] = line
          .replace(/\[ \]/, "[x]")
          .replace(/\| — \|$/, `| ${dateStr} |`);
      } else {
        lines[i] = line
          .replace(/\[ \]/, "[~]");
      }
      break;
    }
  }

  return lines.join("\n");
}

function updateCurrentStatus(content: string, nextAction: string): string {
  const dateStr = today();
  return content.replace(
    /\*\*Phase:\*\* .+ \| \*\*Next Action:\*\* .+ \| \*\*Updated:\*\* .+/,
    (match) => {
      const phaseMatch = match.match(/\*\*Phase:\*\* ([^|]+)/);
      const phase = phaseMatch ? phaseMatch[1].trim() : "?";
      return `**Phase:** ${phase} | **Next Action:** ${nextAction} | **Updated:** ${dateStr}`;
    },
  );
}

function updateMetrics(
  content: string,
  metrics: { testFiles: number; totalTests: number; sourceFiles: number; tsErrors: number },
): string {
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("Test files")) {
      lines[i] = line.replace(/\|\s*\d+\s*\|$/, `| ${metrics.testFiles} |`);
    } else if (line.includes("Total tests") && metrics.totalTests >= 0) {
      lines[i] = line.replace(/\|\s*\d+\s*\|$/, `| ${metrics.totalTests} |`);
    } else if (line.includes("Source files")) {
      lines[i] = line.replace(/\|\s*\d+\s*\|$/, `| ${metrics.sourceFiles} |`);
    } else if (line.includes("TypeScript errors")) {
      lines[i] = line.replace(/\|\s*\d+\s*\|$/, `| ${metrics.tsErrors} |`);
    }
  }

  return lines.join("\n");
}

function updateGate(content: string, tier: "tier1" | "tier2" | "tier3"): string {
  const dateStr = today();
  const tierLabel = tier === "tier1" ? "Tier 1" : tier === "tier2" ? "Tier 2" : "Tier 3";

  // Find the active phase's gate section (first unchecked tier in the file that matches)
  return content.replace(
    new RegExp(`- \\[ \\] ${tierLabel} \\([^)]+\\) — pass date: —`),
    `- [x] ${tierLabel} ($1) — pass date: ${dateStr}`.replace(
      "$1",
      // preserve the parenthetical description
      (() => {
        const m = content.match(new RegExp(`- \\[ \\] ${tierLabel} \\(([^)]+)\\) — pass date: —`));
        return m ? m[1] : "";
      })(),
    ),
  );
}

function updateLearnings(content: string): string {
  // Mark the first unchecked learnings line as done
  return content.replace(
    /\*\*Learnings captured:\*\* \[ \]/,
    "**Learnings captured:** [x]",
  );
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseCliArgs(argv: string[]): {
  item?: number;
  status?: "done" | "in-progress";
  next?: string;
  gate?: "tier1" | "tier2" | "tier3";
  metrics?: boolean;
  learnings?: boolean;
  dryRun?: boolean;
} {
  const args = argv.slice(2);
  const result: ReturnType<typeof parseCliArgs> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--item":
        result.item = parseInt(args[++i], 10);
        break;
      case "--status":
        result.status = args[++i] as "done" | "in-progress";
        break;
      case "--next":
        result.next = args[++i];
        break;
      case "--gate":
        result.gate = args[++i] as "tier1" | "tier2" | "tier3";
        break;
      case "--metrics":
        result.metrics = true;
        break;
      case "--learnings":
        result.learnings = true;
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      default:
        console.error(`Unknown flag: ${args[i]}`);
        process.exit(1);
    }
  }

  return result;
}

function main(): void {
  const opts = parseCliArgs(process.argv);
  let content = readFileSync(PROGRESS_PATH, "utf-8");
  let changed = false;

  // 1. Item status update
  if (opts.item !== undefined) {
    const status = opts.status ?? "done";
    console.log(`Updating item #${opts.item} → ${status}`);
    content = updateItemStatus(content, opts.item, status);
    changed = true;
  }

  // 2. Next action update
  if (opts.next) {
    console.log(`Updating next action → "${opts.next}"`);
    content = updateCurrentStatus(content, opts.next);
    changed = true;
  }

  // 3. Gate update
  if (opts.gate) {
    console.log(`Marking ${opts.gate} gate as passed`);
    content = updateGate(content, opts.gate);
    changed = true;
  }

  // 4. Metrics refresh
  if (opts.metrics) {
    console.log("Collecting metrics...");
    const sourceFiles = countNonTestTs(SRC_DIR);
    const testFiles = countFiles(SRC_DIR, ".test.ts");
    const tsErrors = countTsErrors();
    const { totalTests } = countTests();
    const metrics = { testFiles, totalTests, sourceFiles, tsErrors };
    console.log(`  Test files: ${metrics.testFiles}`);
    console.log(`  Total tests: ${metrics.totalTests >= 0 ? metrics.totalTests : "(unknown)"}`);
    console.log(`  Source files: ${metrics.sourceFiles}`);
    console.log(`  TS errors: ${metrics.tsErrors}`);
    content = updateMetrics(content, metrics);
    changed = true;
  }

  // 5. Learnings
  if (opts.learnings) {
    console.log("Marking learnings as captured");
    content = updateLearnings(content);
    changed = true;
  }

  if (!changed) {
    console.log("Nothing to do. Use --item, --gate, --metrics, --learnings, or --next.");
    console.log("");
    console.log("Examples:");
    console.log("  npx tsx scripts/update-progress.ts --item 2 --status done --next \"Integration tests (Step 13)\"");
    console.log("  npx tsx scripts/update-progress.ts --gate tier1");
    console.log("  npx tsx scripts/update-progress.ts --metrics");
    console.log("  npx tsx scripts/update-progress.ts --learnings");
    process.exit(0);
  }

  if (opts.dryRun) {
    console.log("\n--- DRY RUN (no write) ---\n");
    console.log(content);
    return;
  }

  writeFileAtomic(PROGRESS_PATH, content);
  console.log(`\n✓ progress.md updated atomically at ${PROGRESS_PATH}`);
}

main();
