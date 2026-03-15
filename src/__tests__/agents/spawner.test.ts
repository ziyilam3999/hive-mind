import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDefaultConfig } from "../../config/loader.js";
import { getToolsForAgent } from "../../agents/tool-permissions.js";
import { getAgentRules } from "../../agents/prompts.js";
import type { AgentConfig } from "../../types/agents.js";

// Mock spawnClaude at the shell level
vi.mock("../../utils/shell.js", () => ({
  spawnClaude: vi.fn(),
  runShell: vi.fn(),
}));

// Mock file-io
vi.mock("../../utils/file-io.js", () => ({
  fileExists: vi.fn(() => true),
  writeFileAtomic: vi.fn(),
  ensureDir: vi.fn(),
}));

// Mock backoff sleep to avoid real delays
vi.mock("../../utils/backoff.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/backoff.js")>();
  return {
    ...actual,
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

import { spawnAgent, spawnAgentWithRetry, spawnAgentsParallel } from "../../agents/spawner.js";
import { spawnClaude } from "../../utils/shell.js";
import { fileExists } from "../../utils/file-io.js";
import { sleep } from "../../utils/backoff.js";

const config = getDefaultConfig();

function makeAgentConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    type: "critic",
    model: "sonnet",
    inputFiles: ["/tmp/input.md"],
    outputFile: "/tmp/output.md",
    rules: ["Be concise"],
    memoryContent: "memory",
    ...overrides,
  };
}

describe("spawnAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls spawnClaude with correct args", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockResolvedValue({
      exitCode: 0,
      stdout: "output",
      stderr: "",
      json: {
        result: "output",
        cost_usd: 0.01,
        model: "sonnet",
        session_id: "sess-123",
        duration_ms: 5000,
        raw: {},
      },
    });

    const agentConfig = makeAgentConfig({ type: "critic" });
    await spawnAgent(agentConfig, config);

    expect(mockSpawn).toHaveBeenCalledOnce();
    const callArgs = mockSpawn.mock.calls[0][0];
    expect(callArgs.model).toBe("sonnet"); // from config.modelAssignments
    expect(callArgs.outputFormat).toBe("json");
    expect(callArgs.allowedTools).toEqual(["Read", "Glob", "Grep", "Write"]);
    expect(callArgs.timeout).toBe(config.agentTimeout);
  });

  it("passes allowedTools from getToolsForAgent", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockResolvedValue({
      exitCode: 0, stdout: "", stderr: "",
      json: { result: "", cost_usd: 0, model: "opus", session_id: "", duration_ms: 0, raw: {} },
    });

    const agentConfig = makeAgentConfig({ type: "implementer" });
    await spawnAgent(agentConfig, config);

    const callArgs = mockSpawn.mock.calls[0][0];
    expect(callArgs.allowedTools).toEqual(["Read", "Glob", "Grep", "Write", "Edit", "Bash"]);
  });

  it("populates AgentResult metadata from JSON response", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockResolvedValue({
      exitCode: 0,
      stdout: '{"result":"done","cost_usd":0.05,"model":"sonnet","session_id":"s1","duration_ms":3200}',
      stderr: "",
      json: {
        result: "done",
        cost_usd: 0.05,
        model: "sonnet",
        session_id: "s1",
        duration_ms: 3200,
        raw: {},
      },
    });

    const result = await spawnAgent(makeAgentConfig(), config);
    expect(result.costUsd).toBe(0.05);
    expect(result.modelUsed).toBe("sonnet");
    expect(result.sessionId).toBe("s1");
    expect(result.durationMs).toBe(3200);
  });

  it("returns failure when agent does not create output file (no fallback)", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockResolvedValue({
      exitCode: 0,
      stdout: "raw text output",
      stderr: "",
      // No json field — simulates parse failure
    });

    // File doesn't exist — agent didn't use Write tool
    vi.mocked(fileExists).mockReturnValue(false);

    const result = await spawnAgent(makeAgentConfig(), config);
    expect(result.success).toBe(false);
    expect(result.error).toContain("did not create output file");
    expect(result.costUsd).toBeUndefined();
    expect(result.modelUsed).toBeUndefined();
  });

  it("passes cwd to spawnClaude when set on AgentConfig", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockResolvedValue({
      exitCode: 0, stdout: "", stderr: "",
      json: { result: "", cost_usd: 0, model: "sonnet", session_id: "", duration_ms: 0, raw: {} },
    });

    const agentConfig = makeAgentConfig({ cwd: "/external/repo" });
    await spawnAgent(agentConfig, config);

    const callArgs = mockSpawn.mock.calls[0][0];
    expect(callArgs.cwd).toBe("/external/repo");
  });

  it("does not set cwd on spawnClaude when AgentConfig.cwd is undefined", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockResolvedValue({
      exitCode: 0, stdout: "", stderr: "",
      json: { result: "", cost_usd: 0, model: "sonnet", session_id: "", duration_ms: 0, raw: {} },
    });

    const agentConfig = makeAgentConfig(); // no cwd
    await spawnAgent(agentConfig, config);

    const callArgs = mockSpawn.mock.calls[0][0];
    expect(callArgs.cwd).toBeUndefined();
  });

  it("uses config modelAssignments override", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockResolvedValue({
      exitCode: 0, stdout: "", stderr: "",
      json: { result: "", cost_usd: 0, model: "opus", session_id: "", duration_ms: 0, raw: {} },
    });

    const customConfig = { ...config, modelAssignments: { ...config.modelAssignments, critic: "opus" as const } };
    await spawnAgent(makeAgentConfig({ type: "critic" }), customConfig);

    expect(mockSpawn.mock.calls[0][0].model).toBe("opus");
  });
});

