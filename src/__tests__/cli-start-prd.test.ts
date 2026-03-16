import { describe, it, expect } from "vitest";
import { parseArgs } from "../index.js";
import { HiveMindError } from "../utils/errors.js";

describe("CLI start command", () => {
  it("parses start --prd correctly", () => {
    const result = parseArgs(["node", "cli", "start", "--prd", "./test.md"]);
    expect(result).toEqual({ command: "start", prdPath: "./test.md", silent: false, budget: undefined, skipBaseline: false, stopAfterPlan: false });
  });

  it("throws HiveMindError if --prd missing", () => {
    expect(() => parseArgs(["node", "cli", "start"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "start"])).toThrow("--prd");
  });
});
