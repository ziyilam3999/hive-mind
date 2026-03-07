import { describe, it, expect } from "vitest";
import {
  implReportTemplate,
  testReportTemplate,
  evalReportTemplate,
  consolidatedReportTemplate,
} from "../../reports/templates.js";

describe("report templates include TIMESTAMP", () => {
  const ts = "2026-03-06T00:00:00.000Z";

  it("implReportTemplate includes TIMESTAMP", () => {
    const result = implReportTemplate({
      storyId: "US-01", status: "PASS", filesCreated: [], designDecisions: [],
      outputContractVerification: [], timestamp: ts,
    });
    expect(result).toContain("## TIMESTAMP");
    expect(result).toContain(ts);
  });

  it("testReportTemplate includes TIMESTAMP", () => {
    const result = testReportTemplate({
      storyId: "US-01", status: "PASS", results: [],
      summary: { total: 0, passed: 0, failed: 0 }, timestamp: ts,
    });
    expect(result).toContain("## TIMESTAMP");
  });

  it("evalReportTemplate includes TIMESTAMP", () => {
    const result = evalReportTemplate({
      storyId: "US-01", verdict: "PASS", results: [],
      summary: { total: 0, passed: 0, failed: 0 }, blockingIssues: [], timestamp: ts,
    });
    expect(result).toContain("## TIMESTAMP");
  });

  it("consolidatedReportTemplate includes TIMESTAMP", () => {
    const result = consolidatedReportTemplate({
      progress: [], storyStatus: [], verificationSummary: [],
      fixLog: [], eli5Summary: "test", timestamp: ts,
    });
    expect(result).toContain("## TIMESTAMP");
  });
});
