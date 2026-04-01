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
    mockOn.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (event === "close") {
        closeHandler = handler as (code: number | null) => void;
      }
    });
    return mockChild;
  }),
}));

const mockWriteFileSync = vi.fn<(path: string, data: string, opts?: object) => void>();
const mockUnlinkSync = vi.fn<(path: string) => void>();
const mockExistsSync = vi.fn<(path: string) => boolean>().mockReturnValue(false);

vi.mock("node:fs", () => ({
  existsSync: (...a: [string]) => mockExistsSync(a[0]),
  unlinkSync: (...a: [string]) => mockUnlinkSync(a[0]),
  writeFileSync: (path: string, data: string, opts?: object) => mockWriteFileSync(path, data, opts),
}));

vi.mock("node:os", () => ({
  tmpdir: vi.fn(() => "/tmp"),
}));

vi.mock("node:path", () => ({
  join: vi.fn((...parts: string[]) => parts.join("/")),
}));

import { spawnClaude, clearTempFileTracker } from "../../utils/shell.js";
import { spawn } from "node:child_process";

describe("spawnClaude MCP temp file lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    closeHandler = undefined;
    clearTempFileTracker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("temp file is created before spawn with correct JSON content", async () => {
    const mcpServers = { "test-server": { command: "echo", args: ["hello"] } };

    const promise = spawnClaude({
      model: "sonnet",
      prompt: "test",
      mcpServers,
    });

    // writeFileSync should have been called before spawn
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [filePath, content, opts] = mockWriteFileSync.mock.calls[0];

    // Verify filename pattern
    expect(filePath).toMatch(/hive-mind-mcp-\d+-[a-z0-9]+\.json$/);

    // Verify JSON content
    const parsed = JSON.parse(content as string);
    expect(parsed).toEqual({ mcpServers });

    // Verify file permissions
    expect(opts).toEqual({ mode: 0o600 });

    // Verify --mcp-config appears in spawn args before --dangerously-skip-permissions
    const spawnMock = vi.mocked(spawn);
    const spawnArgs = spawnMock.mock.calls[0][1] as string[];
    const mcpIdx = spawnArgs.indexOf("--mcp-config");
    const dangerIdx = spawnArgs.indexOf("--dangerously-skip-permissions");
    expect(mcpIdx).toBeGreaterThan(-1);
    expect(dangerIdx).toBeGreaterThan(-1);
    expect(mcpIdx).toBeLessThan(dangerIdx);

    // Resolve the promise
    closeHandler?.(0);
    await vi.advanceTimersByTimeAsync(0);
    await promise;
  });

  it("temp file is deleted after close event", async () => {
    const mcpServers = { "test-server": { command: "echo" } };

    const promise = spawnClaude({
      model: "sonnet",
      prompt: "test",
      mcpServers,
    });

    // Get the temp file path that was written
    const tempFilePath = mockWriteFileSync.mock.calls[0][0] as string;

    // Close handler should clean up
    closeHandler?.(0);
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    expect(mockUnlinkSync).toHaveBeenCalledWith(tempFilePath);
  });

  it("cleanup failure does not throw", async () => {
    const mcpServers = { "test-server": { command: "echo" } };

    mockUnlinkSync.mockImplementation(() => {
      throw new Error("ENOENT: file already deleted");
    });

    const promise = spawnClaude({
      model: "sonnet",
      prompt: "test",
      mcpServers,
    });

    // Close handler with throwing unlinkSync should not reject the promise
    closeHandler?.(0);
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    // Verify cleanup was attempted (not silently skipped) AND that the error did not propagate
    expect(mockUnlinkSync).toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
  });

  it("no temp file created when mcpServers is absent", async () => {
    const promise = spawnClaude({
      model: "sonnet",
      prompt: "test",
    });

    expect(mockWriteFileSync).not.toHaveBeenCalled();

    const spawnMock = vi.mocked(spawn);
    const spawnArgs = spawnMock.mock.calls[0][1] as string[];
    expect(spawnArgs).not.toContain("--mcp-config");

    closeHandler?.(0);
    await vi.advanceTimersByTimeAsync(0);
    await promise;
  });

  it("no temp file created when mcpServers is empty object", async () => {
    const promise = spawnClaude({
      model: "sonnet",
      prompt: "test",
      mcpServers: {},
    });

    expect(mockWriteFileSync).not.toHaveBeenCalled();

    const spawnMock = vi.mocked(spawn);
    const spawnArgs = spawnMock.mock.calls[0][1] as string[];
    expect(spawnArgs).not.toContain("--mcp-config");

    closeHandler?.(0);
    await vi.advanceTimersByTimeAsync(0);
    await promise;
  });

  it("throws when mcpServers entry has non-string command", async () => {
    const promise = spawnClaude({
      model: "sonnet",
      prompt: "test",
      mcpServers: { "bad-server": { command: 123 } },
    });

    await expect(promise).rejects.toThrow("mcpServers.bad-server: command must be a string");
  });
});
