import { execFile } from "node:child_process";

/**
 * Notify the user that a checkpoint has been reached.
 * Layer 1: BEL character to terminal.
 * Layer 2: Platform-specific desktop notification via execFile (safe from injection).
 * Suppressed in silent mode (--silent flag, CI environments).
 */
export function notifyCheckpoint(silent: boolean, message?: string): void {
  if (silent) return;
  process.stdout.write("\x07");

  const title = "Hive Mind";
  const body = message || "Pipeline checkpoint reached";
  const platform = process.platform;

  if (platform === "win32") {
    // Use -File with a script block via -Command, passing title/body as env vars to avoid injection
    const script = `[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(5000,$env:HM_TITLE,$env:HM_BODY,[System.Windows.Forms.ToolTipIcon]::Warning); Start-Sleep -Seconds 6; $n.Dispose()`;
    execFile("powershell", ["-Command", script], { timeout: 10000, env: { ...process.env, HM_TITLE: title, HM_BODY: body } }, () => {});
  } else if (platform === "darwin") {
    // osascript receives the full AppleScript as a single -e argument — no shell interpolation
    const escaped = body.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const titleEsc = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    execFile("osascript", ["-e", `display notification "${escaped}" with title "${titleEsc}"`], { timeout: 10000 }, () => {});
  } else {
    execFile("notify-send", [title, body], { timeout: 10000 }, () => {});
  }
}
