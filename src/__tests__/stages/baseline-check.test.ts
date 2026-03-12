import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDefaultConfig } from "../../config/loader.js";
import { HiveMindError } from "../../utils/errors.js";

vi.mock("../../utils/shell.js", () => ({
  runShell: vi.fn(),
  spawnClaude: vi.fn(),
}));

import { runBaselineCheck } from "../../stages/baseline-check.js";
import { runShell } from "../../utils/shell.js";

const config = getDefaultConfig();

describe("runBaselineCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes when build and test succeed", async () => {
    const mockShell = vi.mocked(runShell);
    mockShell
      .mockResolvedValueOnce({ exitCode: 0, stdout: "compiled", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "all tests pass", stderr: "" });

    const result = await runBaselineCheck(config);
    expect(result.passed).toBe(true);
    expect(mockShell).toHaveBeenCalledTimes(2);
    expect(mockShell.mock.calls[0][0]).toBe("npm run build");
    expect(mockShell.mock.calls[1][0]).toBe("npm test");
  });

  it("throws HiveMindError when build fails", async () => {
    const mockShell = vi.mocked(runShell);
    mockShell.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "error TS2339: Property 'foo' does not exist",
    });

    await expect(runBaselineCheck(config)).rejects.toThrow(HiveMindError);
  });

  it("throws HiveMindError with 'build failed' message when build fails", async () => {
    const mockShell = vi.mocked(runShell);
    mockShell.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "error TS2339",
    });

    await expect(runBaselineCheck(config)).rejects.toThrow("Baseline build failed");
  });

  it("throws HiveMindError when test fails", async () => {
    const mockShell = vi.mocked(runShell);
    mockShell
      .mockResolvedValueOnce({ exitCode: 0, stdout: "compiled", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "3 tests failed" });

    await expect(runBaselineCheck(config)).rejects.toThrow("Baseline tests failed");
  });

  it("uses custom build/test commands from config", async () => {
    const mockShell = vi.mocked(runShell);
    mockShell
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });

    const customConfig = {
      ...config,
      baselineBuildCommand: "make build",
      baselineTestCommand: "make test",
    };

    await runBaselineCheck(customConfig);
    expect(mockShell.mock.calls[0][0]).toBe("make build");
    expect(mockShell.mock.calls[1][0]).toBe("make test");
  });
});
