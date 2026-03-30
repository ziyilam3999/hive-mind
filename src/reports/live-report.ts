import type { PipelineStage, TimelineEntry } from "../types/live-report.js";
import type { ManagerLogEntry } from "../types/manager-log.js";
import type { ExecutionPlan, Story } from "../types/execution-plan.js";
import { readFileSafe, writeFileAtomic } from "../utils/file-io.js";
import { join } from "node:path";
import { readdirSync, unlinkSync } from "node:fs";

// --- Rendering helpers (pure functions, no I/O) ---

const STAGES: PipelineStage[] = ["NORMALIZE", "SPEC", "PLAN", "EXECUTE", "REPORT", "COMPLETE"];

export function renderProgressBar(resolved: number, total: number, width = 32): string {
  if (total === 0) return "\u2591".repeat(width);
  const filled = Math.round((resolved / total) * width);
  return "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
}

export function renderWaveBar(resolved: number, total: number): string {
  if (total === 0) return "-".repeat(10);
  const filled = Math.round((resolved / total) * 10);
  return "#".repeat(filled) + "-".repeat(10 - filled);
}

export function renderStageBreadcrumb(currentStage: PipelineStage): string {
  return STAGES.map(s => s === currentStage ? `[${s}]` : s).join(" > ");
}

const STATUS_MARKER: Record<string, string> = {
  "passed": "+",
  "failed": "x",
  "in-progress": "~",
  "not-started": ".",
  "skipped": "-",
};

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function parseLogLines(content: string): ManagerLogEntry[] {
  const entries: ManagerLogEntry[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as ManagerLogEntry);
    } catch {
      console.warn(`[live-report] Skipping malformed log line: ${trimmed.slice(0, 200)}`);
    }
  }
  return entries;
}

interface WaveGroup {
  waveNumber: number;
  storyIds: string[];
}

function buildWaveGroups(logEntries: ManagerLogEntry[]): WaveGroup[] {
  const waves: WaveGroup[] = [];
  for (const entry of logEntries) {
    if (entry.action === "WAVE_START" && entry.waveNumber != null) {
      waves.push({
        waveNumber: entry.waveNumber,
        storyIds: entry.storyIds ?? [],
      });
    }
  }
  return waves;
}

interface HardeningCounts {
  buildRetries: { count: number; details: string[] };
  preflightPauses: { count: number; details: string[] };
  registryGapFixes: { count: number; details: string[] };
}

function buildHardeningTracker(logEntries: ManagerLogEntry[]): HardeningCounts {
  const tracker: HardeningCounts = {
    buildRetries: { count: 0, details: [] },
    preflightPauses: { count: 0, details: [] },
    registryGapFixes: { count: 0, details: [] },
  };

  for (const entry of logEntries) {
    switch (entry.action) {
      case "BUILD_RETRY":
        tracker.buildRetries.count++;
        if (entry.storyId) tracker.buildRetries.details.push(entry.storyId);
        break;
      case "PREFLIGHT_PAUSE":
        tracker.preflightPauses.count++;
        if (entry.tool) tracker.preflightPauses.details.push(entry.tool);
        break;
      case "REGISTRY_GAP_FIXED":
        tracker.registryGapFixes.count++;
        if (entry.registryFile && entry.storyId) {
          tracker.registryGapFixes.details.push(`${entry.registryFile} -> ${entry.storyId}`);
        }
        break;
    }
  }

  return tracker;
}

function buildTimeline(logEntries: ManagerLogEntry[], pipelineStart: number, maxEntries = 50): string[] {
  const rows: string[] = [];
  const relevant = logEntries.slice(-maxEntries).reverse();

  for (const entry of relevant) {
    const ts = new Date(entry.timestamp);
    const elapsed = formatElapsed(Math.max(0, ts.getTime() - pipelineStart));
    const time = ts.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

    let event: string = entry.action;
    if (entry.storyId) event = `${entry.storyId} ${entry.action}`;
    if (entry.reason) event += ` — ${entry.reason}`;

    rows.push(`| ${time} | ${elapsed} | ${event} |`);
  }

  return rows;
}

