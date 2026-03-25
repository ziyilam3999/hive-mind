import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve, sep } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import type { HiveMindConfig } from "../config/schema.js";
import { openBrowser } from "./browser.js";

const POLL_INTERVAL_MS = 2000;
const PAGE_SIZE = 200;
const REQUEST_TIMEOUT_MS = 5000;

export interface DashboardHandle {
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
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hive Mind // Pipeline Dashboard</title>
<style>
  :root {
    /* Notebook cream palette -- warm but with visible contrast */
    --white: #f7f5f0;          /* card surfaces -- warm ivory */
    --off-white: #efece5;      /* page background -- parchment */
    --light-green: #e8f0e8;    /* subtle green tint areas */
    --border: #ccc8be;         /* primary borders -- visible on cream */
    --border-light: #ddd9d0;   /* subtle separators -- still visible */
    --text: #2c2c28;           /* primary text -- warm near-black */
    --text-secondary: #5c5c54; /* secondary text */
    --text-dim: #8c8c82;       /* muted text */

    --green: #16a34a;
    --green-light: #d4edda;    /* green tint for done indicators */
    --green-bg: #e8f0e8;
    --amber: #b8860b;          /* slightly warmer amber */
    --amber-light: #fdf3d0;
    --amber-bg: #fdf8e8;
    --red: #c03030;            /* slightly muted red */
    --red-light: #f5dada;
    --red-bg: #faf0f0;
    --grey: #8c8c82;
    --grey-light: #ddd9d0;     /* matches border-light for consistency */

    --font-ui: 'Segoe UI', system-ui, -apple-system, sans-serif;
    --font-mono: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;

    --shadow-sm: 0 1px 3px rgba(60,55,45,0.10);   /* warm shadow, more visible */
    --shadow-md: 0 2px 10px rgba(60,55,45,0.12);   /* warm shadow, more visible */
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 15px; }

  body {
    background: var(--off-white);
    color: var(--text);
    font-family: var(--font-ui);
    line-height: 1.6;
    min-height: 100vh;
  }

