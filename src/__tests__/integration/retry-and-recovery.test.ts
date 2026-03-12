import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDefaultConfig } from "../../config/loader.js";
import type { AgentConfig } from "../../types/agents.js";

// Mock spawnClaude
vi.mock("../../utils/shell.js", () => ({
  spawnClaude: vi.fn(),
  runShell: vi.fn(),
}));

// Mock file-io
vi.mock("../../utils/file-io.js", () => ({
  fileExists: vi.fn(() => true),
  writeFileAtomic: vi.fn(),
  ensureDir: vi.fn(),
  readFileSafe: vi.fn(() => null),
}));

// Mock backoff sleep
vi.mock("../../utils/backoff.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/backoff.js")>();
  return {
    ...actual,
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

import { spawnAgentWithRetry } from "../../agents/spawner.js";
import { spawnClaude } from "../../utils/shell.js";
import { fileExists } from "../../utils/file-io.js";
import { sleep } from "../../utils/backoff.js";

const config = getDefaultConfig();

function makeAgentConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    type: "tester-exec",
    model: "haiku",
    inputFiles: ["/tmp/step.md"],
    outputFile: "/tmp/test-report.md",
    rules: [],
    memoryContent: "",
    ...overrides,
  };
}

describe("Integration: retry with backoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fileExists).mockReturnValue(true);
  });

  it("transient failure: fails twice then succeeds with 2 backoff sleeps", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    let spawnCallCount = 0;

    // Attempts 1-2 fail (exit code 1), attempt 3 succeeds
    mockSpawn.mockImplementation(async () => {
      spawnCallCount++;
      if (spawnCallCount <= 2) {
        return { exitCode: 1, stdout: "", stderr: "rate limit" };
      }
      return {
        exitCode: 0, stdout: "ok", stderr: "",
        json: { result: "ok", cost_usd: 0.01, model: "haiku", session_id: "s1", duration_ms: 1000, raw: {} },
      };
    });

    // fileExists returns true always (output file exists after successful spawn)
    vi.mocked(fileExists).mockReturnValue(true);

    const customConfig = { ...config, maxRetries: 2 };
    const result = await spawnAgentWithRetry(makeAgentConfig(), customConfig);

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledTimes(3);
    expect(vi.mocked(sleep)).toHaveBeenCalledTimes(2);
  });

  it("permanent failure: all attempts fail with error details", async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    mockSpawn.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "permanent error" });
    vi.mocked(fileExists).mockReturnValue(false);

    const customConfig = { ...config, maxRetries: 2 };
    const result = await spawnAgentWithRetry(makeAgentConfig(), customConfig);

    expect(result.success).toBe(false);
    expect(result.error).toContain("permanent error");
    expect(mockSpawn).toHaveBeenCalledTimes(3);
    expect(vi.mocked(sleep)).toHaveBeenCalledTimes(2);
  });
});

describe("Integration: parser structured output", () => {
  it("Level 0 JSON block parsed from agent output", async () => {
    // Import parser directly for this integration test
    const { parseReportStatus } = await import("../../reports/parser.js");

    // Simulated agent output with structured status block
    const agentOutput = `<!-- STATUS: {"result": "PASS"} -->
# Test Report: US-01

## Results
| AC | Description | Command | Expected | Result |
| AC-1 | Exports greet | grep -q greet | PASS | PASS |

**Status**: ALL TESTS PASS
`;

    const result = parseReportStatus(agentOutput);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("structured");
  });

  it("fallback to regex when agent omits JSON block", async () => {
    const { parseReportStatus } = await import("../../reports/parser.js");

    const agentOutput = `# Test Report: US-01

## Results
| AC | Description | Command | Expected | Result |
| AC-1 | Exports greet | grep -q greet | PASS | PASS |

**Status**: ALL TESTS PASS
`;

    const result = parseReportStatus(agentOutput);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });
});
