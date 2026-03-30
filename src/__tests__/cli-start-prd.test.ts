import { describe, it, expect } from "vitest";
import { parseArgs } from "../index.js";
import { HiveMindError } from "../utils/errors.js";

describe("CLI start command", () => {
  it("parses start --prd correctly", () => {
    const result = parseArgs(["node", "cli", "start", "--prd", "./test.md"]);
    expect(result).toEqual({ command: "start", prdPath: "./test.md", silent: false, budget: undefined, skipBaseline: false, stopAfterPlan: false, skipNormalize: false, greenfield: false, noDashboard: false, force: false });
  });

  it("parses start --prd --skip-normalize correctly", () => {
    const result = parseArgs(["node", "cli", "start", "--prd", "./test.md", "--skip-normalize"]);
    expect(result).toHaveProperty("skipNormalize", true);
  });

  it("parses start --prd --greenfield correctly", () => {
    const result = parseArgs(["node", "cli", "start", "--prd", "./test.md", "--greenfield"]);
    expect(result).toHaveProperty("greenfield", true);
  });

  it("throws HiveMindError if --prd missing", () => {
    expect(() => parseArgs(["node", "cli", "start"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "start"])).toThrow("--prd");
  });
});
