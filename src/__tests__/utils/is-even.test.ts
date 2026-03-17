import { describe, it, expect } from "vitest";
import { isEven } from "../../utils/is-even.js";

describe("isEven", () => {
  it("returns true for 0", () => {
    expect(isEven(0)).toBe(true);
  });

  it("returns false for 1", () => {
    expect(isEven(1)).toBe(false);
  });

  it("returns true for 2", () => {
    expect(isEven(2)).toBe(true);
  });

  it("returns true for -2", () => {
    expect(isEven(-2)).toBe(true);
  });

  it("returns false for -1", () => {
    expect(isEven(-1)).toBe(false);
  });

  it("returns true for 1000000", () => {
    expect(isEven(1000000)).toBe(true);
  });

  it("returns false for 999999", () => {
    expect(isEven(999999)).toBe(false);
  });
});
