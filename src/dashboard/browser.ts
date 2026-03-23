import { exec } from "node:child_process";

const VALID_URL = /^http:\/\/localhost:\d{1,5}$/;

export function openBrowser(url: string): void {
  if (!VALID_URL.test(url)) {
    return;
  }

  console.log(`Dashboard: ${url}`);

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
