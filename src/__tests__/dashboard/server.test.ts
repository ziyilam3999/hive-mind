import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startDashboard, isDashboardRunning, shutdownExistingDashboard } from "../../dashboard/server.js";
import type { PipelineDirs } from "../../types/pipeline-dirs.js";
import type { HiveMindConfig } from "../../config/schema.js";
import { DEFAULT_CONFIG } from "../../config/schema.js";

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

type DashboardHandle = Awaited<ReturnType<typeof startDashboard>>;
type LogsResponse = { lines: string[]; nextOffset: number | null };

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "hive-mind-dashboard-test-"));
}

function makeDirs(workingDir: string): PipelineDirs {
  return { workingDir, knowledgeDir: workingDir, labDir: workingDir };
}

function makeConfig(): HiveMindConfig {
  return { ...DEFAULT_CONFIG };
}

function makeStoryFile(workingDir: string, storyId: string, filename: string, content: string): void {
  const storyDir = join(workingDir, "reports", storyId);
  mkdirSync(storyDir, { recursive: true });
  writeFileSync(join(storyDir, filename), content);
}

async function fetchJson<T = unknown>(url: string, path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${url}${path}`);
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

async function fetchRaw(url: string, path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${url}${path}`);
  const body = await res.text();
  return { status: res.status, body };
}

