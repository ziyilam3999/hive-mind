import { describe, it, expect } from "vitest";
import { parseTestReport, parseEvalReport, parseReportStatus, parseImplReport } from "../../reports/parser.js";

describe("parser handles malformed input", () => {
  it("returns FAIL with default confidence for empty string", () => {
    const result = parseReportStatus("");
    expect(result.status).toBe("FAIL");
    expect(result.confidence).toBe("default");
  });

  it("returns FAIL with default confidence for garbage input", () => {
    const result = parseReportStatus("some random text without headers");
    expect(result.status).toBe("FAIL");
    expect(result.confidence).toBe("default");
  });

  it("parseTestReport returns empty results for garbage", () => {
    const result = parseTestReport("not a real report");
    expect(result.status).toBe("FAIL");
    expect(result.confidence).toBe("default");
    expect(result.results).toEqual([]);
  });

  it("parseEvalReport returns empty results for garbage", () => {
    const result = parseEvalReport("not a real report");
    expect(result.verdict).toBe("FAIL");
    expect(result.confidence).toBe("default");
    expect(result.results).toEqual([]);
  });
});

describe("parser handles emoji-prefixed status lines", () => {
  it("parses emoji-prefixed inline status", () => {
    const markdown = `**Status**: ✅ **PASS** (TypeScript now available globally)`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });

  it("parses bold status with emoji", () => {
    const markdown = `\n**Status**: ❌ FAIL\nSome other text`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("FAIL");
    expect(result.confidence).toBe("matched");
  });

  it("parses Final Status variant", () => {
    const markdown = `\n**Final Status**: PASS\n`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });

  it("parses heading-style status", () => {
    const result = parseReportStatus("## STATUS: PASS\nDetails here");
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });

  it("parses verdict heading", () => {
    const result = parseReportStatus("## VERDICT: FAIL\nSome findings");
    expect(result.status).toBe("FAIL");
    expect(result.confidence).toBe("matched");
  });

  it("parses emoji-agnostic summary table", () => {
    const markdown = `| Category | Count |\n| FAIL | 0 |\n| PASS | 5 |`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });

  it("parses standalone PASS line", () => {
    const markdown = `Some intro text\n\nPASS\n\nSome outro text`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });

  it("standalone FAIL overrides standalone PASS", () => {
    const markdown = `\nPASS\n\nFAIL\n`;
    const result = parseReportStatus(markdown);
    // Both present means standalonePass && standaloneFail → not matched → default FAIL
    expect(result.status).toBe("FAIL");
    expect(result.confidence).toBe("default");
  });

  it("parses 'ALL TESTS PASS' (qualifier before keyword)", () => {
    const markdown = `**Status**: ✅ ALL TESTS PASS`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });

  it("parses '13/13 RUNTIME TESTS PASS' (count + qualifier before keyword)", () => {
    const markdown = `\nStatus: 13/13 RUNTIME TESTS PASS\n`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });

  it("parses 'ALL PASS' with emoji", () => {
    const markdown = `\n**Status**: ✅ ALL PASS\n`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });

  it("parses status with FAILED keyword after qualifiers", () => {
    const markdown = `\nStatus: TESTS FAILED - 2 errors found\n`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("FAIL");
    expect(result.confidence).toBe("matched");
  });

  it("parses COMPLETE as PASS", () => {
    const markdown = `\nStatus: IMPLEMENTATION COMPLETE\n`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });

  it("parses 'Result:' synonym (Bug 14)", () => {
    const markdown = `**Result**: ✅ **ALL TESTS PASSED (4/4)**`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });

  it("parses 'Outcome:' synonym", () => {
    const markdown = `\n**Outcome**: PASS\n`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });

  it("parses 'Test Status:' with word prefix (Bug 14 variant)", () => {
    const markdown = `**Test Status:** ✅ ALL TESTS PASSED (24/24)`;
    const result = parseReportStatus(markdown);
    expect(result.status).toBe("PASS");
    expect(result.confidence).toBe("matched");
  });
});

describe("parseImplReport scopes to FILES CREATED section", () => {
  it("ignores Exports, AC, and EC tables outside FILES CREATED section", () => {
    const markdown = `# Implementation Report: US-02

## Status: PASS

## Source Files
- \`src/task.ts\` (created)

## Exports
| Export | Type | Present |
|--------|------|---------|
| \`createTask(id: string, title: string): Task\` | function | YES |
| \`transition(task: Task, to: TaskStatus): Task\` | function | YES |

## Exit Criteria
| EC | Description | Result |
|----|-------------|--------|
| EC-1 | File exists at src/task.ts | PASS |

## Acceptance Criteria Coverage
| AC | Description | Covered |
|----|-------------|---------|
| AC-0 | Code passes lint | YES |
`;
    const result = parseImplReport(markdown);
    expect(result.status).toBe("PASS");
    expect(result.filesCreated).toEqual(["src/task.ts"]);
    // Must NOT contain export signatures or table headers
    expect(result.filesCreated).not.toContain("createTask(id: string, title: string): Task");
    expect(result.filesCreated).not.toContain("Export");
    expect(result.filesCreated).not.toContain("EC-1");
  });

  it("parses FILES CREATED table format", () => {
    const markdown = `# Report
## STATUS: PASS
## FILES CREATED
| File | Lines | Exports |
|------|:-----:|---------|
| src/types.ts | 50 | TaskStatus |
| src/utils.ts | 30 | helper |
## NOTES
Some notes here.
`;
    const result = parseImplReport(markdown);
    expect(result.filesCreated).toEqual(["src/types.ts", "src/utils.ts"]);
  });

  it("returns empty filesCreated when no FILES CREATED section exists", () => {
    const markdown = `# Report\n## STATUS: PASS\nNo files section here.`;
    const result = parseImplReport(markdown);
    expect(result.filesCreated).toEqual([]);
  });
});
