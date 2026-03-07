import { describe, it, expect, vi } from "vitest";
import { parseArgs } from "../index.js";

describe("CLI start command", () => {
  it("parses start --prd correctly", () => {
    const result = parseArgs(["node", "cli", "start", "--prd", "./test.md"]);
    expect(result).toEqual({ command: "start", prdPath: "./test.md" });
  });

  it("exits if --prd missing", () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseArgs(["node", "cli", "start"])).toThrow("exit");
    mockExit.mockRestore();
    mockError.mockRestore();
  });
});
