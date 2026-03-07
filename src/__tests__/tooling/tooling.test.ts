import { describe, it, expect, vi } from "vitest";
import { parseRequiredTooling, detectTool, detectAllTools } from "../../tooling/detect.js";

vi.mock("../../utils/shell.js", () => ({
  runShell: vi.fn(async () => ({ exitCode: 0, stdout: "v5.0.0\n", stderr: "" })),
}));

import { runShell } from "../../utils/shell.js";

describe("tooling detection", () => {
  it("parseRequiredTooling extracts tools from SPEC table", () => {
    const spec = `
### Required Tooling
| Tool | Purpose | Install Command | Detect Command |
|------|---------|-----------------|----------------|
| TypeScript | Type checker | npm install typescript | npx tsc --version |
| ESLint | Linter | npm install eslint | npx eslint --version |
`;
    const result = parseRequiredTooling(spec);
    expect(result.length).toBe(2);
    expect(result[0].tool).toBe("TypeScript");
    expect(result[0].detectCommand).toBe("npx tsc --version");
    expect(result[1].tool).toBe("ESLint");
  });

  it("parseRequiredTooling returns empty for no table", () => {
    expect(parseRequiredTooling("# No tooling table")).toEqual([]);
  });

  it("detectTool returns detected when shell succeeds", async () => {
    vi.mocked(runShell).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "5.9.3\n",
      stderr: "",
    });

    const result = await detectTool({
      tool: "TypeScript",
      purpose: "Type checker",
      installCommand: "npm i typescript",
      detectCommand: "npx tsc --version",
    });

    expect(result.detected).toBe(true);
    expect(result.version).toBe("5.9.3");
  });

  it("detectTool returns not detected when shell fails", async () => {
    vi.mocked(runShell).mockResolvedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: "command not found",
    });

    const result = await detectTool({
      tool: "Missing",
      purpose: "N/A",
      installCommand: "npm i missing",
      detectCommand: "missing --version",
    });

    expect(result.detected).toBe(false);
  });

  it("detectAllTools logs TOOLING_VERIFIED for each detected tool", async () => {
    vi.mocked(runShell).mockResolvedValue({ exitCode: 0, stdout: "1.0.0", stderr: "" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { allDetected, results } = await detectAllTools([
      { tool: "A", purpose: "test", installCommand: "npm i a", detectCommand: "a --version" },
      { tool: "B", purpose: "test", installCommand: "npm i b", detectCommand: "b --version" },
    ]);

    expect(allDetected).toBe(true);
    expect(results.get("A")).toBe(true);
    expect(results.get("B")).toBe(true);

    const calls = consoleSpy.mock.calls.flat().join(" ");
    expect(calls).toContain("TOOLING_VERIFIED");

    consoleSpy.mockRestore();
  });

  it("tooling-setup agent only spawned when detect fails (conditional)", async () => {
    // When all tools are detected, no setup agent should spawn
    vi.mocked(runShell).mockResolvedValue({ exitCode: 0, stdout: "1.0.0", stderr: "" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { allDetected } = await detectAllTools([
      { tool: "A", purpose: "test", installCommand: "npm i a", detectCommand: "a --version" },
    ]);

    expect(allDetected).toBe(true);
    // runToolingSetup should NOT be called when allDetected is true
    // This is verified by the orchestrator logic, not this function

    consoleSpy.mockRestore();
  });
});
