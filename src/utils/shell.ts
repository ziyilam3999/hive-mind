import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const activeTempFiles = new Set<string>();
let windowsSecretWarningSent = false;

process.on('exit', () => {
  for (const tempFile of activeTempFiles) {
    try { unlinkSync(tempFile); } catch { /* best-effort cleanup */ }
  }
});

/** Exported for test isolation — call in afterEach to prevent cross-test state leakage. */
export function clearTempFileTracker(): void {
  activeTempFiles.clear();
  windowsSecretWarningSent = false;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Diagnostic counter for spawnClaude invocations (Issue 8)
let spawnClaudeInvocationCount = 0;
export function getSpawnClaudeInvocationCount(): number {
  return spawnClaudeInvocationCount;
}

export function runShell(
  command: string,
  options?: { cwd?: string; timeout?: number },
): Promise<ShellResult> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const timeout = options?.timeout ?? 120_000;
    const child = spawn(command, [], {
      cwd: options?.cwd,
      shell: process.platform === "win32" ? "bash" : true,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d; });
    child.stderr.on("data", (d: Buffer) => { stderr += d; });

    const timer = setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr, exitCode: 1 });
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

// ── spawnClaude ─────────────────────────────────────────────────────────────

export interface ClaudeSpawnOptions {
  model: string;
  prompt: string;
  outputFormat?: "json" | "text";
  allowedTools?: string[];
  cwd?: string;
  timeout?: number;
  onData?: (chunk: string) => void;
  outputFile?: string;
  outputPollIntervalMs?: number;
  mcpServers?: Record<string, unknown>;
}

export interface ClaudeJsonResult {
  result: string;
  cost_usd: number;
  model: string;
  session_id: string;
  duration_ms: number;
  raw: Record<string, unknown>;
}

export interface ClaudeSpawnResult {
  exitCode: number;
  stderr: string;
  stdout: string;
  json?: ClaudeJsonResult;
  killedByOutputDetection?: boolean;
  usageLimitHit?: boolean;
}

