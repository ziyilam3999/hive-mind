import { describe, it, expect } from "vitest";
import { parseTestReport, parseEvalReport, parseReportStatus } from "../../reports/parser.js";

describe("parser handles malformed input", () => {
  it("returns FAIL for empty string", () => {
    expect(parseReportStatus("")).toBe("FAIL");
  });

  it("returns FAIL for garbage input", () => {
    expect(parseReportStatus("some random text without headers")).toBe("FAIL");
  });

  it("parseTestReport returns empty results for garbage", () => {
    const result = parseTestReport("not a real report");
    expect(result.status).toBe("FAIL");
    expect(result.results).toEqual([]);
  });

  it("parseEvalReport returns empty results for garbage", () => {
    const result = parseEvalReport("not a real report");
    expect(result.verdict).toBe("FAIL");
    expect(result.results).toEqual([]);
  });
});
