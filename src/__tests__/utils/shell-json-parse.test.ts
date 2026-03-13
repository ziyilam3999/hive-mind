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

  it("parses CLI array format with total_cost_usd (real CLI output)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cliOutput = JSON.stringify([
      { type: "system", subtype: "init", session_id: "s1", model: "sonnet" },
      { type: "assistant", message: { content: [{ type: "text", text: "done" }] } },
      { type: "result", subtype: "success", result: "done", total_cost_usd: 0.05, duration_ms: 3200, session_id: "s1", model: "sonnet" },
    ]);
    vi.mocked(spawn).mockReturnValue(createMockChild(cliOutput) as never);

    const result = await spawnClaude({
      model: "sonnet",
      prompt: "test",
      outputFormat: "json",
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(result.json).toBeDefined();
    expect(result.json!.cost_usd).toBe(0.05);
    expect(result.json!.result).toBe("done");
    expect(result.json!.duration_ms).toBe(3200);
    expect(result.json!.session_id).toBe("s1");

    warnSpy.mockRestore();
  });

  it("falls back to cost_usd for legacy single-object format", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const validJson = JSON.stringify({
      result: "done",
      cost_usd: 0.03,
      model: "sonnet",
      session_id: "s1",
      duration_ms: 1500,
    });
    vi.mocked(spawn).mockReturnValue(createMockChild(validJson) as never);

    const result = await spawnClaude({
      model: "sonnet",
      prompt: "test",
      outputFormat: "json",
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(result.json).toBeDefined();
    expect(result.json!.cost_usd).toBe(0.03);

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
