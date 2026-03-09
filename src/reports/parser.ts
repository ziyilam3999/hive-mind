export interface ParseResult {
  status: string;
  confidence: "matched" | "default";
}

export function parseReportStatus(markdown: string): ParseResult {
  // 1. Explicit heading: ## STATUS: PASS or ## VERDICT: PASS
  const statusMatch = markdown.match(/##\s+(?:STATUS|VERDICT):\s*(\w+)/i);
  if (statusMatch) return { status: statusMatch[1].toUpperCase(), confidence: "matched" };

  // 2. Inline "Status: ..." -- scan for LAST occurrence of PASS/FAIL/PASSED/FAILED/COMPLETE
  //    Agents prepend qualifiers ("ALL PASS", "13/13 RUNTIME TESTS PASS"), so we capture
  //    the full status line and find the last known keyword rather than the first \w+.
  const inlineMatch = markdown.match(
    /(?:^|\n)\s*\*?\*?(?:Final\s+)?Status\*?\*?:\s*(.+)/i,
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
): { status: string; confidence: "matched" | "default"; results: { acId: string; result: string }[] } {
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
): { verdict: string; confidence: "matched" | "default"; results: { ecId: string; result: string }[] } {
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
): { status: string; confidence: "matched" | "default"; filesCreated: string[] } {
  const { status, confidence } = parseReportStatus(markdown);
  const filesCreated: string[] = [];
  const rows = markdown.match(/^\|[^|]+\|[^|]+\|[^|]+\|$/gm);
  if (rows) {
    for (const row of rows) {
      const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 1 && !cells[0].startsWith("File") && !cells[0].startsWith("-")) {
        filesCreated.push(cells[0]);
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
