import { spawn } from "node:child_process";

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
