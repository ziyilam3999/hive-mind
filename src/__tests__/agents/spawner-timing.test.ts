import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentConfig } from "../../types/agents.js";
import type { HiveMindConfig } from "../../config/schema.js";
import { getDefaultConfig } from "../../config/loader.js";

// Mock shell.js — spawnClaude is the real dependency
vi.mock("../../utils/shell.js", () => ({
  spawnClaude: vi.fn(),
  runShell: vi.fn(),
}));

// Mock file-io.js — fileExists check after spawn
vi.mock("../../utils/file-io.js", () => ({
  fileExists: vi.fn(() => true),
  readFileSafe: vi.fn(() => ""),
  ensureDir: vi.fn(),
  writeFileAtomic: vi.fn(),
}));

// Mock prompts.js — buildPrompt
vi.mock("../../agents/prompts.js", () => ({
  buildPrompt: vi.fn(() => "mocked prompt"),
  getAgentRules: vi.fn(() => []),
}));

// Mock tool-permissions.js — getToolsForAgent
vi.mock("../../agents/tool-permissions.js", () => ({
  getToolsForAgent: vi.fn(() => ["Read", "Write"]),
}));

const defaultConfig: HiveMindConfig = getDefaultConfig();

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    type: "researcher",
    model: "sonnet",
    inputFiles: [],
    outputFile: "/tmp/test-output.md",
    rules: [],
    memoryContent: "",
    ...overrides,
  };
}

describe("spawner timing", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("logs per-agent timing with duration", async () => {
    const { spawnClaude } = await import("../../utils/shell.js");
    vi.mocked(spawnClaude).mockResolvedValue({
      exitCode: 0,
      stderr: "",
      stdout: "",
      json: {
        result: "done",
        cost_usd: 0.05,
        model: "sonnet",
        session_id: "sess-1",
        duration_ms: 12000,
        raw: {},
      },
      killedByOutputDetection: false,
    });

    const { spawnAgent } = await import("../../agents/spawner.js");
    await spawnAgent(makeConfig({ type: "researcher" }), defaultConfig);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    const logs: string[] = consoleSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(logs.some((l) => l.includes("[agent:researcher] completed in 12.0s"))).toBe(true);
    expect(logs.some((l) => l.includes("(killed by output detection)"))).toBe(false);

    consoleSpy.mockRestore();
  });

  it("logs kill flag when killedByOutputDetection is true", async () => {
    const { spawnClaude } = await import("../../utils/shell.js");
    vi.mocked(spawnClaude).mockResolvedValue({
      exitCode: 0,
      stderr: "",
      stdout: "",
      json: {
        result: "done",
        cost_usd: 0.03,
        model: "sonnet",
        session_id: "sess-2",
        duration_ms: 8000,
        raw: {},
      },
      killedByOutputDetection: true,
    });

    const { spawnAgent } = await import("../../agents/spawner.js");
    await spawnAgent(makeConfig({ type: "critic" }), defaultConfig);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    const logs: string[] = consoleSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(logs.some((l) => l.includes("[agent:critic] completed in 8.0s"))).toBe(true);
    expect(logs.some((l) => l.includes("(killed by output detection)"))).toBe(true);

    consoleSpy.mockRestore();
  });

  it("returns killedByOutputDetection in AgentResult", async () => {
    const { spawnClaude } = await import("../../utils/shell.js");
    vi.mocked(spawnClaude).mockResolvedValue({
      exitCode: 0,
      stderr: "",
      stdout: "",
      json: {
        result: "done",
        cost_usd: 0.03,
        model: "sonnet",
        session_id: "sess-3",
        duration_ms: 8000,
        raw: {},
      },
      killedByOutputDetection: true,
    });

    const { spawnAgent } = await import("../../agents/spawner.js");
    const result = await spawnAgent(makeConfig({ type: "critic" }), defaultConfig);

    expect(result.killedByOutputDetection).toBe(true);
    expect(result.durationMs).toBe(8000);
    expect(result.costUsd).toBe(0.03);
    expect(result.success).toBe(true);

    consoleSpy.mockRestore();
  });
});