export function cleanupOrphanedTempFiles(dir: string): void {
  try {
    const files = readdirSync(dir);
    for (const f of files) {
      if (f.startsWith(".tmp-")) {
        try {
          unlinkSync(join(dir, f));
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // best-effort — dir may not exist
  }
}

/**
 * Reads execution-plan.json + manager-log.jsonl, renders live-report.md, writes atomically.
 * Called from orchestrator at every milestone. Never throws — logs warning on error.
 */
export function updateLiveReport(
  workingDir: string,
  stage: PipelineStage,
  message: string,
): void {
  try {
    // 1. Read execution-plan.json (may not exist pre-PLAN)
    const planPath = join(workingDir, "plans", "execution-plan.json");
    const planContent = readFileSafe(planPath);
    let plan: ExecutionPlan | null = null;
    if (planContent) {
      try {
        plan = JSON.parse(planContent) as ExecutionPlan;
      } catch {
        // corrupt plan file — render without story data
      }
    }

    // 2. Read manager-log.jsonl
    const logPath = join(workingDir, "manager-log.jsonl");
    const logContent = readFileSafe(logPath) ?? "";
    const logEntries = parseLogLines(logContent);

    // 3. Derive pipeline start time
    const startEntry = logEntries.find(e => e.action === "PIPELINE_START");
    let pipelineStart: number;
    if (startEntry) {
      pipelineStart = new Date(startEntry.timestamp).getTime();
    } else if (logEntries.length > 0) {
      pipelineStart = new Date(logEntries[0].timestamp).getTime();
    } else {
      pipelineStart = 0;
    }

    const now = Date.now();
    const elapsedStr = pipelineStart === 0 ? "N/A" : formatElapsed(Math.max(0, now - pipelineStart));

    // 4. Story counts
    const stories: Story[] = plan?.stories ?? [];
    const passed = stories.filter(s => s.status === "passed").length;
    const failed = stories.filter(s => s.status === "failed").length;
    const inProgress = stories.filter(s => s.status === "in-progress").length;
    const pending = stories.filter(s => s.status === "not-started").length;
    const total = stories.length;
    const resolved = passed + failed;
    const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;

    // Check for deferred stories
    const deferredPath = join(workingDir, "plans", "deferred-stories.md");
    const deferredContent = readFileSafe(deferredPath);
    const deferredCount = deferredContent
      ? deferredContent.split("\n").filter(l => l.startsWith("- ")).length
      : 0;

    // 5. Wave groups
    const waveGroups = buildWaveGroups(logEntries);
    const currentWave = waveGroups.length;
    const totalWavesStr = stage === "COMPLETE" ? String(currentWave) : "?";

    // 6. Hardening tracker
    const hardening = buildHardeningTracker(logEntries);

    // 7. Timeline
    const timelineRows = buildTimeline(logEntries, pipelineStart);

    // 8. Render markdown
    const timestamp = new Date().toISOString();
    const breadcrumb = renderStageBreadcrumb(stage);
    const progressBar = renderProgressBar(resolved, total);

    const lines: string[] = [
      "# Hive-Mind Pipeline — Live Report",
      `> Auto-generated. Do not edit. Last updated: ${timestamp}`,
      "",
      breadcrumb,
      "",
      "---",
      "",
      "## Dashboard",
      "| Metric | Value |",
      "|--------|-------|",
      `| Stage | ${stage} |`,
      `| Elapsed | ${elapsedStr} |`,
      `| Wave | ${plan ? `${currentWave || "--"} / ${totalWavesStr}` : "-- / --"} |`,
      "",
      "## Pipeline Progress",
      "",
      `[${progressBar}] ${pct}% — ${resolved}/${total} resolved`,
      "",
      `  Passed: ${passed} | Failed: ${failed} | In Progress: ${inProgress} | Pending: ${pending}${deferredCount > 0 ? ` | Deferred: ${deferredCount}` : ""}`,
      "",
      "## Hardening Fix Tracker",
      "| Fix | Count | Details |",
      "|-----|-------|---------|",
      `| BUILD retries | ${hardening.buildRetries.count} | ${hardening.buildRetries.details.join(", ") || "—"} |`,
      `| Pre-flight pauses | ${hardening.preflightPauses.count} | ${hardening.preflightPauses.details.join(", ") || "—"} |`,
      `| Registry gap fixes | ${hardening.registryGapFixes.count} | ${hardening.registryGapFixes.details.join(", ") || "—"} |`,
    ];

    // Story Progress (per-wave or flat)
    lines.push("", "## Story Progress", "");

    if (plan && stories.length > 0) {
      if (waveGroups.length > 0) {
        // Group stories by wave
        const assignedStoryIds = new Set<string>();
        for (const wave of waveGroups) {
          const waveStories = wave.storyIds
            .map(id => stories.find(s => s.id === id))
            .filter((s): s is Story => s != null);
          for (const s of waveStories) assignedStoryIds.add(s.id);

          const wResolved = waveStories.filter(s => s.status === "passed" || s.status === "failed").length;
          const wTotal = waveStories.length;
          const wBar = renderWaveBar(wResolved, wTotal);
          const wPct = wTotal > 0 ? Math.round((wResolved / wTotal) * 100) : 0;

          lines.push(`### Wave ${wave.waveNumber} [${wBar}] ${wPct}% (${wResolved}/${wTotal})`);
          lines.push("| Story | Title | Status | Attempts | Committed |");
          lines.push("|-------|-------|--------|----------|-----------|");
          for (const s of waveStories) {
            const marker = STATUS_MARKER[s.status] ?? ".";
            const committed = s.committed ? "yes" : "";
            lines.push(`| ${s.id} | ${s.title} | ${marker} ${s.status.toUpperCase()} | ${s.attempts} | ${committed} |`);
          }
          lines.push("");
        }

        // Remaining unassigned stories (pending)
        const unassigned = stories.filter(s => !assignedStoryIds.has(s.id));
        if (unassigned.length > 0) {
          lines.push("### Pending");
          lines.push("| Story | Title | Status | Attempts | Committed |");
          lines.push("|-------|-------|--------|----------|-----------|");
          for (const s of unassigned) {
            const marker = STATUS_MARKER[s.status] ?? ".";
            lines.push(`| ${s.id} | ${s.title} | ${marker} ${s.status.toUpperCase()} | ${s.attempts} | |`);
          }
          lines.push("");
        }
      } else {
        // No waves yet — flat table
        lines.push("| Story | Title | Status | Attempts | Committed |");
        lines.push("|-------|-------|--------|----------|-----------|");
        for (const s of stories) {
          const marker = STATUS_MARKER[s.status] ?? ".";
          const committed = s.committed ? "yes" : "";
          lines.push(`| ${s.id} | ${s.title} | ${marker} ${s.status.toUpperCase()} | ${s.attempts} | ${committed} |`);
        }
        lines.push("");
      }
    } else {
      lines.push("_No execution plan available yet._", "");
    }

    // Timeline
    lines.push("## Timeline");
    lines.push("| Time | Elapsed | Event |");
    lines.push("|------|---------|-------|");
    lines.push(...timelineRows);
    lines.push("");

    const markdown = lines.join("\n");
    writeFileAtomic(join(workingDir, "live-report.md"), markdown);
  } catch (err) {
    console.warn(`[live-report] Update failed: ${err instanceof Error ? err.message : err}`);
    cleanupOrphanedTempFiles(workingDir);
  }
}