  /* Honeycomb background texture */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66Z' fill='none' stroke='%2316a34a' stroke-width='0.6'/%3E%3Cpath d='M28 100L0 84L0 50L28 34L56 50L56 84L28 100Z' fill='none' stroke='%2316a34a' stroke-width='0.6'/%3E%3C/svg%3E");
    background-size: 56px 100px;
    opacity: 0.04;
    pointer-events: none;
    z-index: 0;
  }

  .header, .main, .toast-container, .footer { position: relative; z-index: 1; }

  /* ===== HEX SHAPE UTILITY ===== */
  .hex {
    clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
  }

  /* ===== HEADER ===== */
  .header {
    background: var(--white);
    border-bottom: 1px solid var(--border);
    padding: 0 32px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .logo-icon { width: 28px; height: 28px; opacity: 0.7; }

  .logo {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.02em;
  }

  .logo span { color: var(--green); }

  .run-id {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-dim);
    background: var(--grey-light);
    padding: 2px 10px;
    border-radius: 12px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .elapsed-global {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .elapsed-global strong {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
  }

  .notify-btn {
    background: var(--green-light);
    border: 1px solid var(--green);
    color: var(--green);
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.15s;
  }

  .notify-btn:hover { background: var(--green); color: white; }

  /* ===== MAIN LAYOUT ===== */
  .main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* ===== SECTION CARD ===== */
  .card {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow-sm);
    overflow: hidden;
    position: relative;
  }

  .card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--green-light), var(--green), var(--green-light));
    opacity: 0.5;
    border-radius: 10px 10px 0 0;
  }

  .card-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-light);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .card-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
  }

  .card-body { padding: 24px; }

  /* ===== PIPELINE STEPPER ===== */
  .stepper {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 12px 0;
  }

  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-width: 100px;
    position: relative;
  }

  .step-hex {
    width: 46px;
    height: 46px;
    clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
    background: var(--grey-light);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: var(--grey);
    position: relative;
    z-index: 2;
  }

  .step-hex-inner {
    width: 40px;
    height: 40px;
    clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
    background: var(--white);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step.done .step-hex { background: var(--green); }
  .step.done .step-hex-inner { background: var(--green); color: white; }

  .step.running .step-hex { background: var(--amber); }
  .step.running .step-hex-inner { background: var(--amber-light); color: var(--amber); }

  .step.failed .step-hex { background: var(--red); }
  .step.failed .step-hex-inner { background: var(--red-light); color: var(--red); }

  .step.paused .step-hex { background: transparent; border: 2px solid var(--amber); }
  .step.paused .step-hex-inner { background: var(--amber-light); color: var(--amber); }

  .step-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .step.done .step-label { color: var(--green); }
  .step.running .step-label { color: var(--amber); font-weight: 700; }

  .step-time {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-dim);
  }

  .step.running .step-time { color: var(--amber); }

  .step-connector {
    width: 80px;
    height: 2px;
    background: var(--border);
    margin-bottom: 36px;
  }

  .step-connector.done { background: var(--green); }
  .step-connector.active {
    background: linear-gradient(90deg, var(--green), var(--border));
  }

  /* ===== OVERALL PROGRESS ===== */
  .progress-section {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 0 24px 20px;
  }

  .progress-bar {
    flex: 1;
    height: 10px;
    background: var(--grey-light);
    border-radius: 5px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--green);
    border-radius: 5px;
    transition: width 0.6s ease;
  }

  .progress-text {
    font-size: 22px;
    font-weight: 800;
    color: var(--text);
    min-width: 110px;
    text-align: right;
  }

  .progress-text small {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  /* ===== STATS ROW ===== */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .stat-card {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
    text-align: center;
    box-shadow: var(--shadow-sm);
  }

  .stat-value {
    font-size: 28px;
    font-weight: 800;
    color: var(--text);
    line-height: 1.2;
  }

  .stat-value.green { color: var(--green); }
  .stat-value.amber { color: var(--amber); }
  .stat-value.red { color: var(--red); }

  .stat-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 4px;
  }

  /* ===== SWARM ACTIVITY ===== */
  .swarm-card {
    background: var(--white);
    border: 1px solid var(--border);
    border-left: 3px solid var(--green);
    border-radius: 2px 10px 10px 2px;
    box-shadow: var(--shadow-sm);
    padding: 16px 20px;
  }
  .swarm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .swarm-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-secondary);
  }
  .swarm-pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--green);
    animation: swarmPulse 2s ease-in-out infinite;
  }
  @keyframes swarmPulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(22,163,74,0.4); }
    50% { opacity: 0.6; box-shadow: 0 0 0 6px rgba(22,163,74,0); }
  }
  .swarm-wave {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-dim);
    background: var(--grey-light);
    padding: 2px 8px;
    border-radius: 4px;
  }
  .swarm-rows { display: flex; flex-direction: column; gap: 6px; }
  .swarm-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--amber-bg);
    border: 1px solid rgba(184,134,11,0.12);
  }
  .swarm-hex {
    width: 10px; height: 10px;
    clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
    background: var(--amber);
    flex-shrink: 0;
  }
  .swarm-row.pipeline-agent { background: var(--green-bg); border-color: rgba(22,163,74,0.12); }
  .swarm-row.pipeline-agent .swarm-hex { background: var(--green); }
  .swarm-agent-type {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    min-width: 100px;
  }
  .swarm-context { font-size: 12px; font-weight: 600; color: var(--amber); min-width: 60px; }
  .swarm-row.pipeline-agent .swarm-context { color: var(--green); }
  .swarm-substage {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 1px 8px;
    border-radius: 3px;
    background: rgba(184,134,11,0.15);
    color: var(--amber);
  }
  .swarm-dots {
    flex: 1;
    text-align: right;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-dim);
    animation: dotPulse 1.5s ease-in-out infinite;
  }
  @keyframes dotPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  .swarm-elapsed {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--amber);
    min-width: 55px;
    text-align: right;
  }
  .swarm-row.pipeline-agent .swarm-elapsed { color: var(--green); }
  .swarm-footer {
    margin-top: 10px;
    font-size: 11px;
    color: var(--text-dim);
    display: flex;
    justify-content: space-between;
  }

  /* ===== TWO COLUMN LAYOUT ===== */
  .two-col {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 24px;
  }

  /* ===== STORY LIST ===== */
  .story-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .story-card {
    background: var(--white);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    transition: all 0.12s;
    overflow: hidden;
  }

  .story-card:hover { border-color: var(--border); box-shadow: var(--shadow-sm); }

  .story-header {
    display: flex;
    align-items: center;
    padding: 12px 18px;
    cursor: pointer;
    gap: 14px;
  }

  .story-status-hex {
    width: 14px;
    height: 14px;
    clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
    background: var(--grey);
    flex-shrink: 0;
  }

  .story-card[data-status="passed"] .story-status-hex { background: var(--green); }
  .story-card[data-status="running"] .story-status-hex { background: var(--amber); }
  .story-card[data-status="failed"] .story-status-hex { background: var(--red); }
  .story-card[data-status="pending"] .story-status-hex { background: var(--grey-light); }
  .story-card[data-status="blocked"] .story-status-hex { background: var(--grey); }

  .story-index {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-dim);
    min-width: 20px;
  }

  .story-name {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }

  .story-substage {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 10px;
    border-radius: 4px;
    background: var(--amber-bg);
    color: var(--amber);
  }

  .story-duration {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-secondary);
    min-width: 44px;
    text-align: right;
  }

  .story-card[data-status="running"] .story-duration { color: var(--amber); font-weight: 600; }

  .story-chevron {
    color: var(--text-dim);
    font-size: 12px;
    transition: transform 0.2s;
  }

  .story-card.expanded .story-chevron { transform: rotate(90deg); }

  /* ===== STORY DETAIL / LOG ===== */
  .story-detail {
    display: none;
    border-top: 1px solid var(--border-light);
  }

  .story-card.expanded .story-detail { display: block; }

  .error-summary {
    background: var(--red-bg);
    border-bottom: 1px solid var(--red-light);
    padding: 12px 18px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .error-icon {
    color: var(--red);
    font-weight: 800;
    font-size: 14px;
  }

  .error-text {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--red);
    line-height: 1.6;
  }

  .error-text .file-ref { color: var(--green); text-decoration: underline; }

  .log-output {
    background: var(--off-white);
    padding: 14px 18px;
    max-height: 260px;
    overflow-y: auto;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.7;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-all;
  }

  .log-output .log-pass { color: var(--green); }
  .log-output .log-fail { color: var(--red); }
  .log-output .log-info { color: var(--text-dim); }

  .log-more-btn {
    display: block;
    width: 100%;
    padding: 8px;
    background: var(--grey-light);
    border: none;
    border-top: 1px solid var(--border-light);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
  }

  .log-more-btn:hover { background: var(--border-light); }

  /* ===== SIDEBAR ===== */
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .sidebar .card-body { padding: 20px; }

  /* Cost display */
  .cost-big {
    font-size: 36px;
    font-weight: 800;
    color: var(--green);
    text-align: center;
    line-height: 1.1;
  }

  .cost-budget {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-dim);
    text-align: center;
    margin-top: 4px;
  }

  .cost-bar {
    margin-top: 14px;
    height: 8px;
    background: var(--grey-light);
    border-radius: 4px;
    overflow: hidden;
  }

  .cost-bar-fill {
    height: 100%;
    background: var(--green);
    border-radius: 4px;
  }

  .cost-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 16px;
  }

  .cost-item {
    background: var(--off-white);
    padding: 10px;
    border-radius: 6px;
    text-align: center;
  }

  .cost-item-value {
    font-family: var(--font-mono);
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
  }

  .cost-item-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 2px;
  }

  /* Token table */
  .token-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .token-table th {
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-dim);
    padding: 6px 8px;
    border-bottom: 2px solid var(--border);
  }

  .token-table td {
    padding: 8px;
    border-bottom: 1px solid var(--border-light);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-secondary);
  }

  .token-table td:first-child {
    font-family: var(--font-ui);
    font-weight: 500;
    color: var(--text);
  }

  .token-table tr.failed td { color: var(--red); }
  .token-table tr.running td { color: var(--amber); }

  /* Simple bar in table */
  .mini-bar {
    display: inline-block;
    height: 6px;
    border-radius: 3px;
    background: var(--green);
    vertical-align: middle;
    margin-right: 6px;
  }

  .mini-bar.failed { background: var(--red); }
  .mini-bar.running { background: var(--amber); }

  /* Stage timing */
  .timing-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
  }

  .timing-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    min-width: 60px;
    text-transform: uppercase;
  }

  .timing-bar {
    flex: 1;
    height: 8px;
    background: var(--grey-light);
    border-radius: 4px;
    overflow: hidden;
  }

  .timing-fill {
    height: 100%;
    border-radius: 4px;
    background: var(--green);
  }

  .timing-fill.running { background: var(--amber); }

  .timing-value {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-dim);
    min-width: 40px;
    text-align: right;
  }

  /* ===== SHUTDOWN BANNER ===== */
  .shutdown-banner {
    background: var(--green-bg);
    border: 1px solid var(--green);
    border-radius: 10px;
    padding: 18px 24px;
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .shutdown-banner.hidden { display: none; }

  .shutdown-dot {
    width: 16px;
    height: 16px;
    clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
    background: var(--green);
    flex-shrink: 0;
  }

  .shutdown-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--green);
  }

  .shutdown-desc {
    font-size: 13px;
    color: var(--text-secondary);
    margin-top: 2px;
  }

  /* ===== CHECKPOINT BANNER ===== */
  .checkpoint-banner {
    background: var(--amber-bg);
    border: 1px solid rgba(184,134,11,0.25);
    border-left: 4px solid var(--amber);
    border-radius: 2px 10px 10px 2px;
    padding: 18px 24px;
    display: flex;
    align-items: flex-start;
    gap: 16px;
    position: relative;
    animation: cpSlideDown 0.3s ease-out;
    box-shadow: -2px 0 8px -2px rgba(184,134,11,0.18);
  }
  @keyframes cpSlideDown {
    from { opacity: 0; transform: translateY(-12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes cpEmberGlow {
    0%, 100% { box-shadow: 0 0 6px 1px rgba(184,134,11,0.15); }
    50% { box-shadow: 0 0 14px 3px rgba(184,134,11,0.35); }
  }
  .checkpoint-hex {
    width: 20px; height: 20px;
    clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
    background: var(--amber);
    flex-shrink: 0;
    margin-top: 2px;
  }
  .checkpoint-content { flex: 1; }
  .checkpoint-label {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--amber); margin-bottom: 6px;
  }
  .checkpoint-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .checkpoint-msg { font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
  .checkpoint-cmd {
    font-family: var(--font-mono); font-size: 12px; color: var(--green);
    background: var(--green-bg); padding: 2px 10px; border-radius: 4px; display: inline-block;
  }
  .checkpoint-elapsed {
    font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);
    white-space: nowrap; margin-top: 2px;
  }
  .toast.warning { border-left-color: var(--amber); font-weight: 600; }

  /* ===== AWAITING DATA ===== */
  .awaiting-data {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-dim);
  }

  .awaiting-data .hex-spinner {
    width: 48px;
    height: 48px;
    clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
    background: var(--grey-light);
    margin: 0 auto 16px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }

  .awaiting-data-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }

  .awaiting-data-desc {
    font-size: 13px;
    color: var(--text-dim);
  }

  /* ===== TOAST ===== */
  .toast-container {
    position: fixed;
    top: 68px;
    right: 24px;
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .toast {
    background: var(--white);
    border: 1px solid var(--border);
    border-left: 4px solid var(--amber);
    padding: 12px 18px;
    font-size: 13px;
    color: var(--text);
    min-width: 280px;
    border-radius: 8px;
    box-shadow: var(--shadow-md);
    animation: slideIn 0.25s ease, fadeOut 0.3s ease 4s forwards;
  }

  .toast.success { border-left-color: var(--green); }
  .toast.error { border-left-color: var(--red); }

  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  @keyframes fadeOut {
    to { opacity: 0; transform: translateY(-10px); }
  }
</style>
</head>
<body>

<!-- HEADER -->
<header class="header">
  <div class="header-left">
    <svg class="logo-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <polygon points="50,30 63,38 63,54 50,62 37,54 37,38" fill="none" stroke="#1a2e1a" stroke-width="2.5"/>
      <line x1="50" y1="30" x2="50" y2="62" stroke="#1a2e1a" stroke-width="1.2" opacity="0.4"/>
      <line x1="37" y1="38" x2="63" y2="54" stroke="#1a2e1a" stroke-width="1.2" opacity="0.4"/>
      <line x1="63" y1="38" x2="37" y2="54" stroke="#1a2e1a" stroke-width="1.2" opacity="0.4"/>
      <line x1="50" y1="30" x2="50" y2="12" stroke="#5a6e5a" stroke-width="1.5"/>
      <line x1="63" y1="38" x2="78" y2="24" stroke="#5a6e5a" stroke-width="1.5"/>
      <line x1="63" y1="54" x2="78" y2="68" stroke="#5a6e5a" stroke-width="1.5"/>
      <line x1="50" y1="62" x2="50" y2="80" stroke="#5a6e5a" stroke-width="1.5"/>
      <line x1="37" y1="54" x2="22" y2="68" stroke="#5a6e5a" stroke-width="1.5"/>
      <line x1="37" y1="38" x2="22" y2="24" stroke="#5a6e5a" stroke-width="1.5"/>
      <circle cx="50" cy="12" r="3" fill="#5a6e5a"/>
      <circle cx="78" cy="24" r="3" fill="#5a6e5a"/>
      <circle cx="78" cy="68" r="3" fill="#5a6e5a"/>
      <circle cx="50" cy="80" r="3" fill="#5a6e5a"/>
      <circle cx="22" cy="68" r="3" fill="#5a6e5a"/>
      <circle cx="22" cy="24" r="3" fill="#5a6e5a"/>
    </svg>
    <div class="logo">Hive <span>Mind</span></div>
    <span class="run-id" id="runId">--</span>
  </div>
  <div class="header-right">
    <div class="elapsed-global">Elapsed <strong id="globalElapsed">--</strong></div>
    <button class="notify-btn" id="notifBtn" onclick="toggleNotifications()">Notifications On</button>
  </div>
</header>

<main class="main" id="mainContent">
  <!-- Content rendered dynamically by JS -->
</main>

<!-- FOOTER -->
<footer class="footer" style="text-align:center;padding:32px 0 24px;opacity:0.3;">
  <svg width="36" height="36" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:8px;">
    <polygon points="50,30 63,38 63,54 50,62 37,54 37,38" fill="none" stroke="#16a34a" stroke-width="2.5"/>
    <line x1="50" y1="30" x2="50" y2="12" stroke="#16a34a" stroke-width="1.5"/>
    <line x1="63" y1="38" x2="78" y2="24" stroke="#16a34a" stroke-width="1.5"/>
    <line x1="63" y1="54" x2="78" y2="68" stroke="#16a34a" stroke-width="1.5"/>
    <line x1="50" y1="62" x2="50" y2="80" stroke="#16a34a" stroke-width="1.5"/>
    <line x1="37" y1="54" x2="22" y2="68" stroke="#16a34a" stroke-width="1.5"/>
    <line x1="37" y1="38" x2="22" y2="24" stroke="#16a34a" stroke-width="1.5"/>
    <circle cx="50" cy="12" r="3" fill="#16a34a"/><circle cx="78" cy="24" r="3" fill="#16a34a"/>
    <circle cx="78" cy="68" r="3" fill="#16a34a"/><circle cx="50" cy="80" r="3" fill="#16a34a"/>
    <circle cx="22" cy="68" r="3" fill="#16a34a"/><circle cx="22" cy="24" r="3" fill="#16a34a"/>
  </svg>
  <span style="font-size:13px;font-weight:600;color:var(--text-dim);letter-spacing:0.06em;">HIVE MIND</span>
</footer>

<div class="toast-container" id="toastContainer"></div>

<script>
/* ===== STATE ===== */
var state = null;
var pipelineStartTs = null;
var elapsedTimerHandle = null;
var notificationsEnabled = true;
var storyLogCache = {};   /* storyId -> { lines: [], nextOffset: number|null, loading: false } */
var expandedStories = {};  /* storyId -> true */
var previousStatuses = {}; /* storyId -> last known status */
var previousCheckpoint = null; /* checkpoint key to detect new checkpoints */
var shutdownCountdownHandle = null;

/* ===== HELPERS ===== */
function formatDuration(ms) {
  if (ms == null || ms <= 0) return '--';
  var totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return totalSec + 's';
  if (totalSec >= 3600) {
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
  }
  var m = Math.floor(totalSec / 60);
  var s = totalSec % 60;
  return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
}

function formatDurationSec(sec) {
  if (sec == null || sec <= 0) return '--';
  sec = Math.floor(sec);
  if (sec < 60) return sec + 's';
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
}

function formatTokens(n) {
  if (n == null) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function formatCost(n) {
  if (n == null) return '$0.00';
  return '$' + n.toFixed(2);
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function statusToCssStatus(status) {
  /* API statuses: passed, running, failed, pending, blocked */
  return status || 'pending';
}

/* ===== DERIVED DATA ===== */

/* Pipeline stages derived from managerLog */
var STAGE_DEFS = [
  { key: 'spec',    label: 'Spec',    startAction: 'SPEC_START',    fallbackStart: 'PIPELINE_START', endAction: 'SPEC_COMPLETE' },
  { key: 'plan',    label: 'Plan',    startAction: 'PLAN_START',    fallbackStart: 'SPEC_COMPLETE',  endAction: 'PLAN_COMPLETE' },
  { key: 'execute', label: 'Execute', startAction: 'EXECUTE_START', fallbackStart: 'PLAN_COMPLETE',  endAction: 'EXECUTE_COMPLETE' },
  { key: 'report',  label: 'Report',  startAction: 'EXECUTE_COMPLETE', fallbackStart: null, endAction: 'REPORT_COMPLETE' }
];

function deriveStages(managerLog) {
  /* Scan the ENTIRE log and keep the LAST timestamp for each action type */
  var actionTimestamps = {};
  for (var i = 0; i < managerLog.length; i++) {
    var entry = managerLog[i];
    if (entry && entry.action) {
      actionTimestamps[entry.action] = new Date(entry.timestamp).getTime();
    }
  }

  /* Check if any managerLog action contains REPORT (case-insensitive) */
  var hasReportAction = false;
  var lastLogTs = null;
  for (var r = 0; r < managerLog.length; r++) {
    var act = managerLog[r].action || '';
    if (act.toUpperCase().indexOf('REPORT') !== -1) {
      hasReportAction = true;
      var ts = new Date(managerLog[r].timestamp).getTime();
      if (!lastLogTs || ts > lastLogTs) lastLogTs = ts;
    }
  }

  /* Check story completion for EXECUTE stage */
  var stories = (state && state.executionPlan && state.executionPlan.stories) ? state.executionPlan.stories : null;
  var allStoriesDone = false;
  var hasFailed = false;
  if (stories && stories.length > 0) {
    allStoriesDone = true;
    for (var j = 0; j < stories.length; j++) {
      if (stories[j].status === 'failed') hasFailed = true;
      if (stories[j].status !== 'passed' && stories[j].status !== 'failed') allStoriesDone = false;
    }
  }

  /* Find latest WAVE_COMPLETE or cost log timestamp as execute end proxy */
  var executeEndTs = null;
  for (var w = 0; w < managerLog.length; w++) {
    var wAct = managerLog[w].action || '';
    if (wAct.indexOf('WAVE_COMPLETE') !== -1) {
      var wTs = new Date(managerLog[w].timestamp).getTime();
      if (!executeEndTs || wTs > executeEndTs) executeEndTs = wTs;
    }
  }
  if (!executeEndTs && allStoriesDone && state && state.costLog && state.costLog.length > 0) {
    for (var c = 0; c < state.costLog.length; c++) {
      var cTs = new Date(state.costLog[c].timestamp).getTime();
      if (!executeEndTs || cTs > executeEndTs) executeEndTs = cTs;
    }
  }

  /* Map checkpoint to the stage it gates (the NEXT stage that hasn't started yet) */
  var checkpoint = state ? state.checkpoint : null;
  var pausedStageKey = null;
  if (checkpoint && checkpoint.awaiting) {
    var cpToStage = {
      'approve-normalize': 'spec',
      'approve-spec': 'plan',
      'approve-plan': 'execute',
      'approve-preflight': 'execute',
      'approve-integration': 'report',
      'approve-diagnosis': 'execute'
    };
    pausedStageKey = cpToStage[checkpoint.awaiting] || null;
  }

  /* Find first WAVE_START as EXECUTE fallback (for runs without EXECUTE_START) */
  var firstWaveStart = null;
  for (var fw = 0; fw < managerLog.length; fw++) {
    if ((managerLog[fw].action || '') === 'WAVE_START') {
      firstWaveStart = new Date(managerLog[fw].timestamp).getTime();
      break;
    }
  }

  var stages = [];
  for (var s = 0; s < STAGE_DEFS.length; s++) {
    var def = STAGE_DEFS[s];
    /* Resolve startTs: prefer _START action, then WAVE_START for execute, then fallback */
    var startTs = actionTimestamps[def.startAction];
    if (!startTs) {
      if (def.key === 'execute' && firstWaveStart) {
        startTs = firstWaveStart;
      } else if (def.fallbackStart) {
        startTs = actionTimestamps[def.fallbackStart];
      }
    }
    var endTs = actionTimestamps[def.endAction];
    var stageStatus = 'pending';
    var durationMs = null;

    /* Special handling for EXECUTE: use story completion */
    if (def.key === 'execute' && !endTs && startTs && allStoriesDone) {
      stageStatus = hasFailed ? 'failed' : 'done';
      durationMs = executeEndTs ? (executeEndTs - startTs) : (Date.now() - startTs);
    /* Special handling for REPORT: check for any REPORT action in log */
    } else if (def.key === 'report' && !endTs && hasReportAction) {
      var reportStart = actionTimestamps[def.startAction] || (executeEndTs || actionTimestamps['PLAN_COMPLETE']);
      if (reportStart) {
        stageStatus = 'done';
        durationMs = lastLogTs ? (lastLogTs - reportStart) : (Date.now() - reportStart);
      }
    } else if (endTs && startTs) {
      stageStatus = 'done';
      durationMs = endTs - startTs;
    } else if (startTs) {
      if (def.key === pausedStageKey) {
        stageStatus = 'paused';
      } else {
        stageStatus = 'running';
        durationMs = Date.now() - startTs;
      }
    }

    stages.push({
      key: def.key,
      label: def.label,
      status: stageStatus,
      durationMs: durationMs
    });
  }

  /* If execute is done but not failed, also check running state for execute */
  if (stories && stages.length >= 3 && stages[2].status === 'running' && hasFailed) {
    stages[2].status = 'failed';
  }

  return stages;
}

function deriveCounts(stories) {
  var counts = { passed: 0, running: 0, failed: 0, pending: 0, blocked: 0 };
  if (!stories) return counts;
  for (var i = 0; i < stories.length; i++) {
    var s = stories[i].status || 'pending';
    if (counts[s] !== undefined) {
      counts[s]++;
    } else {
      counts.pending++;
    }
  }
  return counts;
}

function deriveCostTotals(costLog) {
  var totalCost = 0;
  var agentCount = 0;
  var totalDurationMs = 0;
  if (!costLog) return { totalCost: 0, agentCount: 0, totalDurationMs: 0 };
  for (var i = 0; i < costLog.length; i++) {
    var entry = costLog[i];
    if (entry.costUsd) totalCost += entry.costUsd;
    agentCount++;
    if (entry.durationMs) totalDurationMs += entry.durationMs;
  }
  return { totalCost: totalCost, agentCount: agentCount, totalDurationMs: totalDurationMs };
}

/* ===== SWARM ACTIVITY ===== */

function deriveActiveAgents(stories, managerLog, costLog) {
  var agents = [];
  var now = Date.now();
  var currentWave = null;

  var hasRunningStory = stories && stories.some(function(s) { return s.status === 'in-progress'; });
  if (!hasRunningStory && managerLog.length > 0) {
    var hasSpecComplete = false, hasPlanComplete = false, pipelineStartTs = null, specCompleteTs = null;
    for (var i = 0; i < managerLog.length; i++) {
      var entry = managerLog[i];
      if (entry.action === 'PIPELINE_START') pipelineStartTs = new Date(entry.timestamp).getTime();
      if (entry.action === 'SPEC_COMPLETE') { hasSpecComplete = true; specCompleteTs = new Date(entry.timestamp).getTime(); }
      if (entry.action === 'PLAN_COMPLETE') hasPlanComplete = true;
    }
    if (pipelineStartTs && !hasSpecComplete) {
      agents.push({ type: 'spec-agent', context: 'SPEC', substage: '', startTs: pipelineStartTs, pipeline: true });
    } else if (hasSpecComplete && !hasPlanComplete && specCompleteTs) {
      agents.push({ type: 'planner', context: 'PLAN', substage: '', startTs: specCompleteTs, pipeline: true });
    }
  }

  if (stories) {
    var latestActionByStory = {};
    /* Build waveStartByStory from WAVE_START entries for immediate elapsed display */
    var waveStartByStory = {};
    for (var w = 0; w < managerLog.length; w++) {
      var wEntry = managerLog[w];
      if (wEntry.action === 'WAVE_START' && wEntry.waveNumber != null) currentWave = wEntry.waveNumber;
      if (wEntry.storyId) latestActionByStory[wEntry.storyId] = wEntry;
      if (wEntry.action === 'WAVE_START' && wEntry.storyIds) {
        var wsTs = new Date(wEntry.timestamp).getTime();
        var wsIds = wEntry.storyIds;
        for (var wsi = 0; wsi < wsIds.length; wsi++) {
          if (!waveStartByStory[wsIds[wsi]]) waveStartByStory[wsIds[wsi]] = wsTs;
        }
      }
    }
    var startTsByStory = {};
    for (var cl = 0; cl < costLog.length; cl++) {
      var ce = costLog[cl];
      if (ce.storyId && ce.timestamp) {
        var ts = new Date(ce.timestamp).getTime();
        if (!startTsByStory[ce.storyId] || ts < startTsByStory[ce.storyId]) startTsByStory[ce.storyId] = ts;
      }
    }
    for (var si = 0; si < stories.length; si++) {
      var story = stories[si];
      if (story.status !== 'in-progress') continue;
      var substage = story.substage || 'BUILD';
      var agentType = 'implementer';
      if (substage === 'VERIFY') agentType = 'verifier';
      else if (substage === 'COMMIT') agentType = 'committer';
      else if (substage === 'TEST') agentType = 'tester';
      var latestAction = latestActionByStory[story.id];
      if (latestAction) {
        if (latestAction.action === 'BUILD_COMPLETE') { agentType = 'refactorer'; substage = 'BUILD'; }
        if (latestAction.action === 'VERIFY_ATTEMPT') { agentType = 'verifier'; substage = 'VERIFY'; }
        if (latestAction.action === 'COMPLIANCE_CHECK') { agentType = 'compliance'; substage = 'VERIFY'; }
        if (latestAction.action === 'BUILD_RETRY') { agentType = 'implementer'; substage = 'RETRY'; }
      }
      var startTs = startTsByStory[story.id] || waveStartByStory[story.id] || (now - (story.durationMs || 0));
      agents.push({ type: agentType, context: story.id, substage: substage, startTs: startTs, pipeline: false, wave: story.wave || currentWave });
    }
  }
  return { agents: agents, currentWave: currentWave };
}

function renderActiveAgents(result) {
  if (!result || !result.agents || result.agents.length === 0) return '';
  var agents = result.agents;
  var now = Date.now();
  var waveHtml = result.currentWave != null ? '<span class="swarm-wave">Wave ' + result.currentWave + '</span>' : '';

  var html = '<div class="swarm-card">';
  html += '<div class="swarm-header"><div class="swarm-title"><span class="swarm-pulse"></span> Swarm Activity</div>' + waveHtml + '</div>';
  html += '<div class="swarm-rows">';
  for (var i = 0; i < agents.length; i++) {
    var a = agents[i];
    var elapsed = Math.max(0, now - (a.startTs || now));
    var rowClass = a.pipeline ? 'swarm-row pipeline-agent' : 'swarm-row';
    html += '<div class="' + rowClass + '">';
    html += '<span class="swarm-hex"></span>';
    html += '<span class="swarm-agent-type">' + escapeHtml(a.type) + '</span>';
    html += '<span class="swarm-context">' + escapeHtml(a.context) + '</span>';
    if (a.substage) html += '<span class="swarm-substage">' + escapeHtml(a.substage) + '</span>';
    html += '<span class="swarm-dots">&middot;&middot;&middot;</span>';
    html += '<span class="swarm-elapsed">' + formatDuration(elapsed) + '</span>';
    html += '</div>';
  }
  html += '</div>';
  html += '<div class="swarm-footer"><span>' + agents.length + ' agent' + (agents.length !== 1 ? 's' : '') + ' active</span></div>';
  html += '</div>';
  return html;
}

/* ===== RENDERING ===== */

function renderCheckpointBanner(checkpoint) {
  if (!checkpoint || !checkpoint.awaiting) return '';
  var tsMs = checkpoint.timestamp ? new Date(checkpoint.timestamp).getTime() : NaN;
  var elapsed = isNaN(tsMs) ? 0 : Date.now() - tsMs;
  var agoLabel = formatDuration(elapsed) + ' ago';
  var cmd = 'hive-mind approve';
  if (checkpoint.awaiting === 'ship') cmd = 'hive-mind approve  (ships to git)';
  var html = '<div class="checkpoint-banner">';
  html += '<div class="checkpoint-hex"></div>';
  html += '<div class="checkpoint-content">';
  html += '<div class="checkpoint-label">Action Required</div>';
  html += '<div class="checkpoint-title">Pipeline paused at ' + escapeHtml(checkpoint.awaiting) + '</div>';
  html += '<div class="checkpoint-msg">' + escapeHtml(checkpoint.message || 'Review and approve to continue.') + '</div>';
  html += '<span class="checkpoint-cmd">' + escapeHtml(cmd) + '</span>';
  html += '</div>';
  html += '<div class="checkpoint-elapsed">' + agoLabel + '</div>';
  html += '</div>';
  return html;
}

function renderAwaitingData() {
  return '<div class="awaiting-data">' +
    '<div class="hex-spinner"></div>' +
    '<div class="awaiting-data-title">Awaiting pipeline data</div>' +
    '<div class="awaiting-data-desc">The pipeline has started. Waiting for execution plan...</div>' +
    '</div>';
}

function renderShutdownBanner(shutdownAt) {
  if (!shutdownAt) return '';
  var remaining = Math.max(0, Math.floor((shutdownAt - Date.now()) / 1000));
  var label = remaining > 0 ? ('Server shutting down in ' + formatDurationSec(remaining)) : 'Pipeline complete. Server stopped.';
  return '<div class="shutdown-banner" id="shutdownBanner">' +
    '<div class="shutdown-dot"></div>' +
    '<div>' +
      '<div class="shutdown-title">Pipeline Complete</div>' +
      '<div class="shutdown-desc" id="shutdownDesc">' + escapeHtml(label) + '</div>' +
    '</div>' +
  '</div>';
}

function renderStepper(stages, stories) {
  var passed = 0;
  var total = 0;
  if (stories) {
    total = stories.length;
    for (var i = 0; i < stories.length; i++) {
      if (stories[i].status === 'passed') passed++;
    }
  }
  var pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  var html = '<div class="card"><div class="card-header"><span class="card-title">Pipeline Progress</span></div>';
  html += '<div class="card-body" style="position:relative;overflow:hidden;">';

  /* Logo watermark */
  html += '<svg style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:200px;height:200px;opacity:0.035;pointer-events:none;" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">';
  html += '<polygon points="100,50 143,72 143,118 100,140 57,118 57,72" fill="none" stroke="#16a34a" stroke-width="3"/>';
  html += '<polygon points="100,66 124,78 124,108 100,120 76,108 76,78" fill="none" stroke="#16a34a" stroke-width="2"/>';
  html += '<polygon points="100,78 112,84 112,102 100,108 88,102 88,84" fill="none" stroke="#16a34a" stroke-width="1.5"/>';
  html += '<line x1="100" y1="50" x2="100" y2="140" stroke="#16a34a" stroke-width="1.5"/>';
  html += '<line x1="57" y1="72" x2="143" y2="118" stroke="#16a34a" stroke-width="1.5"/>';
  html += '<line x1="143" y1="72" x2="57" y2="118" stroke="#16a34a" stroke-width="1.5"/>';
  html += '<line x1="100" y1="50" x2="100" y2="16" stroke="#16a34a" stroke-width="2"/>';
  html += '<line x1="143" y1="72" x2="170" y2="50" stroke="#16a34a" stroke-width="2"/>';
  html += '<line x1="143" y1="118" x2="170" y2="142" stroke="#16a34a" stroke-width="2"/>';
  html += '<line x1="100" y1="140" x2="100" y2="174" stroke="#16a34a" stroke-width="2"/>';
  html += '<line x1="57" y1="118" x2="30" y2="142" stroke="#16a34a" stroke-width="2"/>';
  html += '<line x1="57" y1="72" x2="30" y2="50" stroke="#16a34a" stroke-width="2"/>';
  html += '<circle cx="100" cy="16" r="5" fill="#16a34a"/><circle cx="170" cy="50" r="5" fill="#16a34a"/>';
  html += '<circle cx="170" cy="142" r="5" fill="#16a34a"/><circle cx="100" cy="174" r="5" fill="#16a34a"/>';
  html += '<circle cx="30" cy="142" r="5" fill="#16a34a"/><circle cx="30" cy="50" r="5" fill="#16a34a"/>';
  html += '</svg>';

  html += '<div class="stepper">';
  for (var s = 0; s < stages.length; s++) {
    var stage = stages[s];
    var cls = stage.status === 'done' ? 'done' : (stage.status === 'running' ? 'running' : (stage.status === 'paused' ? 'paused' : ''));
    var inner = '';
    if (stage.status === 'done') {
      inner = '&#10003;';
    } else if (stage.status === 'running' && stage.key === 'execute' && stories) {
      inner = passed + '/' + total;
    } else {
      inner = String(s + 1);
    }
    var timeLabel = stage.durationMs ? formatDuration(stage.durationMs) : '--';

    html += '<div class="step ' + cls + '">';
    html += '<div class="step-hex"><div class="step-hex-inner">' + inner + '</div></div>';
    html += '<div class="step-label">' + escapeHtml(stage.label) + '</div>';
    html += '<div class="step-time">' + timeLabel + '</div>';
    html += '</div>';

    /* Connector between steps */
    if (s < stages.length - 1) {
      var connCls = '';
      if (stage.status === 'done' && stages[s + 1].status === 'done') connCls = 'done';
      else if (stage.status === 'done' && (stages[s + 1].status === 'running' || stages[s + 1].status === 'paused')) connCls = 'active';
      html += '<div class="step-connector ' + connCls + '"></div>';
    }
  }
  html += '</div></div>';

  /* Progress bar */
  html += '<div class="progress-section">';
  html += '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>';
  html += '<div class="progress-text">' + pct + '% <small>Story Progress: ' + passed + ' of ' + total + '</small></div>';
  html += '</div></div>';

  return html;
}

function renderStatsRow(counts) {
  var queued = counts.pending + counts.blocked;
  return '<div class="stats-row">' +
    '<div class="stat-card"><div class="stat-value green">' + counts.passed + '</div><div class="stat-label">Passed</div></div>' +
    '<div class="stat-card"><div class="stat-value amber">' + counts.running + '</div><div class="stat-label">Running</div></div>' +
    '<div class="stat-card"><div class="stat-value red">' + counts.failed + '</div><div class="stat-label">Failed</div></div>' +
    '<div class="stat-card"><div class="stat-value">' + queued + '</div><div class="stat-label">Queued</div></div>' +
  '</div>';
}

function renderStoryCard(story, idx, costByStory, now) {
  var cssStatus = statusToCssStatus(story.status);
  var isExpanded = expandedStories[story.id] === true;
  var expandedCls = isExpanded ? ' expanded' : '';
  /* For in-progress: wall clock elapsed. For done: agent compute time. */
  var storyDur = story.durationMs;
  var storyCost = null;
  if (costByStory && costByStory[story.id]) {
    if (!storyDur) storyDur = costByStory[story.id].maxDuration;
    storyCost = costByStory[story.id].totalCost;
    /* In-progress stories: show wall clock since first agent started */
    if (story.status === 'in-progress' && costByStory[story.id].firstTs) {
      storyDur = now - costByStory[story.id].firstTs;
    }
  }
  var durationLabel = storyDur ? formatDuration(storyDur) : '--';
  if (storyCost && storyCost > 0) {
    durationLabel = durationLabel + ' / ' + formatCost(storyCost);
  }
  var indexLabel = String(idx + 1);
  if (indexLabel.length < 2) indexLabel = '0' + indexLabel;

  var substageHtml = '';
  if (story.status === 'running' && story.substage) {
    substageHtml = '<span class="story-substage">' + escapeHtml(story.substage) + '</span>';
  }

  var waveLabel = story.wave != null ? ' [W' + story.wave + ']' : '';

  var html = '<div class="story-card' + expandedCls + '" data-status="' + cssStatus + '" data-story-id="' + escapeHtml(story.id) + '">';
  html += '<div class="story-header">';
  html += '<span class="story-status-hex"></span>';
  html += '<span class="story-index">' + indexLabel + '</span>';
  html += '<span class="story-name">' + escapeHtml(story.id + ': ' + (story.title || 'Untitled') + waveLabel) + '</span>';
  html += substageHtml;
  html += '<span class="story-duration">' + durationLabel + '</span>';
  html += '<span class="story-chevron">&#9654;</span>';
  html += '</div>';

  /* Detail section */
  html += '<div class="story-detail">';

  /* Show log content if loaded */
  var logData = storyLogCache[story.id];
  if (logData && logData.lines.length > 0) {
    html += '<div class="log-output" id="log-' + escapeHtml(story.id) + '">';
    for (var i = 0; i < logData.lines.length; i++) {
      var line = escapeHtml(logData.lines[i]);
      var cls = '';
      if (line.indexOf('PASS') !== -1 || line.indexOf('passed') !== -1 || line.indexOf('completed') !== -1) cls = 'log-pass';
      else if (line.indexOf('FAIL') !== -1 || line.indexOf('failed') !== -1 || line.indexOf('ERROR') !== -1) cls = 'log-fail';
      else cls = 'log-info';
      html += '<span class="' + cls + '">' + line + '</span>' + String.fromCharCode(10);
    }
    html += '</div>';
    if (logData.nextOffset != null) {
      html += '<button class="log-more-btn">Show more</button>';
    }
  } else if (logData && logData.lines.length === 0 && logData.nextOffset == null) {
    html += '<div class="log-output"><span class="log-info">No log output available yet.</span></div>';
  } else {
    html += '<div class="log-output"><span class="log-info">Loading logs...</span></div>';
  }

  html += '</div></div>';
  return html;
}

function buildCostByStory(costLog) {
  var map = {};
  if (!costLog) return map;
  for (var i = 0; i < costLog.length; i++) {
    var entry = costLog[i];
    var sid = entry.storyId;
    if (!sid) continue;
    if (!map[sid]) map[sid] = { totalCost: 0, maxDuration: 0, firstTs: null };
    if (entry.costUsd) map[sid].totalCost += entry.costUsd;
    if (entry.durationMs && entry.durationMs > map[sid].maxDuration) map[sid].maxDuration = entry.durationMs;
    if (entry.timestamp) {
      var entryTs = new Date(entry.timestamp).getTime();
      if (!map[sid].firstTs || entryTs < map[sid].firstTs) map[sid].firstTs = entryTs;
    }
  }
  return map;
}

function renderStories(stories, costLog, now) {
  if (!stories || stories.length === 0) {
    return '<div class="card"><div class="card-header"><span class="card-title">Stories</span></div>' +
      '<div class="card-body"><div class="awaiting-data"><div class="awaiting-data-desc">No stories in execution plan yet.</div></div></div></div>';
  }

  var costByStory = buildCostByStory(costLog);
  var html = '<div class="card"><div class="card-header"><span class="card-title">Stories</span></div>';
  html += '<div class="card-body" style="padding:8px"><div class="story-list">';
  for (var i = 0; i < stories.length; i++) {
    html += renderStoryCard(stories[i], i, costByStory, now);
  }
  html += '</div></div></div>';
  return html;
}

function deriveStoryCost(costLog) {
  var total = 0;
  if (!costLog) return 0;
  for (var i = 0; i < costLog.length; i++) {
    var entry = costLog[i];
    if (entry.storyId && entry.storyId.indexOf('US-') === 0 && entry.costUsd) {
      total += entry.costUsd;
    }
  }
  return total;
}

function renderBudgetSidebar(costTotals, costLog) {
  var storyCost = deriveStoryCost(costLog);
  var html = '<div class="card"><div class="card-header"><span class="card-title">Budget</span></div><div class="card-body">';
  html += '<div class="cost-big">' + formatCost(costTotals.totalCost) + '</div>';
  html += '<div class="cost-budget">API value (est.)</div>';
  html += '<div class="cost-budget" style="font-size:11px;margin-top:2px;color:var(--text-dim)">Compute value -- not billed on Max plan</div>';
  html += '<div class="cost-budget" style="font-size:12px;margin-top:4px;">story-only: ' + formatCost(storyCost) + '</div>';
  html += '<div class="cost-grid">';
  html += '<div class="cost-item"><div class="cost-item-value">' + costTotals.agentCount + '</div><div class="cost-item-label">Agents Run</div></div>';
  html += '<div class="cost-item"><div class="cost-item-value">' + formatDuration(costTotals.totalDurationMs) + '</div><div class="cost-item-label">Agent Time</div></div>';
  html += '</div></div></div>';
  return html;
}

function renderTokenTable(stories) {
  if (!stories || stories.length === 0) return '';
  var hasAnyTokens = false;
  for (var i = 0; i < stories.length; i++) {
    if (stories[i].tokensUsed > 0) { hasAnyTokens = true; break; }
  }
  if (!hasAnyTokens) return '';

  var maxTokens = 1;
  for (var j = 0; j < stories.length; j++) {
    if (stories[j].tokensUsed > maxTokens) maxTokens = stories[j].tokensUsed;
  }

  var html = '<div class="card"><div class="card-header"><span class="card-title">Tokens per Story</span></div>';
  html += '<div class="card-body" style="padding:12px 20px"><table class="token-table"><thead><tr><th>Story</th><th>Used</th><th>Budget</th></tr></thead><tbody>';

  for (var k = 0; k < stories.length; k++) {
    var s = stories[k];
    if (!s.tokensUsed && !s.tokenBudget) continue;
    var rowCls = s.status === 'failed' ? ' class="failed"' : (s.status === 'running' ? ' class="running"' : '');
    var barCls = s.status === 'failed' ? 'failed' : (s.status === 'running' ? 'running' : '');
    var barPct = maxTokens > 0 ? Math.round((s.tokensUsed || 0) / maxTokens * 100) : 0;
    html += '<tr' + rowCls + '><td><span class="mini-bar ' + barCls + '" style="width:' + barPct + '%"></span>' + escapeHtml(s.id) + '</td>';
    html += '<td>' + formatTokens(s.tokensUsed || 0) + '</td>';
    html += '<td>' + formatTokens(s.tokenBudget || 0) + '</td></tr>';
  }

  html += '</tbody></table></div></div>';
  return html;
}

function renderStageTiming(stages) {
  var maxMs = 1;
  for (var i = 0; i < stages.length; i++) {
    if (stages[i].durationMs && stages[i].durationMs > maxMs) maxMs = stages[i].durationMs;
  }

  var html = '<div class="card"><div class="card-header"><span class="card-title">Stage Timing</span></div><div class="card-body">';
  for (var s = 0; s < stages.length; s++) {
    var stage = stages[s];
    var pct = stage.durationMs ? Math.round(stage.durationMs / maxMs * 100) : 0;
    var fillCls = stage.status === 'running' ? ' running' : '';
    var timeLabel = stage.durationMs ? formatDuration(stage.durationMs) : '--';
    var barWidth = (timeLabel === '--') ? 0 : pct;
    html += '<div class="timing-row">';
    html += '<span class="timing-label">' + escapeHtml(stage.label) + '</span>';
    html += '<div class="timing-bar"><div class="timing-fill' + fillCls + '" style="width:' + barWidth + '%"></div></div>';
    html += '<span class="timing-value">' + timeLabel + '</span>';
    html += '</div>';
  }
  html += '</div></div>';
  return html;
}

var lastRenderedStatuses = {}; /* storyId -> status string from last full render */
var lastRenderHadStories = false;

function renderAll() {
  var main = document.getElementById('mainContent');
  if (!state) {
    main.innerHTML = renderAwaitingData();
    lastRenderHadStories = false;
    return;
  }

  var now = Date.now();
  var stories = (state.executionPlan && state.executionPlan.stories) ? state.executionPlan.stories : null;
  var managerLog = state.managerLog || [];
  var costLog = state.costLog || [];
  var shutdownAt = state.shutdownAt || null;

  var stages = deriveStages(managerLog);
  var counts = deriveCounts(stories);
  var costTotals = deriveCostTotals(costLog);

  /* Derive run-id from working directory or first log entry */
  var runIdEl = document.getElementById('runId');
  if (runIdEl && managerLog.length > 0 && managerLog[0].runId) {
    runIdEl.textContent = managerLog[0].runId;
  } else if (runIdEl && runIdEl.textContent === '--' && managerLog.length > 0) {
    var d = new Date(managerLog[0].timestamp);
    runIdEl.textContent = 'run-' + d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* Save scroll positions of expanded story log panels before re-render */
  var savedScrolls = {};
  var storyListEl = main.querySelector('.story-list');
  if (storyListEl) {
    var expandedCards = storyListEl.querySelectorAll('.story-card.expanded');
    for (var ec = 0; ec < expandedCards.length; ec++) {
      var ecId = expandedCards[ec].getAttribute('data-story-id');
      var ecLog = expandedCards[ec].querySelector('.log-output');
      if (ecId && ecLog) savedScrolls[ecId] = ecLog.scrollTop;
    }
  }

  /* Full re-render (expandedStories map preserves expand state in renderStoryCard) */
  if (false) {
    /* Dead code -- differential path disabled for reliability */
    var stepperCard = main.querySelector('.card');
    if (stepperCard) {
      var tempSidebar = document.createElement('div');
      tempSidebar.innerHTML = '<div class="sidebar">' +
        renderBudgetSidebar(costTotals, costLog) +
        renderTokenTable(stories) +
        renderStageTiming(stages) +
        '</div>';
      var newSidebar = tempSidebar.firstChild;
      if (newSidebar) sidebarEl.parentNode.replaceChild(newSidebar, sidebarEl);
    }

    /* Update shutdown banner */
    var existingBanner = main.querySelector('.shutdown-banner');
    if (shutdownAt && !existingBanner) {
      var tempBanner = document.createElement('div');
      tempBanner.innerHTML = renderShutdownBanner(shutdownAt);
      if (tempBanner.firstChild) main.insertBefore(tempBanner.firstChild, main.firstChild);
    }

    /* Differential story card updates */
    var costByStory = buildCostByStory(costLog);
    var existingCards = storyListEl.querySelectorAll('.story-card');
    for (var si = 0; si < stories.length; si++) {
      var story = stories[si];
      var oldStatus = lastRenderedStatuses[story.id];
      var isExpanded = expandedStories[story.id] === true;

      var wasExpanded = existingCards[si] && existingCards[si].classList.contains('expanded');
      /* Skip re-render if status unchanged AND expanded state unchanged (preserve scroll/state) */
      if (oldStatus === story.status && isExpanded === wasExpanded && existingCards[si]) {
        /* Only update duration text in the header */
        var durEl = existingCards[si].querySelector('.story-duration');
        if (durEl) {
          var storyDur = story.durationMs;
          var storyCost = null;
          if (costByStory && costByStory[story.id]) {
            if (!storyDur) storyDur = costByStory[story.id].maxDuration;
            storyCost = costByStory[story.id].totalCost;
          }
          var durationLabel = storyDur ? formatDuration(storyDur) : '--';
          if (storyCost && storyCost > 0) {
            durationLabel = durationLabel + ' / ' + formatCost(storyCost);
          }
          durEl.textContent = durationLabel;
        }
        lastRenderedStatuses[story.id] = story.status;
        continue;
      }

      /* Status changed or not expanded: safe to re-render this card */
      if (existingCards[si]) {
        var scrollTop = 0;
        if (isExpanded) {
          var logPanel = existingCards[si].querySelector('.log-output');
          if (logPanel) scrollTop = logPanel.scrollTop;
        }
        var tempCard = document.createElement('div');
        tempCard.innerHTML = renderStoryCard(story, si, costByStory, now);
        var newCard = tempCard.firstChild;
        if (newCard) {
          storyListEl.replaceChild(newCard, existingCards[si]);
          /* Restore scroll position for expanded cards */
          if (isExpanded && scrollTop > 0) {
            var newLogPanel = newCard.querySelector('.log-output');
            if (newLogPanel) newLogPanel.scrollTop = scrollTop;
          }
        }
      }
      lastRenderedStatuses[story.id] = story.status;
    }
    return;
  }

  /* Full render path (first render or no stories yet) */
  var html = '';

  /* Shutdown banner */
  if (shutdownAt) {
    html += renderShutdownBanner(shutdownAt);
  }

  /* Checkpoint banner */
  if (state.checkpoint && state.checkpoint.awaiting) {
    html += renderCheckpointBanner(state.checkpoint);
  }

  if (!stories) {
    /* No execution plan yet -- show stepper only if we have log data */
    if (managerLog.length > 0) {
      html += renderStepper(stages, null);
      var preExecAgents = deriveActiveAgents(null, managerLog, []);
      html += renderActiveAgents(preExecAgents);
    }
    html += renderAwaitingData();
    main.innerHTML = html;
    lastRenderHadStories = false;
    return;
  }

  /* Pipeline stepper */
  html += renderStepper(stages, stories);

  /* Stats row */
  html += renderStatsRow(counts);

  /* Active agents panel */
  var activeAgents = deriveActiveAgents(stories, managerLog, costLog);
  html += renderActiveAgents(activeAgents);

  /* Two-col: stories + sidebar */
  html += '<div class="two-col">';
  html += renderStories(stories, costLog, now);
  html += '<div class="sidebar">';
  html += renderBudgetSidebar(costTotals, costLog);
  html += renderTokenTable(stories);
  html += renderStageTiming(stages);
  html += '</div></div>';

  main.innerHTML = html;

  /* Restore scroll positions for expanded story log panels */
  for (var scrollId in savedScrolls) {
    if (savedScrolls.hasOwnProperty(scrollId)) {
      var restoredCard = main.querySelector('.story-card[data-story-id="' + scrollId + '"] .log-output');
      if (restoredCard) restoredCard.scrollTop = savedScrolls[scrollId];
    }
  }

  /* Record rendered statuses */
  lastRenderHadStories = true;
  for (var ri = 0; ri < stories.length; ri++) {
    lastRenderedStatuses[stories[ri].id] = stories[ri].status;
  }
}

/* ===== ELAPSED TIMER ===== */
function updateElapsed() {
  if (!pipelineStartTs) {
    document.getElementById('globalElapsed').textContent = '--';
    return;
  }
  document.getElementById('globalElapsed').textContent = formatDuration(Date.now() - pipelineStartTs);
}

/* ===== STORY INTERACTION ===== */
function toggleStory(storyId) {
  if (expandedStories[storyId]) {
    delete expandedStories[storyId];
  } else {
    expandedStories[storyId] = true;
    /* Fetch logs if not cached */
    if (!storyLogCache[storyId]) {
      fetchStoryLogs(storyId, 0);
    }
  }
  renderAll();
}

function fetchStoryLogs(storyId, offset) {
  if (!storyLogCache[storyId]) {
    storyLogCache[storyId] = { lines: [], nextOffset: null, loading: false };
  }
  var cache = storyLogCache[storyId];
  if (cache.loading) return;
  cache.loading = true;

  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/story/' + encodeURIComponent(storyId) + '/logs?offset=' + offset);
  xhr.onload = function() {
    cache.loading = false;
    if (xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        for (var i = 0; i < data.lines.length; i++) {
          cache.lines.push(data.lines[i]);
        }
        cache.nextOffset = data.nextOffset;
      } catch (e) { /* ignore parse errors */ }
    }
    renderAll();
  };
  xhr.onerror = function() {
    cache.loading = false;
  };
  xhr.send();
}

function loadMoreLogs(storyId) {
  var cache = storyLogCache[storyId];
  if (cache && cache.nextOffset != null) {
    fetchStoryLogs(storyId, cache.nextOffset);
  }
}

/* ===== NOTIFICATIONS ===== */
function toggleNotifications() {
  var btn = document.getElementById('notifBtn');
  if (notificationsEnabled) {
    notificationsEnabled = false;
    btn.textContent = 'Notifications Off';
    btn.style.background = '#ddd9d0';
    btn.style.borderColor = '#9ca3af';
    btn.style.color = '#9ca3af';
  } else {
    notificationsEnabled = true;
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    btn.textContent = 'Notifications On';
    btn.style.background = '';
    btn.style.borderColor = '';
    btn.style.color = '';
  }
}

function showToast(msg, type) {
  var c = document.getElementById('toastContainer');
  var t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(function() { t.remove(); }, 4500);
}

function sendDesktopNotification(title, body) {
  if (!notificationsEnabled) return;
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: body });
  }
}

