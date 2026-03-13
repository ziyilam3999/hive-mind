export interface ParseResult {
  status: string;
  confidence: "structured" | "matched" | "default";
}

export function parseReportStatus(markdown: string): ParseResult {
  // Level 0: Structured JSON status block (highest priority)
  // Format: <!-- STATUS: {"result": "PASS", "details": "..."} -->
  const jsonBlockMatch = markdown.match(/<!--\s*STATUS:\s*(\{[^}]*\})\s*-->/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]) as { result?: string; details?: string };
      if (parsed.result === "PASS" || parsed.result === "FAIL") {
        return { status: parsed.result, confidence: "structured" };
      }
    } catch {
      // Malformed JSON — fall through to regex cascade
      console.warn("Malformed JSON in STATUS block, falling back to regex cascade");
    }
  }

  // Level 1+: Regex cascade (fallback)
  if (!jsonBlockMatch) {
    // No JSON block present — this is expected for agents that don't support it yet
  } else {
    // JSON block was present but unparseable — already warned above
  }

  // 1. Explicit heading: ## STATUS: PASS or ## VERDICT: PASS
  const statusMatch = markdown.match(/##\s+(?:STATUS|VERDICT):\s*(\w+)/i);
  if (statusMatch) return { status: statusMatch[1].toUpperCase(), confidence: "matched" };

  // 2. Inline "Status: ..." -- scan for LAST occurrence of PASS/FAIL/PASSED/FAILED/COMPLETE
  //    Agents prepend qualifiers ("ALL PASS", "13/13 RUNTIME TESTS PASS"), so we capture
  //    the full status line and find the last known keyword rather than the first \w+.
  const inlineMatch = markdown.match(
    /(?:^|\n)\s*\*?\*?(?:\w+\s+)?(?:Status|Result|Verdict|Outcome)\*?\*?:\s*(.+)/i,
  );
  if (inlineMatch) {
    const statusLine = inlineMatch[1];
    const keywords = statusLine.match(/\b(PASS(?:ED)?|FAIL(?:ED)?|COMPLETE)\b/gi);
    if (keywords && keywords.length > 0) {
      const lastKeyword = keywords[keywords.length - 1].toUpperCase();
      if (["COMPLETE", "PASS", "PASSED"].includes(lastKeyword)) return { status: "PASS", confidence: "matched" };
      if (["FAIL", "FAILED"].includes(lastKeyword)) return { status: "FAIL", confidence: "matched" };
    }
  }

  // 3. Heuristic: summary table (emoji-agnostic -- emojis intentionally removed
  //    from the regex so it matches tables with or without emoji prefixes)
  const failCount = markdown.match(/FAIL\s*\|\s*0/);
  const passCount = markdown.match(/PASS\s*\|\s*(\d+)/);
  if (failCount && passCount && parseInt(passCount[1]) > 0) return { status: "PASS", confidence: "matched" };

  // 4. Fallback: check for a standalone PASS/FAIL line
  const standalonePass = markdown.match(/^\s*(?:\*{0,2})(?:[^\w\n]*?)PASS(?:ED)?(?:\*{0,2})\s*$/mi);
  const standaloneFail = markdown.match(/^\s*(?:\*{0,2})(?:[^\w\n]*?)FAIL(?:ED)?(?:\*{0,2})\s*$/mi);
  if (standalonePass && !standaloneFail) return { status: "PASS", confidence: "matched" };

  // 5. Default -- no recognizable status found
  return { status: "FAIL", confidence: "default" };
}

export function parseTestReport(
  markdown: string,
): { status: string; confidence: "structured" | "matched" | "default"; results: { acId: string; result: string }[] } {
  const { status, confidence } = parseReportStatus(markdown);
  const results: { acId: string; result: string }[] = [];
  const rows = markdown.match(/^\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|$/gm);
  if (rows) {
    for (const row of rows) {
      const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 5 && cells[0].startsWith("AC")) {
        results.push({ acId: cells[0], result: cells[4] });
      }
    }
  }
  return { status, confidence, results };
}

export function parseEvalReport(
  markdown: string,
): { verdict: string; confidence: "structured" | "matched" | "default"; results: { ecId: string; result: string }[] } {
  const { status: verdict, confidence } = parseReportStatus(markdown);
  const results: { ecId: string; result: string }[] = [];
  const rows = markdown.match(/^\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|$/gm);
  if (rows) {
    for (const row of rows) {
      const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 6 && cells[0].startsWith("EC")) {
        results.push({ ecId: cells[0], result: cells[5] });
      }
    }
  }
  return { verdict, confidence, results };
}

