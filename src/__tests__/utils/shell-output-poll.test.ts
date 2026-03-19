import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process before importing spawnClaude
const mockKill = vi.fn();
const mockOn = vi.fn();
const mockStdinWrite = vi.fn();
const mockStdinEnd = vi.fn();
const mockStdoutOn = vi.fn();
const mockStderrOn = vi.fn();

let closeHandler: ((code: number | null) => void) | undefined;

const mockChild = {
  kill: mockKill,
  on: mockOn,
  stdin: { write: mockStdinWrite, end: mockStdinEnd },
  stdout: { on: mockStdoutOn },
  stderr: { on: mockStderrOn },
};

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    // Capture the close handler when it's registered
    mockOn.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (event === "close") {
        closeHandler = handler as (code: number | null) => void;
      }
    });
    return mockChild;
  }),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

import { spawnClaude } from "../../utils/shell.js";
import { existsSync } from "node:fs";

describe("spawnClaude output file polling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    closeHandler = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("kills process when output file detected", async () => {
    const mockedExistsSync = vi.mocked(existsSync);
    // File doesn't exist initially (stale check + first poll), then appears on second poll
    mockedExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);

    const promise = spawnClaude({
      model: "sonnet",
      prompt: "test",
      outputFile: "/tmp/output.md",
      outputPollIntervalMs: 1000,
    });

    // First poll — file not found yet
    vi.advanceTimersByTime(1000);
    expect(mockKill).not.toHaveBeenCalled();

    // Second poll — file found
    vi.advanceTimersByTime(1000);
    expect(mockKill).toHaveBeenCalledWith("SIGTERM");

    // Simulate close event after kill
    closeHandler!(null);

    const result = await promise;
    expect(result.exitCode).toBe(0);
    expect(result.killedByOutputDetection).toBe(true);
  });

  it("does not poll when outputFile not set", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    const promise = spawnClaude({
      model: "sonnet",
      prompt: "test",
    });

    // No setInterval should be called for polling (only timeout)
    const pollCalls = setIntervalSpy.mock.calls;
    expect(pollCalls).toHaveLength(0);

    // Normal close
    closeHandler!(0);
    const result = await promise;
    expect(result.killedByOutputDetection).toBe(false);

    setIntervalSpy.mockRestore();
  });

  it("cleans up poll timer on normal close", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const promise = spawnClaude({
      model: "sonnet",
      prompt: "test",
      outputFile: "/tmp/output.md",
      outputPollIntervalMs: 1000,
    });

    // Close normally before file appears
    closeHandler!(0);
    const result = await promise;

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(result.killedByOutputDetection).toBe(false);
    expect(result.exitCode).toBe(0);

    clearIntervalSpy.mockRestore();
  });

  it("cleans up poll timer on timeout", async () => {
    const promise = spawnClaude({
      model: "sonnet",
      prompt: "test",
      outputFile: "/tmp/output.md",
      outputPollIntervalMs: 1000,
      timeout: 5000,
    });

    // Advance past timeout
    vi.advanceTimersByTime(5000);

    const result = await promise;
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Timed out");
  });

  it("uses default poll interval of 5000ms", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    spawnClaude({
      model: "sonnet",
      prompt: "test",
      outputFile: "/tmp/output.md",
    });

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    // Clean up
    closeHandler!(0);

    setIntervalSpy.mockRestore();
  });
});
