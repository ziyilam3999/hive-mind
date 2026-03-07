export function parseReportStatus(markdown: string): string {
  const statusMatch = markdown.match(/##\s+(?:STATUS|VERDICT):\s*(\w+)/);
  return statusMatch?.[1] ?? "FAIL";
}

export function parseTestReport(
  markdown: string,
): { status: string; results: { acId: string; result: string }[] } {
  const status = parseReportStatus(markdown);
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
  return { status, results };
}

export function parseEvalReport(
  markdown: string,
): { verdict: string; results: { ecId: string; result: string }[] } {
  const verdict = parseReportStatus(markdown);
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
  return { verdict, results };
}

export function parseImplReport(
  markdown: string,
): { status: string; filesCreated: string[] } {
  const status = parseReportStatus(markdown);
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
  return { status, filesCreated };
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