describe("startDashboard", () => {
  let workingDir: string;
  let handle: DashboardHandle | null = null;

  beforeEach(() => {
    workingDir = createTempDir();
    mkdirSync(join(workingDir, "plans"), { recursive: true });
    handle = null;
  });

  afterEach(() => {
    if (handle) {
      handle.stop();
      handle = null;
    }
    rmSync(workingDir, { recursive: true, force: true });
  });

  it("returns a handle with stop, url, and signalShutdown", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    expect(handle).toHaveProperty("stop");
    expect(handle).toHaveProperty("url");
    expect(handle).toHaveProperty("signalShutdown");
    expect(typeof handle.stop).toBe("function");
    expect(typeof handle.url).toBe("string");
    expect(typeof handle.signalShutdown).toBe("function");
    expect(handle.url).toMatch(/^http:\/\/localhost:\d+$/);
  });

  it("GET / returns 200 with HTML", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    const { status, body } = await fetchRaw(handle.url, "/");
    expect(status).toBe(200);
    expect(body).toContain("<!DOCTYPE html>");
    expect(body).toContain("Hive Mind");
  });

  it("GET /api/status returns cached state with workingDir", async () => {
    // Write execution plan
    writeFileSync(
      join(workingDir, "plans", "execution-plan.json"),
      JSON.stringify({ schemaVersion: "2.0.0", prdPath: "prd.md", specPath: "spec.md", stories: [] }),
    );
    // Write manager log
    writeFileSync(
      join(workingDir, "manager-log.jsonl"),
      JSON.stringify({ timestamp: "2026-01-01T00:00:00Z", action: "PIPELINE_START", cycle: 0, storyId: null, reason: null }) + "\n",
    );

    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);

    // Wait for initial poll to complete
    await new Promise((r) => setTimeout(r, 100));

    const { status, body } = await fetchJson<Record<string, unknown>>(handle.url, "/api/status");
    expect(status).toBe(200);
    expect(body).toHaveProperty("executionPlan");
    expect(body).toHaveProperty("managerLog");
    expect(body).toHaveProperty("costLog");
    expect(body).toHaveProperty("checkpoint");
    expect(body).toHaveProperty("workingDir");
    expect(body.workingDir).toBe(workingDir);
  });

  it("signalShutdown stores shutdownAt in status response", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    const ts = Date.now() + 60000;
    handle.signalShutdown(ts);

    const { body } = await fetchJson<Record<string, unknown>>(handle.url, "/api/status");
    expect(body.shutdownAt).toBe(ts);
  });

  it("GET /api/story/:id/logs returns empty for non-existent story", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    const { status, body } = await fetchJson<LogsResponse>(handle.url, "/api/story/US-99/logs");
    expect(status).toBe(200);
    expect(body.lines).toEqual([]);
    expect(body.nextOffset).toBeNull();
  });

  it("GET /api/story/:id/logs returns file content with pagination", async () => {
    const lines = Array.from({ length: 201 }, (_, i) => `Line ${i + 1}`);
    makeStoryFile(workingDir, "US-01", "impl-report.md", lines.join("\n"));

    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);

    // First page
    const { body: data1 } = await fetchJson<LogsResponse>(handle.url, "/api/story/US-01/logs?offset=0");
    expect(data1.lines).toHaveLength(200);
    expect(data1.nextOffset).toBe(200);
    expect(data1.lines[0]).toBe("Line 1");

    // Second page
    const { body: data2 } = await fetchJson<LogsResponse>(handle.url, "/api/story/US-01/logs?offset=200");
    expect(data2.lines).toHaveLength(1);
    expect(data2.nextOffset).toBeNull();
    expect(data2.lines[0]).toBe("Line 201");
  });

  it("sorts report files alphabetically before concatenation", async () => {
    makeStoryFile(workingDir, "US-02", "z-report.md", "Z-content");
    makeStoryFile(workingDir, "US-02", "a-report.md", "A-content");

    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    const { body } = await fetchJson<LogsResponse>(handle.url, "/api/story/US-02/logs");
    // a-report.md comes before z-report.md alphabetically
    expect(body.lines[0]).toBe("A-content");
    expect(body.lines[1]).toBe("Z-content");
  });

  it("rejects path traversal in storyId with 400", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    const res = await fetch(`${handle.url}/api/story/..%2F..%2Fetc%2Fpasswd/logs`);
    expect(res.status).toBe(400);
  });

  it("coerces invalid offset to 0", async () => {
    makeStoryFile(workingDir, "US-03", "report.md", "content");

    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);

    // Negative offset
    const { body: d1 } = await fetchJson<{ lines: string[] }>(handle.url, "/api/story/US-03/logs?offset=-1");
    expect(d1.lines).toContain("content");

    // NaN offset
    const { body: d2 } = await fetchJson<{ lines: string[] }>(handle.url, "/api/story/US-03/logs?offset=abc");
    expect(d2.lines).toContain("content");
  });

  it("returns 404 for unknown routes", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    const res = await fetch(`${handle.url}/unknown-path`);
    expect(res.status).toBe(404);
  });

  it("returns 405 for non-GET methods", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    const res = await fetch(`${handle.url}/api/status`, { method: "POST" });
    expect(res.status).toBe(405);
  });

  it("stop() shuts down the server", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    const url = handle.url;
    handle.stop();
    handle = null;

    // Server should be closed
    await expect(fetch(`${url}/api/status`)).rejects.toThrow();
  });

  it("isDashboardRunning returns true for matching workingDir", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    // .dashboard-port is written by startDashboard
    expect(await isDashboardRunning(workingDir)).toBe(true);
  });

  it("isDashboardRunning returns false for different workingDir", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    // Read the port from the dashboard that's running for workingDir
    const port = readFileSync(join(workingDir, ".dashboard-port"), "utf-8").trim();

    // Create a second temp dir and plant the same port file there
    const otherDir = mkdtempSync(join(tmpdir(), "hive-mind-dashboard-other-"));
    try {
      writeFileSync(join(otherDir, ".dashboard-port"), port);
      // Should return false because the running dashboard serves workingDir, not otherDir
      expect(await isDashboardRunning(otherDir)).toBe(false);
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it("POST /api/shutdown with matching workingDir returns 200 and closes server", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    const url = handle.url;

    const res = await fetch(`${url}/api/shutdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingDir }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);

    // Server should be shutting down — clear handle so afterEach doesn't double-stop
    handle = null;

    // Wait for server to fully close — server.close() is async
    // Retry until fetch fails or times out after 2s
    const deadline = Date.now() + 2000;
    let closed = false;
    while (Date.now() < deadline) {
      try {
        await fetch(`${url}/api/status`);
        await new Promise((r) => setTimeout(r, 50));
      } catch {
        closed = true;
        break;
      }
    }
    expect(closed).toBe(true);
  });

  it("POST /api/shutdown with wrong workingDir returns 403", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);

    const res = await fetch(`${handle.url}/api/shutdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingDir: "/some/other/dir" }),
    });
    expect(res.status).toBe(403);

    // Server should still be running
    const statusRes = await fetch(`${handle.url}/api/status`);
    expect(statusRes.status).toBe(200);
  });

  it("shutdownExistingDashboard shuts down running dashboard and deletes port file", async () => {
    handle = await startDashboard(makeDirs(workingDir), makeConfig(), 0);
    const url = handle.url;
    const portFile = join(workingDir, ".dashboard-port");

    expect(existsSync(portFile)).toBe(true);

    await shutdownExistingDashboard(workingDir);
    handle = null; // Server is shut down

    expect(existsSync(portFile)).toBe(false);

    // Wait for server to fully close
    const deadline = Date.now() + 2000;
    let closed = false;
    while (Date.now() < deadline) {
      try {
        await fetch(`${url}/api/status`);
        await new Promise((r) => setTimeout(r, 50));
      } catch {
        closed = true;
        break;
      }
    }
    expect(closed).toBe(true);
  });

  it("shutdownExistingDashboard cleans up port file even if no server is running", async () => {
    const portFile = join(workingDir, ".dashboard-port");
    writeFileSync(portFile, "9999"); // Stale port file, no server on this port

    await shutdownExistingDashboard(workingDir);

    expect(existsSync(portFile)).toBe(false);
  });

  it("shutdownExistingDashboard is a no-op when no port file exists", async () => {
    // Should not throw
    await shutdownExistingDashboard(workingDir);
  });
});