/* ===== STATUS CHANGE DETECTION ===== */
function detectChanges(newStories) {
  if (!newStories) return;
  for (var i = 0; i < newStories.length; i++) {
    var s = newStories[i];
    var prev = previousStatuses[s.id];
    if (prev && prev !== s.status) {
      if (s.status === 'passed') {
        showToast(s.id + ' passed', 'success');
        sendDesktopNotification('Story Passed', s.id + ': ' + (s.title || ''));
      } else if (s.status === 'failed') {
        showToast(s.id + ' failed', 'error');
        sendDesktopNotification('Story Failed', s.id + ': ' + (s.title || ''));
      } else if (s.status === 'running') {
        showToast(s.id + ' started', '');
      }
      /* Invalidate log cache on status change so we re-fetch */
      if (expandedStories[s.id]) {
        storyLogCache[s.id] = null;
        fetchStoryLogs(s.id, 0);
      }
    }
    previousStatuses[s.id] = s.status;
  }
}

/* ===== SHUTDOWN COUNTDOWN ===== */
function updateShutdownCountdown() {
  if (!state || !state.shutdownAt) return;
  var el = document.getElementById('shutdownDesc');
  if (!el) return;
  var remaining = Math.max(0, Math.floor((state.shutdownAt - Date.now()) / 1000));
  if (remaining > 0) {
    el.textContent = 'Server shutting down in ' + formatDurationSec(remaining);
  } else {
    el.textContent = 'Pipeline complete. Server stopped.';
  }
}