export function spawnClaude(options: ClaudeSpawnOptions): Promise<ClaudeSpawnResult> {
  return new Promise((resolve) => {
    spawnClaudeInvocationCount++;
    const startTime = Date.now();
    let tempMcpConfigPath: string | undefined;

    // Diagnostic: check if output file already exists (stale from prior run)
    if (options.outputFile && existsSync(options.outputFile)) {
      console.warn(`[spawnClaude] DIAGNOSTIC: Output file already exists before spawn: ${options.outputFile} — deleting stale file`);
      try { unlinkSync(options.outputFile); } catch { /* best-effort */ }
    }

    const args: string[] = [
      "--print",
      "--model", options.model,
    ];

    if (options.outputFormat === "json") {
      args.push("--output-format", "json");
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push("--allowedTools", options.allowedTools.join(","));
    }

    // MCP server temp file lifecycle
    if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
      const mcpServers = options.mcpServers;

      // SEC: runtime paranoia guard — shell layer receives Record<string, unknown>
      for (const [name, entry] of Object.entries(mcpServers)) {
        if (typeof (entry as Record<string, unknown>).command !== 'string') {
          throw new Error(`mcpServers.${name}: command must be a string`);
        }
      }

      // SEC: Windows warning BEFORE writing secrets to disk (CRITICAL-02)
      if (process.platform === 'win32' && !windowsSecretWarningSent &&
          Object.values(mcpServers).some(s => s && typeof s === 'object' && 'env' in (s as Record<string, unknown>))) {
        console.warn('[mcp] WARNING: On Windows, temp MCP config files are not protected by file permissions (0o600 is ignored). Environment variables containing secrets may be readable by other processes.');
        windowsSecretWarningSent = true;
      }

      const filename = `hive-mind-mcp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
      tempMcpConfigPath = join(tmpdir(), filename);
      writeFileSync(tempMcpConfigPath, JSON.stringify({ mcpServers }), { mode: 0o600 });
      activeTempFiles.add(tempMcpConfigPath);

      args.push("--mcp-config", tempMcpConfigPath.replace(/\\/g, '/'));
    }

    args.push("--dangerously-skip-permissions");

    // Prompt via stdin to avoid shell escaping issues on Windows (cmd.exe garbles multi-line args)

    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const child: ChildProcess = spawn("claude", args, {
      cwd: options.cwd,
      env,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Write prompt to stdin and close
    child.stdin!.write(options.prompt);
    child.stdin!.end();

    let stdout = "";
    let stderr = "";

    child.stdout!.on("data", (d: Buffer) => {
      const chunk = d.toString();
      stdout += chunk;
      options.onData?.(chunk);
    });
    child.stderr!.on("data", (d: Buffer) => { stderr += d; });

    const timeout = options.timeout ?? 600_000;
    let killedByOutputDetection = false;

    const timer = setTimeout(() => {
      clearInterval(pollTimer);
      child.kill("SIGTERM");
      resolve({ exitCode: 1, stderr: stderr + "\n[spawnClaude] Timed out", stdout });
    }, timeout);

    let pollTimer: ReturnType<typeof setInterval> | undefined;
    if (options.outputFile) {
      const interval = options.outputPollIntervalMs ?? 5000;
      pollTimer = setInterval(() => {
        if (!killedByOutputDetection && existsSync(options.outputFile!)) {
          killedByOutputDetection = true;
          console.debug(`[spawnClaude] Output file detected, terminating process early: ${options.outputFile}`);
          clearInterval(pollTimer);
          child.kill("SIGTERM");
        }
      }, interval);
    }

    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(pollTimer);

      const exitCode = killedByOutputDetection ? 0 : (code ?? 1);

      let json: ClaudeJsonResult | undefined;
      if (options.outputFormat === "json") {
        try {
          const raw = JSON.parse(stdout);
          // Claude CLI --output-format json returns an array of event objects.
          // The result object (with cost/duration) is the last element with type "result".
          const parsed: Record<string, unknown> = Array.isArray(raw)
            ? (raw.find((o: Record<string, unknown>) => o.type === "result") ?? raw[raw.length - 1] ?? {})
            : raw;
          json = {
            result: typeof parsed.result === "string" ? parsed.result : stdout,
            // Claude CLI uses "total_cost_usd", not "cost_usd"
            cost_usd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd
              : typeof parsed.cost_usd === "number" ? parsed.cost_usd : 0,
            model: typeof parsed.model === "string" ? parsed.model : options.model,
            session_id: typeof parsed.session_id === "string" ? parsed.session_id : "",
            duration_ms: typeof parsed.duration_ms === "number" ? parsed.duration_ms : 0,
            raw: parsed,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[spawnClaude] JSON parse failed — falling back to raw stdout. Error: ${msg}. stdout (first 200 chars): ${stdout.slice(0, 200)}`);
        }
      }

      const durationMs = Date.now() - startTime;

      // Detect usage limit: first check stderr for known patterns
      let usageLimitHit = false;
      const stderrLower = stderr.toLowerCase();
      if (stderrLower.includes("usage limit") || stderrLower.includes("rate limit")
          || stderrLower.includes("too many requests") || stderrLower.includes("429")) {
        usageLimitHit = true;
        console.warn(`[spawnClaude] USAGE LIMIT (stderr match): ${stderr.slice(0, 200)}`);
      }

      // Fallback heuristic: fast exit + no output + non-zero exit code (narrowed from 5000ms to 3000ms)
      if (!usageLimitHit && durationMs < 3000 && !killedByOutputDetection && exitCode !== 0) {
        const hasOutput = options.outputFile ? existsSync(options.outputFile) : stdout.length > 0;
        if (!hasOutput) {
          const noCost = !json || json.cost_usd === undefined || json.cost_usd === 0;
          if (noCost) {
            usageLimitHit = true;
            console.warn(`[spawnClaude] USAGE LIMIT (heuristic): Agent completed in ${durationMs}ms with no output and no cost. exit=${exitCode} stderr=${stderr.slice(0, 200)}`);
          } else {
            console.warn(`[spawnClaude] DIAGNOSTIC: Agent completed in ${durationMs}ms with no output. exit=${exitCode} stderr=${stderr.slice(0, 200)}`);
          }
        }
      }

      // MCP temp file cleanup
      if (tempMcpConfigPath) {
        activeTempFiles.delete(tempMcpConfigPath);
        try { unlinkSync(tempMcpConfigPath); } catch { /* cleanup failure is non-critical */ }
      }

      resolve({ exitCode, stderr, stdout, json, killedByOutputDetection, usageLimitHit });
    });
  });
}