export function parseImplReport(
  markdown: string,
): { status: string; confidence: "structured" | "matched" | "default"; filesCreated: string[] } {
  const { status, confidence } = parseReportStatus(markdown);
  const filesCreated: string[] = [];

  // Scope to "Files Created" / "Source Files" section only (like parseFixReport)
  const filesSection = markdown.split(/^##\s+(?:FILES\s+CREATED|Source\s+Files\b)[^\n]*/im)[1]?.split(/^##/m)[0];
  if (filesSection) {
    // Parse table rows (3-column: | File | Lines | Exports |)
    const rows = filesSection.match(/^\|[^|]+\|[^|]+\|[^|]+\|$/gm);
    if (rows) {
      for (const row of rows) {
        const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
        if (cells.length >= 1 && !cells[0].startsWith("File") && !cells[0].startsWith("-")) {
          filesCreated.push(cells[0].replace(/`/g, ""));
        }
      }
    }
    // Parse bullet items (- `src/file.ts`) — agents use both formats
    const bullets = filesSection.match(/^-\s+`([^`]+)`/gm);
    if (bullets) {
      for (const bullet of bullets) {
        const match = bullet.match(/^-\s+`([^`]+)`/);
        if (match) filesCreated.push(match[1]);
      }
    }
  }

  return { status, confidence, filesCreated };
}

export function checkEli5Presence(markdown: string): { hasEli5: boolean; sectionCount: number; eli5Count: number } {
  const sections = (markdown.match(/^##\s+/gm) || []).length;
  const eli5s = (markdown.match(/>\s*\*\*ELI5/gm) || []).length;
  return { hasEli5: eli5s > 0, sectionCount: sections, eli5Count: eli5s };
}

export interface ComplianceResult {
  result: "PASS" | "FAIL" | "unknown";
  done: number;
  missing: number;
  uncertain: number;
  confidence: "structured" | "default";
  instructions: { instruction: string; status: string; evidence: string }[];
}

/**
 * Parse compliance-report.md produced by the compliance-reviewer agent.
 * Extracts the structured STATUS block (P31/RD-04) and the instruction table.
 * Logs warning on parse failure (P44) — never silent catch.
 */
export function parseComplianceReport(markdown: string): ComplianceResult {
  const defaultResult: ComplianceResult = {
    result: "unknown",
    done: 0,
    missing: 0,
    uncertain: 0,
    confidence: "default",
    instructions: [],
  };

  if (!markdown || markdown.trim().length === 0) {
    console.warn("[parseComplianceReport] Empty compliance report — treating as unknown");
    return defaultResult;
  }

  // Extract STATUS block from first 500 chars (P31 — verdict in first 200, but allow margin)
  const statusMatch = markdown.slice(0, 500).match(/<!--\s*STATUS:\s*(\{[^}]*\})\s*-->/);
  if (!statusMatch) {
    console.warn(`[parseComplianceReport] Missing STATUS block — first 200 chars: ${markdown.slice(0, 200)}`);
    return defaultResult;
  }

  let parsed: { result?: string; done?: number; missing?: number; uncertain?: number };
  try {
    parsed = JSON.parse(statusMatch[1]);
  } catch (err) {
    console.warn(`[parseComplianceReport] Malformed JSON in STATUS block: ${statusMatch[1]}`);
    return defaultResult;
  }

  const result = parsed.result === "PASS" ? "PASS"
    : parsed.result === "FAIL" ? "FAIL"
    : "unknown";

  // Parse instruction table rows
  const instructions: { instruction: string; status: string; evidence: string }[] = [];
  const rows = markdown.match(/^\|\s*\d+\s*\|[^|]+\|[^|]+\|[^|]+\|$/gm);
  if (rows) {
    for (const row of rows) {
      const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 4) {
        instructions.push({
          instruction: cells[1],
          status: cells[2],
          evidence: cells[3],
        });
      }
    }
  }

  return {
    result,
    done: parsed.done ?? 0,
    missing: parsed.missing ?? 0,
    uncertain: parsed.uncertain ?? 0,
    confidence: "structured",
    instructions,
  };
}

export interface ComplianceFixResult {
  result: "PASS" | "FAIL" | "unknown";
  itemsFixed: number;
  itemsRemaining: number;
  confidence: "structured" | "default";
}

/**
 * Parse compliance-fix-report.md produced by the compliance-fixer agent.
 * Extracts the structured STATUS block (P31/RD-04).
 * Logs warning on parse failure (P44) — never silent catch.
 */
export function parseComplianceFixReport(markdown: string): ComplianceFixResult {
  const defaultResult: ComplianceFixResult = {
    result: "unknown",
    itemsFixed: 0,
    itemsRemaining: 0,
    confidence: "default",
  };

  if (!markdown || markdown.trim().length === 0) {
    console.warn("[parseComplianceFixReport] Empty compliance fix report — treating as unknown");
    return defaultResult;
  }

  const statusMatch = markdown.slice(0, 500).match(/<!--\s*STATUS:\s*(\{[^}]*\})\s*-->/);
  if (!statusMatch) {
    console.warn(`[parseComplianceFixReport] Missing STATUS block — first 200 chars: ${markdown.slice(0, 200)}`);
    return defaultResult;
  }

  let parsed: { result?: string; itemsFixed?: number; itemsRemaining?: number };
  try {
    parsed = JSON.parse(statusMatch[1]);
  } catch {
    console.warn(`[parseComplianceFixReport] Malformed JSON in STATUS block: ${statusMatch[1]}`);
    return defaultResult;
  }

  const result = parsed.result === "PASS" ? "PASS"
    : parsed.result === "FAIL" ? "FAIL"
    : "unknown";

  return {
    result,
    itemsFixed: parsed.itemsFixed ?? 0,
    itemsRemaining: parsed.itemsRemaining ?? 0,
    confidence: "structured",
  };
}

export function parseFixReport(
  markdown: string,
): { fixesApplied: { file: string; description: string }[] } {
  const fixesApplied: { file: string; description: string }[] = [];
  const fixSection = markdown.split("## FIXES APPLIED")[1]?.split("##")[0];
  if (fixSection) {
    const rows = fixSection.match(/^\|[^|]+\|[^|]+\|[^|]+\|$/gm);
    if (rows) {
      for (const row of rows) {
        const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
        if (cells.length >= 3 && !cells[0].startsWith("#") && !cells[0].startsWith("-")) {
          fixesApplied.push({ file: cells[1], description: cells[2] });
        }
      }
    }
  }
  return { fixesApplied };
}