/* ===== POLLING ===== */
function pollStatus() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/status');
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        state = data;

        /* Derive pipeline start timestamp from the FIRST PIPELINE_START entry */
        if (data.managerLog && data.managerLog.length > 0 && !pipelineStartTs) {
          for (var pi = 0; pi < data.managerLog.length; pi++) {
            if (data.managerLog[pi] && data.managerLog[pi].action === 'PIPELINE_START') {
              pipelineStartTs = new Date(data.managerLog[pi].timestamp).getTime();
              break;
            }
          }
          if (!pipelineStartTs) {
            pipelineStartTs = new Date(data.managerLog[0].timestamp).getTime();
          }
        }

        /* Detect story status changes for notifications */
        var stories = (data.executionPlan && data.executionPlan.stories) ? data.executionPlan.stories : null;
        detectChanges(stories);

        /* Detect checkpoint for notification */
        if (data.checkpoint && data.checkpoint.awaiting) {
          var cpKey = data.checkpoint.awaiting + ':' + data.checkpoint.timestamp;
          if (cpKey !== previousCheckpoint) {
            previousCheckpoint = cpKey;
            sendDesktopNotification(
              'Hive Mind — Action Required',
              'Pipeline paused at ' + data.checkpoint.awaiting + '. Run: hive-mind approve'
            );
            showToast('Checkpoint: ' + data.checkpoint.awaiting, 'warning');
          }
        } else {
          previousCheckpoint = null;
        }

        /* Update title */
        if (data.checkpoint && data.checkpoint.awaiting) {
          document.title = 'ACTION REQUIRED — Hive Mind';
        } else if (data.shutdownAt) {
          document.title = 'Hive Mind - Complete';
        } else {
          document.title = 'Hive Mind // Pipeline Dashboard';
        }

        /* Start shutdown countdown if present */
        if (data.shutdownAt && !shutdownCountdownHandle) {
          shutdownCountdownHandle = setInterval(updateShutdownCountdown, 1000);
        }

        renderAll();
      } catch (e) { /* ignore parse errors */ }
    }
  };
  xhr.onerror = function() { /* silently retry next interval */ };
  xhr.send();
}

