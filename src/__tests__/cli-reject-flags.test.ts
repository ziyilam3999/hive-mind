import { describe, it, expect, vi } from "vitest";
import { parseArgs } from "../index.js";

describe("CLI rejects invalid flags", () => {
  it("rejects --spec flag", () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseArgs(["node", "cli", "start", "--spec", "foo"])).toThrow("exit");
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining("--spec"));
    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it("rejects --goal flag", () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseArgs(["node", "cli", "start", "--goal", "foo"])).toThrow("exit");
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining("--goal"));
    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it("rejects --qcs flag", () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseArgs(["node", "cli", "start", "--qcs", "foo"])).toThrow("exit");
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining("--qcs"));
    mockExit.mockRestore();
    mockError.mockRestore();
  });
});
