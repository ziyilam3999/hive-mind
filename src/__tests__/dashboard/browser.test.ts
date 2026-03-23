import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exec } from "node:child_process";
import { openBrowser } from "../../dashboard/browser.js";

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

const mockedExec = vi.mocked(exec);

describe("openBrowser", () => {
  const originalPlatform = process.platform;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockedExec.mockClear();
    logSpy = vi.spyOn(console, "log").mockReturnValue();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("uses start command on win32", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    openBrowser("http://localhost:3000");
    expect(mockedExec).toHaveBeenCalledWith(
      'start "" "http://localhost:3000"',
      { timeout: 5000 },
      expect.any(Function),
    );
  });

  it("uses open command on darwin", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    openBrowser("http://localhost:8080");
    expect(mockedExec).toHaveBeenCalledWith(
      'open "http://localhost:8080"',
      { timeout: 5000 },
      expect.any(Function),
    );
  });

  it("uses xdg-open command on linux", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    openBrowser("http://localhost:4000");
    expect(mockedExec).toHaveBeenCalledWith(
      'xdg-open "http://localhost:4000"',
      { timeout: 5000 },
      expect.any(Function),
    );
  });

  it("swallows exec errors silently", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    openBrowser("http://localhost:3000");
    const callback = mockedExec.mock.calls[0]![2] as (
      err: Error | null,
    ) => void;
    expect(() => callback(new Error("command failed"))).not.toThrow();
  });

  it("prints URL to stdout before exec", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    openBrowser("http://localhost:5000");
    expect(logSpy).toHaveBeenCalledWith("Dashboard: http://localhost:5000");
  });

  it("rejects URLs that are not http://localhost:<port>", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    openBrowser('http://evil.com:3000"; rm -rf /');
    expect(mockedExec).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("rejects URLs with shell metacharacters", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    openBrowser("http://localhost:3000&&whoami");
    expect(mockedExec).not.toHaveBeenCalled();
  });

  it("does not call exec on unknown platform", () => {
    Object.defineProperty(process, "platform", { value: "aix" });
    openBrowser("http://localhost:3000");
    expect(logSpy).toHaveBeenCalledWith("Dashboard: http://localhost:3000");
    expect(mockedExec).not.toHaveBeenCalled();
  });
});
