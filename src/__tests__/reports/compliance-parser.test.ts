import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseComplianceReport, parseComplianceFixReport } from "../../reports/parser.js";

describe("parseComplianceReport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses valid PASS report with STATUS block", () => {
    const report = `<!-- STATUS: {"result": "PASS", "done": 5, "missing": 0, "uncertain": 1} -->
# Compliance Report: US-01

## Instructions
| # | Instruction | Status | Evidence |
|---|------------|--------|----------|
| 1 | Add JSDoc | DONE | src/foo.ts:13 |
| 2 | Write test | DONE | __tests__/foo.test.ts:5 |
`;
    const result = parseComplianceReport(report);
    expect(result.result).toBe("PASS");
    expect(result.confidence).toBe("structured");
    expect(result.done).toBe(5);
    expect(result.missing).toBe(0);
    expect(result.uncertain).toBe(1);
    expect(result.instructions.length).toBe(2);
    expect(result.instructions[0].status).toBe("DONE");
  });

  it("parses valid FAIL report with MISSING items", () => {
    const report = `<!-- STATUS: {"result": "FAIL", "done": 3, "missing": 2, "uncertain": 0} -->
# Compliance Report: US-99

## Instructions
| # | Instruction | Status | Evidence |
|---|------------|--------|----------|
| 1 | Add JSDoc to appendLogEntry | MISSING | No comment found at src/state/manager-log.ts:13 |
| 2 | Write test for no-plan-writes | MISSING | No test matching "plan" in __tests__/stages/ |
| 3 | Implement wave executor | DONE | src/orchestrator.ts:296 |
`;
    const result = parseComplianceReport(report);
    expect(result.result).toBe("FAIL");
    expect(result.missing).toBe(2);
    expect(result.done).toBe(3);
    expect(result.instructions.length).toBe(3);
    expect(result.instructions[0].status).toBe("MISSING");
    expect(result.instructions[2].status).toBe("DONE");
  });

  it("returns default confidence when STATUS block is missing (P39 corruption detection)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = `# Compliance Report: US-01\nAll looks good, PASS`;
    const result = parseComplianceReport(report);
    expect(result.confidence).toBe("default");
    expect(result.result).toBe("unknown");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Missing STATUS block"));
    warnSpy.mockRestore();
  });

  it("returns default confidence when STATUS block has malformed JSON (P44)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = `<!-- STATUS: {invalid json} -->\n# Report`;
    const result = parseComplianceReport(report);
    expect(result.confidence).toBe("default");
    expect(result.result).toBe("unknown");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Malformed JSON"));
    warnSpy.mockRestore();
  });

  it("returns default confidence on empty input (P44)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseComplianceReport("");
    expect(result.confidence).toBe("default");
    expect(result.result).toBe("unknown");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Empty compliance report"));
    warnSpy.mockRestore();
  });

  it("handles STATUS block with unknown result value gracefully", () => {
    const report = `<!-- STATUS: {"result": "MAYBE", "done": 1, "missing": 0, "uncertain": 0} -->`;
    const result = parseComplianceReport(report);
    expect(result.result).toBe("unknown");
    expect(result.confidence).toBe("structured");
  });
});

describe("parseComplianceFixReport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses valid PASS fix report", () => {
    const report = `<!-- STATUS: {"result": "PASS", "itemsFixed": 2, "itemsRemaining": 0} -->
# Compliance Fix Report: US-99`;
    const result = parseComplianceFixReport(report);
    expect(result.result).toBe("PASS");
    expect(result.confidence).toBe("structured");
    expect(result.itemsFixed).toBe(2);
    expect(result.itemsRemaining).toBe(0);
  });

  it("parses FAIL fix report with remaining items", () => {
    const report = `<!-- STATUS: {"result": "FAIL", "itemsFixed": 1, "itemsRemaining": 1} -->
# Fix Report`;
    const result = parseComplianceFixReport(report);
    expect(result.result).toBe("FAIL");
    expect(result.itemsFixed).toBe(1);
    expect(result.itemsRemaining).toBe(1);
  });

  it("returns default confidence when STATUS block is missing (P44)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseComplianceFixReport("# Fix Report\nDone.");
    expect(result.confidence).toBe("default");
    expect(result.result).toBe("unknown");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Missing STATUS block"));
    warnSpy.mockRestore();
  });

  it("returns default confidence on empty input (P44)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseComplianceFixReport("");
    expect(result.confidence).toBe("default");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Empty compliance fix report"));
    warnSpy.mockRestore();
  });
});
