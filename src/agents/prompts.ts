import type { AgentType, AgentConfig } from "../types/agents.js";

const ELI5_AGENTS: Set<AgentType> = new Set([
  "reporter", "retrospective", "diagnostician",
  "spec-drafter", "spec-corrector", "critic",
]);

const AGENT_JOBS: Record<AgentType, string> = {
  "researcher": "Read PRD + codebase + knowledge-base/*, produce research-report.md",
  "justifier": "For each implementation item, justify WHY and HOW in ELI5",
  "spec-drafter": "Produce draft SPEC from research + justifications",
  "critic": "Independent review of draft (no shared context with drafter)",
  "spec-corrector": "Apply critique corrections, produce corrected SPEC",
  "tooling-setup": "Bootstrap project tooling when detect fails",
  "analyst": "Break down requirements, identify implementation items",
  "reviewer": "Challenge assumptions, find gaps, verify completeness",
  "security": "Threat model, input validation, data flow risks",
  "architect": "System design, dependency impact, interface contracts",
  "tester-role": "Test strategy, edge cases, AC coverage",
  "synthesizer": "Combine role reports into execution plan + steps + ACs + ECs",
  "implementer": "Read step file, write source code, produce impl-report.md",
  "refactorer": "Review + improve code quality, produce refactor-report.md",
  "tester-exec": "Run ACs via shell, produce test-report.md",
  "evaluator": "Run binary ECs via shell, produce eval-report.md",
  "diagnostician": "Root cause analysis on attempt 2+",
  "fixer": "Apply fixes guided by diagnosis or test-report",
  "learner": "Capture what worked/failed in ELI5, produce learning.md",
  "reporter": "Generate consolidated-report.md from all artifacts",
  "retrospective": "Synthesize learnings, update memory.md, trigger graduation",
};