/* ===== INIT ===== */

/* Event delegation for story card expand/collapse */
var mainEl = document.getElementById('mainContent');
if (mainEl) {
  mainEl.addEventListener('click', function(e) {
    var btn = e.target.closest('.log-more-btn');
    if (btn) {
      e.stopPropagation();
      var card = btn.closest('.story-card');
      if (card) loadMoreLogs(card.getAttribute('data-story-id'));
      return;
    }
    var header = e.target.closest('.story-header');
    if (!header) return;
    var card = header.closest('.story-card');
    if (!card) return;
    var storyId = card.getAttribute('data-story-id');
    if (storyId) toggleStory(storyId);
  });
}

pollStatus();
setInterval(pollStatus, 2000);
elapsedTimerHandle = setInterval(updateElapsed, 1000);
</script>

</body>
</html>
`;

export async function startDashboard(
  dirs: PipelineDirs,
  _config: HiveMindConfig,
  portOverride?: number,
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

  const DEFAULT_PORT = 4040;
  const MAX_PORT_ATTEMPTS = 10;

  function tryListen(port: number, attempt: number): Promise<DashboardHandle> {
    return new Promise<DashboardHandle>((resolvePromise, rejectPromise) => {
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && attempt < MAX_PORT_ATTEMPTS) {
          server.removeAllListeners("error");
          tryListen(port + 1, attempt + 1).then(resolvePromise, rejectPromise);
        } else {
          clearInterval(pollTimer);
          rejectPromise(new Error(`Dashboard failed to bind port: ${err.message}`));
        }
      });

      server.listen(port, () => {
        const address = server.address();
        const boundPort = typeof address === "object" && address ? address.port : port;
        const url = `http://localhost:${boundPort}`;

        openBrowser(url);

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

  if (portOverride !== undefined) {
    // Direct port (used by tests with port 0 for random assignment)
    return new Promise<DashboardHandle>((resolvePromise, rejectPromise) => {
      server.on("error", (err) => {
        clearInterval(pollTimer);
        rejectPromise(new Error(`Dashboard failed to bind port: ${err.message}`));
      });
      server.listen(portOverride, () => {
        const address = server.address();
        const boundPort = typeof address === "object" && address ? address.port : portOverride;
        const url = `http://localhost:${boundPort}`;
        openBrowser(url);
        resolvePromise({
          stop: () => { clearInterval(pollTimer); server.close(); },
          url,
          signalShutdown: (shutdownAt: number) => { cached.shutdownAt = shutdownAt; },
        });
      });
    });
  }
  return tryListen(DEFAULT_PORT, 1);
}
