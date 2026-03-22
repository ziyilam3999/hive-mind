import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  renderProgressBar,
  renderWaveBar,
  renderStageBreadcrumb,
  updateLiveReport,
  cleanupOrphanedTempFiles,
} from "../../reports/live-report.js";
import * as fileIo from "../../utils/file-io.js";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock file-io for tests that need controlled I/O
vi.mock("../../utils/file-io.js", async () => {
  const actual = await vi.importActual<typeof import("../../utils/file-io.js")>("../../utils/file-io.js");
  return {
    ...actual,
    readFileSafe: vi.fn(actual.readFileSafe),
    writeFileAtomic: vi.fn(actual.writeFileAtomic),
  };
});

const mockedFileIo = vi.mocked(fileIo);

function makeTempDir(): string {
  const dir = join(tmpdir(), `live-report-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "plans"), { recursive: true });
  return dir;
}

function writeLog(dir: string, entries: Array<Record<string, unknown>>): void {
  const content = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(dir, "manager-log.jsonl"), content, "utf-8");
}

function writePlan(dir: string, stories: Array<Record<string, unknown>>): void {
  const plan = { stories, modules: [] };
  writeFileSync(join(dir, "plans", "execution-plan.json"), JSON.stringify(plan), "utf-8");
}

function isoNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

describe("live-report", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    tempDir = makeTempDir();
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* */ }
  });

  // Test 1: Renders dashboard with zero stories (pre-PLAN)
  it("renders dashboard with zero stories pre-PLAN", () => {
    writeLog(tempDir, [
      { timestamp: isoNow(-60000), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null },
    ]);

    // Use real I/O for this test
    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "NORMALIZE", "Pipeline started");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"));
    expect(output).toBeTruthy();
    expect(output).toContain("NORMALIZE");
    expect(output).toContain("-- / --");
    expect(output).toContain("No execution plan available yet.");
    expect(output).not.toContain("| Story |");
  });

  // Test 2: Renders story counts correctly
  it("renders story counts correctly", () => {
    const stories = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `US-${i + 1}`, title: `S${i + 1}`, status: "passed", attempts: 1, committed: false, sourceFiles: [], dependencies: [], maxAttempts: 3 })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `US-${i + 6}`, title: `S${i + 6}`, status: "failed", attempts: 2, committed: false, sourceFiles: [], dependencies: [], maxAttempts: 3 })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `US-${i + 8}`, title: `S${i + 8}`, status: "in-progress", attempts: 1, committed: false, sourceFiles: [], dependencies: [], maxAttempts: 3 })),
      ...Array.from({ length: 22 }, (_, i) => ({ id: `US-${i + 11}`, title: `S${i + 11}`, status: "not-started", attempts: 0, committed: false, sourceFiles: [], dependencies: [], maxAttempts: 3 })),
    ];
    writePlan(tempDir, stories);
    writeLog(tempDir, [{ timestamp: isoNow(-60000), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null }]);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "EXECUTE", "test");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
    expect(output).toContain("Passed: 5");
    expect(output).toContain("Failed: 2");
    expect(output).toContain("In Progress: 3");
    expect(output).toContain("Pending: 22");
  });

  // Test 3: Renders wave groupings from log
  it("renders wave groupings from WAVE_START entries", () => {
    const stories = [
      { id: "US-01", title: "S1", status: "passed", attempts: 1, committed: true, sourceFiles: [], dependencies: [], maxAttempts: 3 },
      { id: "US-02", title: "S2", status: "passed", attempts: 1, committed: true, sourceFiles: [], dependencies: [], maxAttempts: 3 },
      { id: "US-03", title: "S3", status: "not-started", attempts: 0, committed: false, sourceFiles: [], dependencies: [], maxAttempts: 3 },
    ];
    writePlan(tempDir, stories);
    writeLog(tempDir, [
      { timestamp: isoNow(-120000), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null },
      { timestamp: isoNow(-60000), action: "WAVE_START", cycle: 0, storyId: null, reason: null, storyIds: ["US-01", "US-02"], waveNumber: 1 },
    ]);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "EXECUTE", "test");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
    expect(output).toContain("### Wave 1");
    expect(output).toContain("US-01");
    expect(output).toContain("US-02");
    expect(output).toContain("### Pending");
    expect(output).toContain("US-03");
  });

  // Test 4: Renders hardening tracker from log
  it("renders hardening tracker from log entries", () => {
    writeLog(tempDir, [
      { timestamp: isoNow(-60000), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null },
      { timestamp: isoNow(-50000), action: "BUILD_RETRY", cycle: 1, storyId: "US-01", reason: null },
      { timestamp: isoNow(-40000), action: "BUILD_RETRY", cycle: 1, storyId: "US-02", reason: null },
      { timestamp: isoNow(-30000), action: "PREFLIGHT_PAUSE", cycle: 0, storyId: null, reason: null, tool: "docker" },
      { timestamp: isoNow(-20000), action: "REGISTRY_GAP_FIXED", cycle: 0, storyId: "US-03", reason: null, registryFile: "src/index.ts" },
    ]);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "EXECUTE", "test");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
    expect(output).toContain("BUILD retries | 2");
    expect(output).toContain("Pre-flight pauses | 1");
    expect(output).toContain("Registry gap fixes | 1");
    expect(output).toContain("docker");
    expect(output).toContain("src/index.ts");
  });

  // Test 5: Timeline is reverse chronological
  it("timeline is reverse chronological", () => {
    writeLog(tempDir, [
      { timestamp: "2026-03-22T10:00:00.000Z", action: "PIPELINE_START", cycle: 0, storyId: null, reason: null },
      { timestamp: "2026-03-22T10:01:00.000Z", action: "SPEC_COMPLETE", cycle: 0, storyId: null, reason: null },
      { timestamp: "2026-03-22T10:02:00.000Z", action: "PLAN_COMPLETE", cycle: 0, storyId: null, reason: null },
    ]);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "PLAN", "test");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
    const timelineSection = output.split("## Timeline")[1];
    const planIdx = timelineSection.indexOf("PLAN_COMPLETE");
    const specIdx = timelineSection.indexOf("SPEC_COMPLETE");
    const startIdx = timelineSection.indexOf("PIPELINE_START");
    expect(planIdx).toBeLessThan(specIdx);
    expect(specIdx).toBeLessThan(startIdx);
  });

  // Test 6: Atomic write uses writeFileAtomic
  it("uses writeFileAtomic for writing", () => {
    writeLog(tempDir, [{ timestamp: isoNow(), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null }]);

    mockedFileIo.readFileSafe.mockRestore();
    const writeSpy = vi.fn();
    mockedFileIo.writeFileAtomic.mockImplementation(writeSpy);

    updateLiveReport(tempDir, "NORMALIZE", "test");

    expect(writeSpy).toHaveBeenCalledOnce();
    expect(writeSpy.mock.calls[0][0]).toContain("live-report.md");
  });

  // Test 7: Error isolation — does not throw
  it("does not throw on readFileSafe error", () => {
    mockedFileIo.readFileSafe.mockImplementation(() => { throw new Error("disk error"); });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => updateLiveReport(tempDir, "NORMALIZE", "test")).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("disk error"));

    warnSpy.mockRestore();
  });

  // Test 8: Config disabled — this tests the orchestrator guard, not updateLiveReport itself
  // The guard is `if (config.liveReport) updateLiveReport(...)` at the call site.
  // We verify the function itself works regardless — the guard is tested in integration.
  it("updateLiveReport writes output even without plan", () => {
    writeLog(tempDir, [{ timestamp: isoNow(), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null }]);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "NORMALIZE", "Pipeline started");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"));
    expect(output).toBeTruthy();
  });

  // Test 9: Elapsed time formats correctly
  it("formats elapsed time correctly", () => {
    // 2h13m ago
    writeLog(tempDir, [
      { timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 - 13 * 60 * 1000).toISOString(), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null },
    ]);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "EXECUTE", "test");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
    expect(output).toContain("2h 13m");
  });

  // Test 10: Progress bar renders correctly
  it("progress bar renders correctly for 14/32", () => {
    const stories = [
      ...Array.from({ length: 14 }, (_, i) => ({ id: `US-${i + 1}`, title: `S${i}`, status: "passed", attempts: 1, committed: false, sourceFiles: [], dependencies: [], maxAttempts: 3 })),
      ...Array.from({ length: 18 }, (_, i) => ({ id: `US-${i + 15}`, title: `S${i}`, status: "not-started", attempts: 0, committed: false, sourceFiles: [], dependencies: [], maxAttempts: 3 })),
    ];
    writePlan(tempDir, stories);
    writeLog(tempDir, [{ timestamp: isoNow(), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null }]);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "EXECUTE", "test");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
    expect(output).toContain("44%");
    expect(output).toContain("14/32");
  });

  // Test 11: Malformed JSONL lines are skipped
  it("skips malformed JSONL lines", () => {
    const logContent = [
      JSON.stringify({ timestamp: isoNow(-60000), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null }),
      "THIS IS NOT JSON",
      JSON.stringify({ timestamp: isoNow(-30000), action: "SPEC_COMPLETE", cycle: 0, storyId: null, reason: null }),
    ].join("\n") + "\n";
    writeFileSync(join(tempDir, "manager-log.jsonl"), logContent, "utf-8");

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    updateLiveReport(tempDir, "SPEC", "test");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("malformed"));
    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
    expect(output).toContain("SPEC_COMPLETE");
    warnSpy.mockRestore();
  });

  // Test 12: Timeline capped at 50 entries
  it("caps timeline at 50 entries", () => {
    const entries = Array.from({ length: 80 }, (_, i) => ({
      timestamp: new Date(Date.now() - (80 - i) * 1000).toISOString(),
      action: i === 0 ? "PIPELINE_START" : "COMPLETED",
      cycle: 1,
      storyId: i === 0 ? null : `US-${i}`,
      reason: null,
    }));
    writeLog(tempDir, entries);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "EXECUTE", "test");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
    const timelineSection = output.split("## Timeline")[1];
    const dataRows = timelineSection.split("\n").filter(l => l.startsWith("| ") && !l.startsWith("| Time") && !l.startsWith("|---"));
    expect(dataRows.length).toBe(50);
  });

  // Test 13: Missing PIPELINE_START fallback
  it("falls back to earliest log entry when PIPELINE_START is missing", () => {
    writeLog(tempDir, [
      { timestamp: isoNow(-60000), action: "SPEC_COMPLETE", cycle: 0, storyId: null, reason: null },
    ]);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "SPEC", "test");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
    // Should show elapsed time, not "N/A"
    expect(output).toContain("Elapsed |");
    expect(output).not.toContain("N/A");
  });

  // Test 14: Config validation rejects non-boolean liveReport
  it("validateConfig rejects non-boolean liveReport", async () => {
    const { validateConfig } = await import("../../config/loader.js");
    const result = validateConfig({ liveReport: "yes" });
    expect(result.errors).toContain("liveReport must be a boolean");
  });

  // Test 15: Committed column renders from execution plan
  it("committed column renders yes for committed stories", () => {
    writePlan(tempDir, [
      { id: "US-01", title: "S1", status: "passed", attempts: 1, committed: true, commitHash: "abc123", sourceFiles: [], dependencies: [], maxAttempts: 3 },
      { id: "US-02", title: "S2", status: "failed", attempts: 2, committed: false, sourceFiles: [], dependencies: [], maxAttempts: 3 },
    ]);
    writeLog(tempDir, [{ timestamp: isoNow(), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null }]);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "EXECUTE", "test");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
    // US-01 should have "yes" in committed column
    const us01Line = output.split("\n").find(l => l.includes("US-01"))!;
    expect(us01Line).toContain("yes");
    // US-02 should not
    const us02Line = output.split("\n").find(l => l.includes("US-02"))!;
    expect(us02Line).not.toContain("yes");
  });

  // Test 16: Stage sequence integration test (lives here for discoverability)
  it("stage sequence renders correctly across stages", () => {
    writeLog(tempDir, [{ timestamp: isoNow(-120000), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null }]);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    const stages = ["NORMALIZE", "SPEC", "PLAN", "EXECUTE", "REPORT", "COMPLETE"] as const;
    for (const stage of stages) {
      updateLiveReport(tempDir, stage, `${stage} update`);
      const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
      expect(output).toContain(`[${stage}]`);
      expect(output).toContain(`| Stage | ${stage} |`);
    }
  });

  // Test 17: Negative elapsed time clamped to zero
  it("clamps negative elapsed time to 0m", () => {
    // PIPELINE_START in the future
    writeLog(tempDir, [
      { timestamp: new Date(Date.now() + 60000).toISOString(), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null },
    ]);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "NORMALIZE", "test");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
    expect(output).toContain("0m");
    expect(output).not.toMatch(/-\d+m/);
  });

  // Test 18: Orphaned temp file cleanup
  it("cleans up orphaned temp files on error", () => {
    writeLog(tempDir, [{ timestamp: isoNow(), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null }]);

    mockedFileIo.readFileSafe.mockRestore();
    // Create an orphaned temp file
    writeFileSync(join(tempDir, ".tmp-12345-abc"), "orphan", "utf-8");

    mockedFileIo.writeFileAtomic.mockImplementation(() => { throw new Error("EPERM"); });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    updateLiveReport(tempDir, "NORMALIZE", "test");
    warnSpy.mockRestore();

    // Orphaned file should be cleaned up
    const files = readdirSync(tempDir).filter(f => f.startsWith(".tmp-"));
    expect(files.length).toBe(0);
  });

  // Test 19: Progress bar renders at boundary values
  describe("renderProgressBar", () => {
    it("renders all empty for 0/32", () => {
      const bar = renderProgressBar(0, 32);
      expect(bar).toBe("\u2591".repeat(32));
      expect(bar.length).toBe(32);
    });

    it("renders all filled for 32/32", () => {
      const bar = renderProgressBar(32, 32);
      expect(bar).toBe("\u2588".repeat(32));
      expect(bar.length).toBe(32);
    });

    it("renders exactly half for 16/32", () => {
      const bar = renderProgressBar(16, 32);
      expect(bar).toBe("\u2588".repeat(16) + "\u2591".repeat(16));
    });

    it("renders all empty for 0 total", () => {
      const bar = renderProgressBar(0, 0);
      expect(bar).toBe("\u2591".repeat(32));
    });
  });

  // Test 20: Stage breadcrumb marks correct stage
  describe("renderStageBreadcrumb", () => {
    it("marks EXECUTE as current stage", () => {
      const breadcrumb = renderStageBreadcrumb("EXECUTE");
      expect(breadcrumb).toContain("[EXECUTE]");
      expect(breadcrumb).toContain("PLAN > [EXECUTE] > REPORT");
      // PLAN should NOT be in brackets
      expect(breadcrumb).not.toContain("[PLAN]");
    });

    it("marks NORMALIZE as current stage", () => {
      const breadcrumb = renderStageBreadcrumb("NORMALIZE");
      expect(breadcrumb).toContain("[NORMALIZE]");
      expect(breadcrumb).not.toContain("[SPEC]");
    });
  });

  // Test 21: Wave mini-bar renders correctly
  describe("renderWaveBar", () => {
    it("renders 3/5 correctly", () => {
      const bar = renderWaveBar(3, 5);
      expect(bar).toBe("######----");
    });

    it("renders 0/5 as all dashes", () => {
      const bar = renderWaveBar(0, 5);
      expect(bar).toBe("----------");
    });

    it("renders 5/5 as all hashes", () => {
      const bar = renderWaveBar(5, 5);
      expect(bar).toBe("##########");
    });

    it("renders 0/0 as all dashes", () => {
      const bar = renderWaveBar(0, 0);
      expect(bar).toBe("----------");
    });
  });

  // Test 22: Status markers prefix story status
  it("status markers prefix story status in output", () => {
    writePlan(tempDir, [
      { id: "US-01", title: "S1", status: "passed", attempts: 1, committed: false, sourceFiles: [], dependencies: [], maxAttempts: 3 },
      { id: "US-02", title: "S2", status: "failed", attempts: 2, committed: false, sourceFiles: [], dependencies: [], maxAttempts: 3 },
      { id: "US-03", title: "S3", status: "in-progress", attempts: 1, committed: false, sourceFiles: [], dependencies: [], maxAttempts: 3 },
      { id: "US-04", title: "S4", status: "not-started", attempts: 0, committed: false, sourceFiles: [], dependencies: [], maxAttempts: 3 },
    ]);
    writeLog(tempDir, [{ timestamp: isoNow(), action: "PIPELINE_START", cycle: 0, storyId: null, reason: null }]);

    mockedFileIo.readFileSafe.mockRestore();
    mockedFileIo.writeFileAtomic.mockRestore();

    updateLiveReport(tempDir, "EXECUTE", "test");

    const output = fileIo.readFileSafe(join(tempDir, "live-report.md"))!;
    expect(output).toContain("+ PASSED");
    expect(output).toContain("x FAILED");
    expect(output).toContain("~ IN-PROGRESS");
    expect(output).toContain(". NOT-STARTED");
  });
});
