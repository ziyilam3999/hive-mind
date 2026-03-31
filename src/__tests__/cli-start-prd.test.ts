import { describe, it, expect } from "vitest";
import { parseArgs } from "../index.js";
import { HiveMindError } from "../utils/errors.js";

describe("CLI start command", () => {
  it("parses start --prd correctly", () => {
    const result = parseArgs(["node", "cli", "start", "--prd", "./test.md"]);
    expect(result).toEqual({ command: "start", prdPath: "./test.md", silent: false, budget: undefined, timeout: undefined, skipBaseline: false, stopAfterPlan: false, skipNormalize: false, greenfield: false, noDashboard: false, force: false });
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

describe("CLI --timeout flag", () => {
  it("parses --timeout with a valid value", () => {
    const result = parseArgs(["node", "cli", "start", "--prd", "test.md", "--timeout", "2"]);
    expect(result).toHaveProperty("timeout", 2);
  });

  it("absent --timeout results in timeout: undefined", () => {
    const result = parseArgs(["node", "cli", "start", "--prd", "test.md"]);
    expect(result).toHaveProperty("timeout", undefined);
  });

  it("throws HiveMindError for --timeout 0", () => {
    expect(() => parseArgs(["node", "cli", "start", "--prd", "test.md", "--timeout", "0"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "start", "--prd", "test.md", "--timeout", "0"])).toThrow("--timeout");
  });

  it("throws HiveMindError for --timeout abc (NaN)", () => {
    expect(() => parseArgs(["node", "cli", "start", "--prd", "test.md", "--timeout", "abc"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "start", "--prd", "test.md", "--timeout", "abc"])).toThrow("--timeout");
  });

  it("throws HiveMindError for --timeout -1 (negative)", () => {
    expect(() => parseArgs(["node", "cli", "start", "--prd", "test.md", "--timeout", "-1"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "start", "--prd", "test.md", "--timeout", "-1"])).toThrow("--timeout");
  });

  it("throws HiveMindError for --timeout 169 (exceeds 168-hour cap)", () => {
    expect(() => parseArgs(["node", "cli", "start", "--prd", "test.md", "--timeout", "169"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "start", "--prd", "test.md", "--timeout", "169"])).toThrow("168");
  });

  it("accepts --timeout 168 (max allowed)", () => {
    const result = parseArgs(["node", "cli", "start", "--prd", "test.md", "--timeout", "168"]);
    expect(result).toHaveProperty("timeout", 168);
  });
});
