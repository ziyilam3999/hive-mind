import { exec } from "node:child_process";

/**
 * Notify the user that a checkpoint has been reached.
 * Layer 1: BEL character to terminal (existing).
 * Layer 2: Platform-specific desktop notification (new).
 * Suppressed in silent mode (--silent flag, CI environments).
 */
export function notifyCheckpoint(silent: boolean, message?: string): void {
  if (silent) return;
  process.stdout.write("\x07");

  const title = "Hive Mind";
  const body = (message || "Pipeline checkpoint reached").replace(/'/g, "'");
  const platform = process.platform;
  let cmd: string | undefined;

  if (platform === "win32") {
    cmd = `powershell -Command "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(5000,'${title}','${body}',[System.Windows.Forms.ToolTipIcon]::Warning); Start-Sleep -Seconds 6; $n.Dispose()"`;
  } else if (platform === "darwin") {
    cmd = `osascript -e 'display notification "${body}" with title "${title}"'`;
  } else {
    cmd = `notify-send "${title}" "${body}"`;
  }

  if (cmd) {
    exec(cmd, { timeout: 10000 }, () => {});
  }
}
