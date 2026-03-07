import { exec } from "node:child_process";

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
    exec(
      command,
      {
        cwd: options?.cwd,
        timeout: options?.timeout ?? 120_000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: String(stdout),
          stderr: String(stderr),
          exitCode: error?.code ?? (error ? 1 : 0),
        });
      },
    );
  });
}