describe("spawnAgentWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fileExists).mockReturnValue(true);
  });

  it("uses config-driven maxRetries", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockResolvedValue({
      exitCode: 1, stdout: "", stderr: "fail",
    });
    vi.mocked(fileExists).mockReturnValue(false);

    const customConfig = { ...config, maxRetries: 2 };
    await spawnAgentWithRetry(makeAgentConfig(), customConfig);

    // 1 initial + 2 retries = 3 calls
    expect(mockSpawn).toHaveBeenCalledTimes(3);
  });

  it("stops retrying on success", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "fail" })
      .mockResolvedValueOnce({
        exitCode: 0, stdout: "ok", stderr: "",
        json: { result: "ok", cost_usd: 0, model: "sonnet", session_id: "", duration_ms: 0, raw: {} },
      });

    const result = await spawnAgentWithRetry(makeAgentConfig(), config);
    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it("calls sleep with backoff between retry attempts", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "fail" });
    vi.mocked(fileExists).mockReturnValue(false);
    const mockSleep = vi.mocked(sleep);

    const customConfig = { ...config, maxRetries: 3 };
    await spawnAgentWithRetry(makeAgentConfig(), customConfig);

    // 1 initial + 3 retries = 4 spawn calls, 3 sleeps (before retries 1, 2, 3)
    expect(mockSpawn).toHaveBeenCalledTimes(4);
    expect(mockSleep).toHaveBeenCalledTimes(3);

    // Each sleep call receives a number (the backoff delay)
    for (const call of mockSleep.mock.calls) {
      expect(typeof call[0]).toBe("number");
      expect(call[0]).toBeGreaterThan(0);
    }
  });

  it("does not sleep before first attempt", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockResolvedValue({
      exitCode: 0, stdout: "ok", stderr: "",
      json: { result: "ok", cost_usd: 0, model: "sonnet", session_id: "", duration_ms: 0, raw: {} },
    });
    const mockSleep = vi.mocked(sleep);

    await spawnAgentWithRetry(makeAgentConfig(), config);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it("does not sleep when maxRetries is 0 and first attempt fails", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "fail" });
    vi.mocked(fileExists).mockReturnValue(false);
    const mockSleep = vi.mocked(sleep);

    const customConfig = { ...config, maxRetries: 0 };
    const result = await spawnAgentWithRetry(makeAgentConfig(), customConfig);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});

describe("spawnAgentsParallel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fileExists).mockReturnValue(true);
  });

  it("runs configs concurrently", async () => {
    const timestamps: number[] = [];
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockImplementation(async () => {
      timestamps.push(Date.now());
      await new Promise((r) => setTimeout(r, 50));
      return {
        exitCode: 0, stdout: "ok", stderr: "",
        json: { result: "ok", cost_usd: 0, model: "sonnet", session_id: "", duration_ms: 0, raw: {} },
      };
    });

    const configs = [
      makeAgentConfig({ type: "analyst" }),
      makeAgentConfig({ type: "reviewer" }),
      makeAgentConfig({ type: "security" }),
    ];

    const results = await spawnAgentsParallel(configs, config);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);

    // All should start near-simultaneously (within 30ms of each other)
    const spread = Math.max(...timestamps) - Math.min(...timestamps);
    expect(spread).toBeLessThan(30);
  });

  it("respects maxConcurrency: 1 for sequential execution", async () => {
    const order: number[] = [];
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockImplementation(async () => {
      order.push(order.length);
      await new Promise((r) => setTimeout(r, 20));
      return {
        exitCode: 0, stdout: "ok", stderr: "",
        json: { result: "ok", cost_usd: 0, model: "sonnet", session_id: "", duration_ms: 0, raw: {} },
      };
    });

    const configs = [
      makeAgentConfig({ type: "analyst" }),
      makeAgentConfig({ type: "reviewer" }),
    ];

    const results = await spawnAgentsParallel(configs, config, { maxConcurrency: 1 });
    expect(results).toHaveLength(2);
    // With maxConcurrency=1 and retry=1, each config gets 1 call (succeeds first try)
    // Sequential: order should be deterministic
    expect(order).toEqual([0, 1]);
  });
});

describe("getToolsForAgent", () => {
  it("returns output tools for critic", () => {
    expect(getToolsForAgent("critic")).toEqual(["Read", "Glob", "Grep", "Write"]);
  });

  it("returns full dev tools for implementer", () => {
    expect(getToolsForAgent("implementer")).toEqual(["Read", "Glob", "Grep", "Write", "Edit", "Bash"]);
  });

  it("returns shell tools for tester-exec", () => {
    expect(getToolsForAgent("tester-exec")).toEqual(["Read", "Glob", "Grep", "Bash", "Write"]);
  });

  it("fixer rules include STEP-FILE-IS-CANONICAL (K1/K4)", () => {
    const rules = getAgentRules("fixer");
    const hasCanonicalRule = rules.some((r: string) =>
      r.includes("STEP-FILE-IS-CANONICAL") && r.includes("single source of truth"),
    );
    expect(hasCanonicalRule).toBe(true);
  });

  it("returns tools for every agent type", () => {
    const allTypes = [
      "researcher", "justifier", "spec-drafter", "critic", "spec-corrector",
      "tooling-setup", "analyst", "reviewer", "security", "architect",
      "tester-role", "synthesizer", "implementer", "refactorer", "tester-exec",
      "evaluator", "diagnostician", "fixer", "learner", "reporter", "retrospective",
    ] as const;

    for (const agentType of allTypes) {
      const tools = getToolsForAgent(agentType);
      expect(tools.length).toBeGreaterThan(0);
    }
  });
});
