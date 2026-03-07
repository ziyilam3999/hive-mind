import { describe, it, expect } from "vitest";
import { getReportPath } from "../../reports/templates.js";

describe("report path format", () => {
  it("follows reports/{storyId}/ pattern", () => {
    expect(getReportPath("US-01", "impl-report.md")).toBe("reports/US-01/impl-report.md");
    expect(getReportPath("US-12", "test-report.md")).toBe("reports/US-12/test-report.md");
  });
});
