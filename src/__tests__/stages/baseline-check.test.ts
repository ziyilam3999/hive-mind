import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDefaultConfig } from "../../config/loader.js";
import { HiveMindError } from "../../utils/errors.js";

vi.mock("../../utils/shell.js", () => ({
  runShell: vi.fn(),
  spawnClaude: vi.fn(),
}));

vi.mock("../../utils/file-io.js", () => ({
  readFileSafe: vi.fn(() => null),
  writeFileAtomic: vi.fn(),
  ensureDir: vi.fn(),
  fileExists: vi.fn(() => false),
}));

import { runBaselineCheck, extractNpmScript, npmScriptExists } from "../../stages/baseline-check.js";
import { runShell } from "../../utils/shell.js";
import { readFileSafe } from "../../utils/file-io.js";

const config = getDefaultConfig();

beforeEach(() => {
  vi.clearAllMocks();
});

function mockPackageJson(scripts?: Record<string, string>) {
  vi.mocked(readFileSafe).mockReturnValue(
    scripts ? JSON.stringify({ scripts }) : null,
  );
}

function mockShellSuccess() {
  vi.mocked(runShell)
    .mockResolvedValueOnce({ exitCode: 0, stdout: "compiled", stderr: "" })
    .mockResolvedValueOnce({ exitCode: 0, stdout: "all tests pass", stderr: "" });
}

describe("extractNpmScript", () => {
  it("extracts script from 'npm run build'", () => {
    expect(extractNpmScript("npm run build")).toBe("build");
  });

  it("extracts script from 'npm run lint'", () => {
    expect(extractNpmScript("npm run lint")).toBe("lint");
  });

  it("extracts 'test' from 'npm test'", () => {
    expect(extractNpmScript("npm test")).toBe("test");
  });

  it("returns null for non-npm commands", () => {
    expect(extractNpmScript("make build")).toBeNull();
    expect(extractNpmScript("cargo test")).toBeNull();
    expect(extractNpmScript("./run-tests.sh")).toBeNull();
  });
});

describe("npmScriptExists", () => {
  it("returns true when script exists in package.json", () => {
    mockPackageJson({ build: "tsc", test: "vitest" });
    expect(npmScriptExists("build")).toBe(true);
  });

  it("returns false when script is missing", () => {
    mockPackageJson({ test: "vitest" });
    expect(npmScriptExists("build")).toBe(false);
  });

  it("returns false when no package.json", () => {
    mockPackageJson();
    expect(npmScriptExists("build")).toBe(false);
  });

  it("returns false when package.json has no scripts", () => {
    vi.mocked(readFileSafe).mockReturnValue(JSON.stringify({ name: "test" }));
    expect(npmScriptExists("build")).toBe(false);
  });
});

describe("runBaselineCheck", () => {
  it("passes when build and test succeed", async () => {
    mockPackageJson({ build: "tsc", test: "vitest" });
    mockShellSuccess();

    const result = await runBaselineCheck(config);
    expect(result.passed).toBe(true);
    expect(runShell).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runShell).mock.calls[0][0]).toBe("npm run build");
    expect(vi.mocked(runShell).mock.calls[1][0]).toBe("npm test");
  });

  it("throws HiveMindError when build fails", async () => {
    mockPackageJson({ build: "tsc", test: "vitest" });
    vi.mocked(runShell).mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "error TS2339: Property 'foo' does not exist",
    });

    await expect(runBaselineCheck(config)).rejects.toThrow(HiveMindError);
  });

  it("throws HiveMindError with 'build failed' message when build fails", async () => {
    mockPackageJson({ build: "tsc", test: "vitest" });
    vi.mocked(runShell).mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "error TS2339",
    });

    await expect(runBaselineCheck(config)).rejects.toThrow("Baseline build failed");
  });

  it("throws HiveMindError when test fails", async () => {
    mockPackageJson({ build: "tsc", test: "vitest" });
    vi.mocked(runShell)
      .mockResolvedValueOnce({ exitCode: 0, stdout: "compiled", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "3 tests failed" });

    await expect(runBaselineCheck(config)).rejects.toThrow("Baseline tests failed");
  });

  it("uses custom build/test commands from config", async () => {
    // Custom commands are non-npm, so they always run regardless of package.json
    vi.mocked(runShell)
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });

    const customConfig = {
      ...config,
      baselineBuildCommand: "make build",
      baselineTestCommand: "make test",
    };

    await runBaselineCheck(customConfig);
    expect(vi.mocked(runShell).mock.calls[0][0]).toBe("make build");
    expect(vi.mocked(runShell).mock.calls[1][0]).toBe("make test");
  });

  it("skips build when npm script is missing from package.json", async () => {
    mockPackageJson(); // no package.json
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runBaselineCheck(config);

    expect(result.passed).toBe(true);
    const logs = consoleSpy.mock.calls.map(c => c[0]);
    expect(logs.some((l: string) => l.includes('skipped (no "build"'))).toBe(true);
    expect(logs.some((l: string) => l.includes('skipped (no "test"'))).toBe(true);
    expect(runShell).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("skips only build when build script missing but test exists", async () => {
    mockPackageJson({ test: "vitest" });
    vi.mocked(runShell).mockResolvedValueOnce({ exitCode: 0, stdout: "ok", stderr: "" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runBaselineCheck(config);

    expect(result.passed).toBe(true);
    expect(runShell).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runShell).mock.calls[0][0]).toBe("npm test");

    consoleSpy.mockRestore();
  });

  it("always runs custom (non-npm) commands regardless of package.json", async () => {
    mockPackageJson(); // no package.json
    vi.mocked(runShell)
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });

    const customConfig = {
      ...config,
      baselineBuildCommand: "make build",
      baselineTestCommand: "make test",
    };

    await runBaselineCheck(customConfig);
    expect(runShell).toHaveBeenCalledTimes(2);
  });
});
