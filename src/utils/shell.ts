import { spawn, type ChildProcess } from "node:child_process";

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
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
}

export function spawnClaude(options: ClaudeSpawnOptions): Promise<ClaudeSpawnResult> {
  return new Promise((resolve) => {
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
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ exitCode: 1, stderr: stderr + "\n[spawnClaude] Timed out", stdout });
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timer);

      let json: ClaudeJsonResult | undefined;
      if (options.outputFormat === "json") {
        try {
          const parsed = JSON.parse(stdout) as Record<string, unknown>;
          json = {
            result: typeof parsed.result === "string" ? parsed.result : stdout,
            cost_usd: typeof parsed.cost_usd === "number" ? parsed.cost_usd : 0,
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

      resolve({ exitCode: code ?? 1, stderr, stdout, json });
    });
  });
}
