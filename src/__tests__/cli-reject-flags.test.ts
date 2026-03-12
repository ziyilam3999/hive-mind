import { describe, it, expect } from "vitest";
import { parseArgs } from "../index.js";
import { HiveMindError } from "../utils/errors.js";

describe("CLI rejects invalid flags", () => {
  it("rejects --spec flag", () => {
    expect(() => parseArgs(["node", "cli", "start", "--spec", "foo"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "start", "--spec", "foo"])).toThrow("--spec");
  });

  it("rejects --goal flag", () => {
    expect(() => parseArgs(["node", "cli", "start", "--goal", "foo"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "start", "--goal", "foo"])).toThrow("--goal");
  });

  it("rejects --qcs flag", () => {
    expect(() => parseArgs(["node", "cli", "start", "--qcs", "foo"])).toThrow(HiveMindError);
    expect(() => parseArgs(["node", "cli", "start", "--qcs", "foo"])).toThrow("--qcs");
  });
});
