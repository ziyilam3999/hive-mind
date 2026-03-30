import { describe, it, expect } from "vitest";
import { filterTscErrorsByScope } from "../../utils/tsc-error-filter.js";

describe("filterTscErrorsByScope", () => {
  const targetDir = "/project";

  it("TC1: all errors in scope — returned as owned", () => {
    const tscOutput = [
      "src/foo.ts(3,5): error TS2304: Cannot find name 'X'.",
      "src/foo.ts(10,1): error TS1005: ';' expected.",
    ].join("\n");

    const result = filterTscErrorsByScope(tscOutput, ["src/foo.ts"], targetDir);
    expect(result.ownedErrors).toHaveLength(2);
    expect(result.foreignErrors).toHaveLength(0);
  });

  it("TC2: all errors outside scope — returned as foreign", () => {
    const tscOutput = [
      "src/bar.ts(3,5): error TS2304: Cannot find name 'X'.",
      "src/baz.ts(7,2): error TS2339: Property 'x' does not exist.",
    ].join("\n");

    const result = filterTscErrorsByScope(tscOutput, ["src/foo.ts"], targetDir);
    expect(result.ownedErrors).toHaveLength(0);
    expect(result.foreignErrors).toHaveLength(2);
  });

  it("TC3: mixed errors — correctly partitioned", () => {
    const tscOutput = [
      "src/foo.ts(3,5): error TS2304: Cannot find name 'X'.",
      "src/bar.ts(1,1): error TS2304: Cannot find name 'Y'.",
      "src/foo.ts(10,1): error TS1005: ';' expected.",
      "src/baz.ts(7,2): error TS2339: Property 'x' does not exist.",
      "src/qux.ts(2,3): error TS2307: Cannot find module 'z'.",
    ].join("\n");

    const result = filterTscErrorsByScope(tscOutput, ["src/foo.ts"], targetDir);
    expect(result.ownedErrors).toHaveLength(2);
    expect(result.foreignErrors).toHaveLength(3);
  });

  it("TC4: Windows backslash paths — matched against forward-slash scope", () => {
    const tscOutput = "src\\foo.ts(3,5): error TS2304: Cannot find name 'X'.";

    const result = filterTscErrorsByScope(tscOutput, ["src/foo.ts"], targetDir);
    expect(result.ownedErrors).toHaveLength(1);
    expect(result.foreignErrors).toHaveLength(0);
  });

  it("TC5: empty scopeFiles — all errors foreign", () => {
    const tscOutput = "src/foo.ts(3,5): error TS2304: Cannot find name 'X'.";

    const result = filterTscErrorsByScope(tscOutput, [], targetDir);
    expect(result.ownedErrors).toHaveLength(0);
    expect(result.foreignErrors).toHaveLength(1);
  });

  it("TC6: no error lines — both arrays empty", () => {
    const tscOutput = "Found 3 errors in 2 files.\n\n";

    const result = filterTscErrorsByScope(tscOutput, ["src/foo.ts"], targetDir);
    expect(result.ownedErrors).toHaveLength(0);
    expect(result.foreignErrors).toHaveLength(0);
  });
});
