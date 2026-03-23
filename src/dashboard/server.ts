import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve, sep } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { exec } from "node:child_process";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import type { HiveMindConfig } from "../config/schema.js";

const POLL_INTERVAL_MS = 2000;
const PAGE_SIZE = 200;
const REQUEST_TIMEOUT_MS = 5000;

interface DashboardHandle {
  stop: () => void;
  url: string;
  signalShutdown: (shutdownAt: number) => void;
}

interface CachedState {
  executionPlan: unknown | null;
  managerLog: unknown[];
  costLog: unknown[];
  checkpoint: unknown | null;
  shutdownAt?: number;
}

async function readJsonSafe(filePath: string): Promise<unknown | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function readJsonlSafe(filePath: string): Promise<unknown[]> {
  try {
    const content = await readFile(filePath, "utf-8");
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function setResponseHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "");
}

function sendJson(res: ServerResponse, data: unknown): void {
  setResponseHeaders(res);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendHtml(res: ServerResponse, html: string): void {
  setResponseHeaders(res);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function send404(res: ServerResponse): void {
  setResponseHeaders(res);
  res.writeHead(404);
  res.end();
}

function send400(res: ServerResponse): void {
  setResponseHeaders(res);
  res.writeHead(400);
  res.end();
}

function send504(res: ServerResponse): void {
  setResponseHeaders(res);
  res.writeHead(504);
  res.end();
}

function withTimeout(res: ServerResponse, handler: () => Promise<void>): void {
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    send504(res);
  }, REQUEST_TIMEOUT_MS);

  handler()
    .catch(() => {
      if (!timedOut && !res.writableEnded) {
        res.writeHead(500);
        res.end();
      }
    })
    .finally(() => {
      clearTimeout(timer);
    });
}

function openBrowserFireAndForget(url: string): void {
  const platform = process.platform;
  let cmd: string | undefined;

  if (platform === "win32") {
    cmd = `start "" "${url}"`;
  } else if (platform === "darwin") {
    cmd = `open "${url}"`;
  } else if (platform === "linux") {
    cmd = `xdg-open "${url}"`;
  }

  if (cmd) {
    exec(cmd, { timeout: 5000 }, () => {});
  }
}

async function handleLogsRoute(
  storyId: string,
  offsetParam: string | null,
  res: ServerResponse,
  workingDir: string,
): Promise<void> {
  // Path traversal guard
  const reportsBase = resolve(workingDir, "reports");
  const storyDir = resolve(workingDir, "reports", storyId);
  if (!storyDir.startsWith(reportsBase + sep)) {
    send400(res);
    return;
  }

  // Parse and validate offset
  const rawOffset = parseInt(offsetParam ?? "0", 10);
  const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

  // Read report files
  let files: string[];
  try {
    const entries = await readdir(storyDir);
    files = entries.filter((f) => f.endsWith(".md")).sort();
  } catch {
    sendJson(res, { lines: [], nextOffset: null });
    return;
  }

  if (files.length === 0) {
    sendJson(res, { lines: [], nextOffset: null });
    return;
  }

  // Concatenate all file lines
  const allLines: string[] = [];
  for (const file of files) {
    try {
      const content = await readFile(join(storyDir, file), "utf-8");
      allLines.push(...content.split("\n"));
    } catch {
      // Skip unreadable files
    }
  }

  const totalLines = allLines.length;
  const safeOffset = Math.min(offset, totalLines);
  const page = allLines.slice(safeOffset, safeOffset + PAGE_SIZE);
  const nextOffset = safeOffset + page.length < totalLines ? safeOffset + page.length : null;

  sendJson(res, { lines: page, nextOffset });
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html><head><title>Hive Mind Dashboard</title></head>
<body><h1>Hive Mind Pipeline Dashboard</h1>
<p>Use /api/status for pipeline state.</p>
<script>
setInterval(async()=>{
  const r=await fetch('/api/status');
  const d=await r.json();
  document.title='Hive Mind - '+(d.checkpoint?'Checkpoint':'Running');
},2000);
</script></body></html>`;

export async function startDashboard(
  dirs: PipelineDirs,
  _config: HiveMindConfig,
): Promise<DashboardHandle> {
  const workingDir = dirs.workingDir;

  // Cached state refreshed by polling
  const cached: CachedState = {
    executionPlan: null,
    managerLog: [],
    costLog: [],
    checkpoint: null,
  };

  async function pollState(): Promise<void> {
    try {
      cached.executionPlan = await readJsonSafe(join(workingDir, "plans", "execution-plan.json"));
      cached.managerLog = await readJsonlSafe(join(workingDir, "manager-log.jsonl"));
      cached.costLog = await readJsonlSafe(join(workingDir, "cost-log.jsonl"));
      cached.checkpoint = await readJsonSafe(join(workingDir, ".checkpoint"));
    } catch {
      // Non-fatal: keep serving stale cache
    }
  }

  // Initial poll
  await pollState();

  const pollTimer = setInterval(() => {
    pollState().catch(() => {});
  }, POLL_INTERVAL_MS);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = new URL(req.url ?? "/", `http://localhost`);
    const pathname = parsedUrl.pathname;

    if (req.method !== "GET") {
      setResponseHeaders(res);
      res.writeHead(405);
      res.end();
      return;
    }

    if (pathname === "/") {
      withTimeout(res, async () => {
        sendHtml(res, DASHBOARD_HTML);
      });
      return;
    }

    if (pathname === "/api/status") {
      withTimeout(res, async () => {
        const statusPayload: Record<string, unknown> = {
          executionPlan: cached.executionPlan,
          managerLog: cached.managerLog,
          costLog: cached.costLog,
          checkpoint: cached.checkpoint,
        };
        if (cached.shutdownAt !== undefined) {
          statusPayload.shutdownAt = cached.shutdownAt;
        }
        sendJson(res, statusPayload);
      });
      return;
    }

    // Match /api/story/:id/logs
    const logMatch = pathname.match(/^\/api\/story\/([^/]+)\/logs$/);
    if (logMatch) {
      const storyId = decodeURIComponent(logMatch[1]!);
      const offsetParam = parsedUrl.searchParams.get("offset");
      withTimeout(res, () => handleLogsRoute(storyId, offsetParam, res, workingDir));
      return;
    }

    send404(res);
  });

  return new Promise<DashboardHandle>((resolvePromise, rejectPromise) => {
    server.on("error", (err) => {
      clearInterval(pollTimer);
      rejectPromise(new Error(`Dashboard failed to bind port: ${err.message}`));
    });

    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const url = `http://localhost:${port}`;

      console.log(`Dashboard: ${url}`);

      // Fire-and-forget browser open
      openBrowserFireAndForget(url);

      resolvePromise({
        stop: () => {
          clearInterval(pollTimer);
          server.close();
        },
        url,
        signalShutdown: (shutdownAt: number) => {
          cached.shutdownAt = shutdownAt;
        },
      });
    });
  });
}
