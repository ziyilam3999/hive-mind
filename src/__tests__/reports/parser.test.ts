import { describe, it, expect } from "vitest";
import { parseRefactorReport } from "../../reports/parser.js";

describe("parseRefactorReport", () => {
  it("TC-6: CHANGES table with 2 file rows returns 2 entries", () => {
    const markdown = `# Refactor Report

## CHANGES
| File | Change | Reason |
|------|--------|--------|
| src/utils/shell.ts | Extracted helper | DRY |
| src/agents/spawner.ts | Renamed param | Clarity |

## SUMMARY
Done.
`;
    const result = parseRefactorReport(markdown);
    expect(result.filesModified).toHaveLength(2);
    expect(result.filesModified).toContain("src/utils/shell.ts");
    expect(result.filesModified).toContain("src/agents/spawner.ts");
  });

  it("TC-7: empty string returns empty array", () => {
    const result = parseRefactorReport("");
    expect(result.filesModified).toEqual([]);
  });

  it("TC-8: CHANGES header but no table rows returns empty array", () => {
    const markdown = `# Refactor Report

## CHANGES

No changes were necessary.

## SUMMARY
Done.
`;
    const result = parseRefactorReport(markdown);
    expect(result.filesModified).toEqual([]);
  });
});
