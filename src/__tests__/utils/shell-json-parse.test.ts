import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

// Create a mock child process factory
function createMockChild(stdout: string) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable;
    stderr: Readable;
    stdin: Writable;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new Readable({ read() {} });
  child.stderr = new Readable({ read() {} });
  child.stdin = new Writable({
    write(_c: unknown, _e: unknown, cb: () => void) { cb(); },
  });
  child.kill = vi.fn();

  setTimeout(() => {
    child.stdout.push(stdout);
    child.stdout.push(null);
    child.stderr.push(null);
    child.emit("close", 0);
  }, 10);

  return child;
}

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawnClaude } from "../../utils/shell.js";
import { spawn } from "node:child_process";

describe("spawnClaude JSON parse failure (K2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs warning when stdout is not valid JSON", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(spawn).mockReturnValue(createMockChild("This is not JSON at all") as never);

    const result = await spawnClaude({
      model: "sonnet",
      prompt: "test",
      outputFormat: "json",
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[spawnClaude] JSON parse failed"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("This is not JSON"),
    );
    expect(result.json).toBeUndefined();
    expect(result.stdout).toContain("This is not JSON");

    warnSpy.mockRestore();
  });

  it("does not warn when stdout is valid JSON", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const validJson = JSON.stringify({
      result: "done",
      cost_usd: 0.05,
      model: "sonnet",
      session_id: "s1",
      duration_ms: 3200,
    });
    vi.mocked(spawn).mockReturnValue(createMockChild(validJson) as never);

    const result = await spawnClaude({
      model: "sonnet",
      prompt: "test",
      outputFormat: "json",
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(result.json).toBeDefined();
    expect(result.json!.cost_usd).toBe(0.05);

    warnSpy.mockRestore();
  });

  it("does not attempt JSON parse when outputFormat is not json", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(spawn).mockReturnValue(createMockChild("plain text output") as never);

    const result = await spawnClaude({
      model: "sonnet",
      prompt: "test",
      // No outputFormat — defaults to non-json
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(result.json).toBeUndefined();

    warnSpy.mockRestore();
  });
});