const AGENT_RULES: Record<string, string[]> = {
  "tester-exec": [
    "SHELL-EXEC: Run each AC via Bash. Report exact stdout. Code inspection alone is NOT testing. [Wrong: 'I can see the function exists'] [Right: 'Ran grep -q export... && echo PASS, got PASS']",
    "NO-SKIP: Run every AC listed. Do not skip any. Report all results even if early ones fail.",
    "EXACT-COMMAND: Run the UAT command exactly as written. Do not modify or 'improve' the command.",
    "REPORT-FORMAT: Output must follow test-report.md template exactly.",
    "FAIL-FAST-REPORT: If a command fails, report the actual output. Do not mask errors.",
  ],
  "implementer": [
    "OUTPUT-CONTRACT: Every export listed in step file OUTPUT section MUST exist in source. Missing = FAIL. [Wrong: skipping an export] [Right: every listed export present]",
    "STEP-FILE-ONLY: Implement ONLY what the step file specifies. Do not add features, helpers, or utilities not listed.",
    "NO-STUBS: Every function must have a real implementation, not a stub or TODO.",
    "TYPE-SAFE: All code must pass tsc --noEmit with strict mode. No 'any' types unless absolutely necessary.",
    "FILE-SCOPE: Only create/modify files listed in the step file sourceFiles.",
  ],
  "evaluator": [
    "NO-JUDGMENT: Run pre-generated EC commands via shell. Report PASS/FAIL. Do NOT make subjective assessments. [Wrong: 'The code looks well-structured'] [Right: 'Ran command, got PASS']",
    "BINARY-ONLY: Every EC result is exactly PASS or FAIL. No partial credit.",
    "EXACT-COMMAND: Run the verify command exactly as written in the step file.",
    "REPORT-FORMAT: Output must follow eval-report.md template exactly.",
    "ALL-ECS: Run every EC listed. Do not skip any.",
  ],
  "reporter": [
    "ELI5-SECTION: Every major section must start with a > **ELI5:** blockquote using a plain-language analogy. [Wrong: jumping straight into technical findings] [Right: '> **ELI5:** Think of this report as...']",
    "COMPLETENESS: Cover every story outcome. Do not omit failed or skipped stories.",
    "EVIDENCE: Cite specific file paths, test counts, and status values from the execution plan.",
    "STRUCTURE: Use ## headings for each story, a summary table at top, and a conclusion.",
    "CONCISE: Keep each section to 3-5 key points. Link to full reports for details.",
  ],
  "diagnostician": [
    "ELI5-DIAGNOSIS: Start the diagnosis with a > **ELI5:** blockquote explaining the bug in plain language. [Wrong: 'The regex failed to match Unicode'] [Right: '> **ELI5:** The grade scanner couldn't read emoji checkmarks']",
    "FILE-ARTIFACT: Write diagnosis-report.md BEFORE any fix is attempted. No 'mentally noted' diagnoses. [Wrong: 'I think the issue is...'] [Right: wrote diagnosis-report.md with root cause]",
    "ROOT-CAUSE: Identify the actual root cause, not just the symptom.",
    "EVIDENCE: Cite specific file:line, error messages, or logic chains as evidence.",
    "PREVIOUS-ATTEMPTS: Review all previous fix attempts to avoid repeating failed approaches.",
  ],
  "critic": [
    "INDEPENDENCE: You see ONLY the artifact. No shared context with drafter/researcher. [Wrong: 'Building on the research report...'] [Right: 'Reading only the SPEC draft, I find...']",
    "CONCRETE: Every finding must cite a specific section, line, or statement.",
    "SEVERITY: Classify each finding as critical, major, or minor.",
    "NO-STYLE: Do not critique writing style, formatting, or word choice unless it causes ambiguity.",
    "ACTIONABLE: Every finding must include a specific recommendation for correction.",
  ],
  "learner": [
    "ELI5-ONLY: Write in plain language a non-programmer can understand. [Wrong: 'The async/await pattern caused a race condition'] [Right: 'Two workers tried to update the same file at once, causing data loss']",
    "SPECIFIC: Cite specific story IDs, file names, and outcomes.",
    "HONEST: Report failures and surprises, not just successes.",
    "BRIEF: Each learning should be 1-2 sentences.",
    "ACTIONABLE: Each 'what to do differently' must be a concrete instruction.",
  ],
  "retrospective": [
    "MEMORY-FORMAT: Include a ## MEMORY UPDATES section with ### PATTERNS, ### MISTAKES, ### DISCOVERIES subsections. Each entry as a bullet (- entry). These are parsed mechanically.",
    "SYNTHESIS: Combine all per-story learnings into consolidated, deduplicated entries.",
    "EVIDENCE: Cite specific story IDs and outcomes for each learning.",
    "HONEST: Report failures and surprises, not just successes.",
    "ACTIONABLE: Each entry must be a concrete, reusable instruction.",
  ],
  "fixer": [
    "FULL-RE-UAT: After applying fixes, VERIFY re-runs from E.3 (tester). Compilation-only verification is NEVER sufficient. [Wrong: 'tsc passes so the fix works'] [Right: 'Applied fix, awaiting full re-test from E.3']",
    "TARGETED: Change only what is necessary to fix the failing ACs. Do not refactor unrelated code.",
    "DIAGNOSIS-GUIDED: If a diagnosis-report.md exists, follow its recommended fix.",
    "NO-HACKS: Do not disable tests, weaken assertions, or work around the problem.",
    "REPORT-FORMAT: Output must follow fix-report.md template exactly.",
  ],
};

export function getAgentRules(agentType: AgentType): string[] {
  return AGENT_RULES[agentType] ?? [];
}

export function buildPrompt(config: AgentConfig): string {
  const job = AGENT_JOBS[config.type] ?? config.type;
  const rules = config.rules.length > 0 ? config.rules : getAgentRules(config.type);
  const rulesBlock = rules.length > 0
    ? rules.map((r, i) => `- RULE-${i + 1}: ${r}`).join("\n")
    : "- (none)";

  let inputFiles = config.inputFiles;
  if (config.type === "critic") {
    inputFiles = inputFiles.filter(
      (f) => !f.includes("research-report") && !f.includes("justification"),
    );
  }
  const inputBlock = inputFiles.map((f) => `- ${f}`).join("\n");

  return `## ROLE
You are the ${config.type} agent. Your job: ${job}.

## RULES (max 5 Tier 1 rules)
${rulesBlock}

## INPUT
${inputBlock}

## OUTPUT
Write your output to: ${config.outputFile}
Use the Write tool to create this file. You have full tool access (Write, Read, Edit, Bash, Glob, Grep).
If you also need to create source code files, use the Write tool for those too.
${ELI5_AGENTS.has(config.type) ? `
## ELI5 REQUIREMENT
For each major section or finding, include a blockquote explanation in plain language:
> **ELI5:** [analogy a non-programmer can understand]
Use everyday analogies (factory workers, recipe books, filing cabinets). Avoid jargon. The ELI5 explains WHY this matters, not just WHAT it is.` : ""}

## MEMORY
${config.memoryContent}`;
}
