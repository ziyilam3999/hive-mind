import type { AgentType, AgentConfig } from "../types/agents.js";
import type { RoleName } from "../types/execution-plan.js";
import { readFileSafe, fileExists } from "../utils/file-io.js";
import { join } from "node:path";

const ELI5_AGENTS: Set<AgentType> = new Set([
  "reporter", "retrospective", "diagnostician",
  "spec-drafter", "spec-corrector", "critic",
  "feature-spec-drafter",
  "scorecard",
]);

/** Agents that produce status reports (PASS/FAIL) — get structured output instruction */
const STATUS_AGENTS: Set<AgentType> = new Set([
  "tester-exec", "evaluator", "implementer", "fixer", "compliance-reviewer", "compliance-fixer",
]);

/** Agents that may create temporary helper scripts — get scratch directory instruction */
const SCRATCH_AGENTS: Set<AgentType> = new Set([
  "tester-exec", "evaluator",
]);

/** Agents that produce raw JSON output — do NOT add sentinel (breaks JSON parsing) */
const JSON_OUTPUT_AGENTS: Set<AgentType> = new Set([
  "planner", "decomposer",
]);

const AGENT_JOBS: Record<AgentType, string> = {
  "researcher": "Read PRD + codebase + knowledge-base/*, produce research-report.md with justification analysis",
  "spec-drafter": "Produce draft SPEC from research report",
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
  "diagnostician": "Root cause analysis before every fix attempt",
  "fixer": "Apply fixes guided by diagnosis or test-report",
  "learner": "Capture what worked/failed in ELI5, produce learning.md",
  "reporter": "Generate consolidated-report.md from all artifacts",
  "retrospective": "Synthesize learnings, update memory.md, trigger graduation",
  "planner": "Read spec + role-reports, produce execution-plan.json with story skeletons (no ACs/ECs)",
  "ac-generator": "Read story skeleton + spec sections, produce acceptance criteria for the story",
  "ec-generator": "Read story skeleton + ACs, produce executable verification commands for the story",
  "code-reviewer": "Review implementation reports + source files, produce code-review-report.md",
  "log-summarizer": "Analyze manager-log.jsonl for pipeline health patterns (retry rates, cost outliers, slow agents)",
  "enricher": "Read step file + role-reports, append Implementation Guidance / Security Requirements / Edge Cases sections",
  "compliance-reviewer": "Read step file + impl-report + source files, check every instruction has a corresponding implementation, produce compliance-report.md",
  "compliance-fixer": "Read compliance-report MISSING items + step file + source files, implement the missing instructions, produce compliance-fix-report.md",
  "decomposer": "Break high-complexity story into 2-4 focused sub-tasks, splitting by file boundaries, producing structured JSON output",
  "integration-verifier": "Read SPEC inter-module contracts + impl-reports for both modules in a boundary pair, verify implementations satisfy contracts, produce integration-report.md",
  "diagnostician-bug": "Read bug report + codebase, perform root cause analysis, produce diagnosis-report-attempt-N.md with Root Cause, Affected Files, Recommended Fix, and Confidence sections",
  "workspace-cleanup": "Identify and relocate stray files created by prior agents outside the scratch directory",
  "normalizer": "Read input document (any format: plan, design doc, rough notes, existing PRD), produce a structured normalized-prd.md",
  "relevance-scanner": "Read project file listing + PRD, score each file for relevance, produce relevance-map.md with CRITICAL/HIGH/MEDIUM/LOW/NONE classifications",
  "codebase-analyzer": "Read relevance-map.md, inspect CRITICAL/HIGH source files via tool calls, produce spec-existing.md documenting current architecture, integration points, and constraints",
  "feature-spec-drafter": "Produce spec-new-features.md from research report + PRD in isolation — NO codebase files, design features from first principles to avoid anchoring on existing patterns",
  "reconciler": "Merge spec-existing.md (what exists) with spec-new-features.md (what's new) into SPEC-draft.md, categorizing each item as REUSE/MODIFY/CREATE with integration instructions",
  "scorecard": "Produce or update report-card.md with stage-specific metrics, cumulative progress, and (on final stage) an overall letter grade",
  "plan-validator": "Read execution-plan.json + project source files, detect cross-story structural gaps (missing registry files, shared output conflicts, import chain breaks), produce corrected plan JSON + plan-validation-report.md",
};

const AGENT_RULES: Record<string, string[]> = {
  "researcher": [
    "EVIDENCE-RULE: Cite file:line for every factual claim. No unsupported assertions. [Wrong: 'The codebase uses X'] [Right: 'src/foo.ts:42 exports X']",
    "JUSTIFICATION-ANALYSIS: Evaluate every PRD decision — classify as JUSTIFIED (evidence supports it), UNJUSTIFIED (no rationale given), or QUESTIONED (rationale exists but is weak). Include a ## Justification Analysis section.",
    "FAILURE-MODE-CHECK: Flag features missing failure/overload/missing-data behavior. Include a ## Gap Analysis: Failure Modes section with GAP-FAILURE-MODE items.",
    "COMPLETENESS: Cover every PRD requirement. If a requirement is ambiguous, flag it as AMBIGUOUS rather than skipping.",
    "NO-JUDGMENT: Report findings objectively. Do not rewrite the PRD or propose alternatives — that is the drafter's job.",
  ],
  "spec-drafter": [
    "FACT-VERIFY: Before incorporating any researcher claim, verify it against the actual input files. Do not propagate unverified findings.",
    "AUTHOR-VOICE: Keep the PRD author's structure, format, and intent. The SPEC should feel like a natural evolution of the PRD, not a rewrite.",
    "CHANGE-JUSTIFIED: Every change from the PRD must be explainable. If you cannot articulate why a change improves the spec, do not make it.",
    "UNJUSTIFIED-FIX: Address all UNJUSTIFIED and GAP-FAILURE-MODE items from the research report. Each must have a resolution in the SPEC.",
  ],
  "spec-corrector": [
    "PRECISE-FIX: Apply only the fixes flagged in the critique. Do not make additional changes.",
    "SKIP-INVALID: If a critique finding is incorrect, explain why it is being skipped rather than silently ignoring it.",
    "NO-OVERCORRECT: Skip MINOR findings that do not materially improve the document. Focus on critical and major issues.",
    "CONSISTENCY-CHECK: After applying fixes, verify all sections still agree with each other. Cross-reference definitions, interfaces, and requirements.",
  ],
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
    "FILE-SCOPE: Only create/modify files listed in the step file sourceFiles. Respect each file's changeType: ADDED = create new file from scratch, MODIFIED = edit existing file (read first, preserve existing code), REMOVED = delete the file.",
  ],
  "refactorer": [
    "FILE-SCOPE: Only modify files listed in your ## INPUT section. Do NOT create or modify files outside this set. [Wrong: editing app.ts when it is not listed in ## INPUT] [Right: refactoring only the files provided as input]",
    "NO-FUNCTIONAL-CHANGE: Preserve all existing behavior. Refactoring must not change what the code does. [Wrong: altering return values or adding side effects] [Right: renaming internal variables, extracting helpers within the same file, reorganizing imports]",
    "NO-NEW-DEPS: Do not add new external dependencies or imports that the implementer did not already introduce.",
    "REPORT-FORMAT: Output must follow refactor-report.md template exactly.",
    "EVIDENCE: Cite specific file:line for each change made.",
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
    "SOURCE-OF-TRUTH: The file story-status-summary.md contains AUTHORITATIVE pass/fail counts computed directly from execution-plan.json. Your summary table MUST match these exact numbers. A story is PASS only if status === 'passed'. Do NOT count stories from impl-reports — some stories failed at VERIFY/EVAL even though impl completed. [Wrong: counting impl-report PASS as story PASS] [Right: using story-status-summary.md totals verbatim]",
    "COMPLETENESS: Cover every story outcome. Do not omit failed or skipped stories.",
    "EVIDENCE: Cite specific file paths, test counts, and status values from the execution plan.",
    "STRUCTURE: Use ## headings for each story, a summary table at top, and a conclusion. Keep each section to 3-5 key points and link to full reports for details.",
  ],
  "diagnostician": [
    "ELI5-DIAGNOSIS: Start the diagnosis with a > **ELI5:** blockquote explaining the bug in plain language. [Wrong: 'The regex failed to match Unicode'] [Right: '> **ELI5:** The grade scanner couldn't read emoji checkmarks']",
    "FILE-ARTIFACT: Write diagnosis-report.md BEFORE any fix is attempted. No 'mentally noted' diagnoses. [Wrong: 'I think the issue is...'] [Right: wrote diagnosis-report.md with root cause]",
    "ROOT-CAUSE: Identify the actual root cause, not just the symptom. Cite specific file:line, error messages, or logic chains as evidence.",
    "CHECK-FILES: Review all source files provided in your input for the actual code state. Compare against the step file's acceptance criteria to identify which ACs are met and which are missing or broken. If the FILE EXISTENCE STATUS block reports missing files, diagnose WHY they are missing (never created? wrong path? deleted?).",
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
    "FEEDBACK-LOOP: For each learning, classify as KEEP (working well), CHANGE (needs improvement), ADD (missing capability), or DROP (unnecessary overhead). This ensures balanced retrospectives — not just what went wrong.",
  ],
  "fixer": [
    "FULL-RE-UAT: After applying fixes, VERIFY re-runs from E.3 (tester). Compilation-only verification is NEVER sufficient. [Wrong: 'tsc passes so the fix works'] [Right: 'Applied fix, awaiting full re-test from E.3']",
    "TARGETED: Change only what is necessary to fix the failing ACs. Do not refactor unrelated code, disable tests, weaken assertions, or work around the problem.",
    "DIAGNOSIS-GUIDED: If a diagnosis-report.md exists, follow its recommended fix.",
    "STEP-FILE-IS-CANONICAL: The step file (US-XX.md) is the single source of truth for ACs and ECs. If you need to fix an AC or EC command, patch the step file directly. Do NOT patch separate files like US-XX-ecs.md or US-XX-acs.md — the evaluator only reads from the assembled step file.",
    "REPORT-FORMAT: You MUST use Edit/Write to modify target files BEFORE writing your fix-report. The report documents changes already made, not intended changes. Output must follow fix-report.md template exactly.",
  ],
  "planner": [
    "SKELETON-ONLY: Produce story skeletons with GOAL, SPEC REFS, INPUT, OUTPUT. Do NOT generate ACs or ECs.",
    "STRUCTURED-OUTPUT: Output must be valid JSON matching EXECUTION_PLAN_SCHEMA.",
    "COMPLETE-COVERAGE: Every requirement in the spec must map to at least one story.",
    "DEPENDENCY-ORDER: Stories must be ordered so dependencies are resolved before dependents.",
    "ROLE-AWARE: Reference which role-reports informed each story via rolesUsed field.",
  ],
  "ac-generator": [
    "SPEC-GROUNDED: Every AC must trace to a specific spec section or requirement.",
    "TESTABLE: Each AC must be verifiable via a concrete shell command or assertion.",
    "COMPLETE: Cover all functional requirements from the story skeleton's SPEC REFS.",
    "NO-OVERLAP: Do not duplicate ACs across stories. Each AC belongs to exactly one story.",
    "EARS-FORMAT: Use WHEN/THEN format for each AC. Example: 'WHEN the user calls POST /api/items with a valid payload THEN the response status is 201 and the item is persisted.' Include a UAT command after each AC.",
  ],
  "ec-generator": [
    "BINARY: Every EC must produce exactly PASS or FAIL when run via shell.",
    "AUTOMATED: Each EC must be a single shell command that exits 0 (PASS) or non-zero (FAIL).",
    "AC-COVERAGE: At least one EC per AC. Every AC must have verification.",
    "IDEMPOTENT: ECs must be safe to run multiple times without side effects.",
    "FORMAT: Output as numbered markdown list with exact shell commands.",
  ],
  "code-reviewer": [
    "EVIDENCE-BASED: Cite specific file:line for every finding. No vague observations.",
    "SEVERITY: Classify each finding as critical, major, or minor.",
    "NO-STYLE: Do not critique formatting, naming conventions, or style unless it causes bugs.",
    "ACTIONABLE: Every finding must include a concrete fix recommendation.",
    "REPORT-FORMAT: Output must follow code-review-report.md template exactly.",
  ],
  "log-summarizer": [
    "DATA-DRIVEN: Base all findings on actual log entries. Cite timestamps and agent IDs.",
    "PATTERNS: Focus on retry rates, cost outliers, slow agents, and failure clusters.",
    "CONCISE: Summarize in bullet points. No verbose narratives.",
    "QUANTITATIVE: Include counts, percentages, and durations where available.",
    "REPORT-FORMAT: Output must follow log-analysis.md template exactly.",
  ],
  "compliance-reviewer": [
    "INSTRUCTION-COVERAGE: Every bullet/requirement in the step file must map to a concrete implementation. Grep source files for evidence. DONE = found (cite file:line). MISSING = not found. [Wrong: 'Looks implemented'] [Right: 'Found at src/state/manager-log.ts:13 — JSDoc comment present']",
    "DOC-COVERAGE: Every 'document X' or 'add comment for X' instruction must have a corresponding code comment. MISSING if no comment within 5 lines of target. [Wrong: 'Comment probably exists'] [Right: 'Grepped src/utils/cost-tracker.ts:31 — no JSDoc found → MISSING']",
    "TEST-COVERAGE: Every 'write test for X' instruction must have a matching test case. Grep __tests__/ for describe/it blocks. MISSING if no matching test. [Wrong: 'Tests exist in the test file'] [Right: 'Found it(\"does not write to execution plan\") at __tests__/stages/execute-verify.test.ts:215 → DONE']",
    "NO-FALSE-POSITIVES: Only mark MISSING if grep finds zero matches. If ambiguous, mark UNCERTAIN with explanation. Never flag something as MISSING if you're unsure.",
    "STRUCTURED-OUTPUT: Output MUST start with <!-- STATUS: {\"result\": \"PASS|FAIL\", \"done\": N, \"missing\": N, \"uncertain\": N} --> in first 200 chars. Then list each instruction with DONE/MISSING/UNCERTAIN + file:line evidence in a markdown table.",
  ],
  "compliance-fixer": [
    "PLAN-DRIVEN: Only implement items flagged MISSING in the compliance report. Ignore UNCERTAIN and DONE items. [Wrong: refactoring code marked DONE] [Right: adding the missing JSDoc that was flagged MISSING]",
    "STEP-FILE-ONLY: All changes must trace to an instruction in the step file. No creative additions beyond what the plan requires.",
    "MINIMAL-DIFF: Make the smallest change that satisfies each missing instruction. A doc comment is one comment, not a rewrite.",
    "REPORT-CHANGES: Output MUST start with <!-- STATUS: {\"result\": \"PASS|FAIL\", \"itemsFixed\": N, \"itemsRemaining\": N} --> in first 200 chars. List each addressed item with file path and change description.",
    "NO-FUNCTIONAL-REGRESSION: Do not modify existing passing logic. Compliance fixes are additive (comments, tests, new functions). Run npm test after changes to verify no regressions.",
  ],
  "decomposer": [
    "FILE-BOUNDARY: When a story has multiple sourceFiles, split sub-tasks along file boundaries. Each sub-task owns a distinct subset. When a story has a single sourceFile, split by logical responsibility — all sub-tasks share that file.",
    "SCOPE-SPLIT: Produce 2-4 sub-tasks. Each must be independently buildable and verifiable.",
    "STRUCTURED-OUTPUT: Output MUST be valid JSON matching: { \"subTasks\": [{ \"id\": \"US-XX.1\", \"title\": \"...\", \"description\": \"...\", \"sourceFiles\": [\"...\"] }] }. No markdown fences.",
    "COMPLETE-COVERAGE: Every sourceFile must appear in at least one sub-task. For multi-file stories, the union of sub-task sourceFiles must equal the story's sourceFiles.",
  ],
  "enricher": [
    "APPEND-ONLY: Add new sections (## Implementation Guidance, ## Security Requirements, ## Edge Cases). NEVER modify existing content.",
    "ROLE-GROUNDED: Every guidance item must trace to a specific role-report finding.",
    "CONCISE: Keep each added section to 3-5 key points.",
    "PRESERVE-STRUCTURE: Existing step file sections must remain intact and unmodified.",
    "VALIDATE: After enrichment, verify all original sections are still present.",
  ],
  "integration-verifier": [
    "CONTRACT-CHECK: For each contract in ## Inter-Module Contracts, verify producer exports match consumer imports.",
    "EVIDENCE-BASED: Read actual source files and impl-reports. Do not rely on assumptions about what was implemented.",
    "BOUNDARY-FOCUS: Only verify the specific producer→consumer boundary you were assigned. Do not check other module pairs.",
    "STRUCTURED-REPORT: Output must include: boundary (producer→consumer), PASS/FAIL per contract, plain-language summary of mismatches.",
    "NO-CONTRACTS-WARNING: If the SPEC has no ## Inter-Module Contracts section, report WARNING 'No contracts defined — cannot verify'.",
  ],
  "diagnostician-bug": [
    "ROOT-CAUSE: Identify the actual root cause using Glob, Grep, and Read to search the codebase. Reference specific file:line locations.",
    "MANDATORY-SECTIONS: Your output MUST contain these section keywords (any heading level accepted): Root Cause, Affected Files, Recommended Fix, Confidence. Missing any section = FAIL.",
    "AFFECTED-FILES: List each affected file with line numbers. Format: `path/to/file.ts:42-67 — description`.",
    "CONFIDENCE: Rate as HIGH (single clear root cause), MEDIUM (most likely cause), or LOW (multiple possible causes).",
    "ESCALATION: If Confidence is LOW and Affected Files spans >5 distinct files across >2 top-level dirs under src/, add an ## Escalation Recommendation section with ESCALATE_TO_PIPELINE.",
  ],
  "workspace-cleanup": [
    "DIFF-ONLY: Compare the current project root file listing against the pre-execution snapshot. Only files that are NEW (not in snapshot) are candidates for relocation.",
    "RELOCATE: Move stray files into the scratch directory using `mv`. Do not delete them.",
    "REPORT: List every relocated file in your output report. If no stray files found, report 'clean'.",
    "SAFE: Never touch files inside src/, node_modules/, .git/, or the .hive-mind-* directories.",
  ],
  "relevance-scanner": [
    "SCORE-ALL: Every file in the listing must receive a relevance score: CRITICAL (directly modified), HIGH (integration point), MEDIUM (referenced), LOW (same domain), NONE (unrelated).",
    "PRD-GROUNDED: Score based on PRD requirements. A file is CRITICAL only if a PRD requirement directly implies changes to it.",
    "FORMAT: Output as a markdown table with columns: File Path | Score | Reason (one-line justification).",
    "THRESHOLD: Include only CRITICAL, HIGH, and MEDIUM files in the output. Omit LOW and NONE to keep the map concise.",
    "NO-GUESSING: If you cannot determine relevance from the file path and first-line summary alone, score as MEDIUM with a note to investigate.",
  ],
  "codebase-analyzer": [
    "TOOL-DRIVEN: Use Read, Glob, and Grep tools to inspect source files on-demand. Do NOT rely solely on the relevance-map — read actual code.",
    "CITE-EVIDENCE: Every claim must include file:line references. [Wrong: 'The module exports X'] [Right: 'src/foo.ts:42 exports X']",
    "STRUCTURE: Organize output as: ## Architecture Overview, ## Integration Points, ## Constraints & Invariants, ## Patterns to Preserve.",
    "INTEGRATION-FOCUS: For each CRITICAL/HIGH file, document: what it exports, what depends on it, what conventions it follows.",
    "NO-DESIGN: You are documenting what EXISTS, not proposing changes. Do not suggest modifications or improvements.",
  ],
  "feature-spec-drafter": [
    "ISOLATION: You receive ONLY the research report and PRD. You do NOT see existing code. Design features from first principles.",
    "NO-ANCHORING: Do not reference or assume existing implementations. Describe what SHOULD exist, not what to modify.",
    "FACT-VERIFY: Before incorporating any researcher claim, verify it against the PRD. Do not propagate unverified findings.",
    "AUTHOR-VOICE: Keep the PRD author's structure, format, and intent. The spec should feel like a natural evolution of the PRD.",
    "UNJUSTIFIED-FIX: Address all UNJUSTIFIED and GAP-FAILURE-MODE items from the research report. Each must have a resolution.",
  ],
  "reconciler": [
    "CATEGORIZE: Every item in the merged SPEC must be tagged REUSE (use as-is), MODIFY (change existing), or CREATE (build new).",
    "CONFLICT-RESOLVE: When spec-existing and spec-new-features disagree, explain the conflict and choose the approach that minimizes integration risk.",
    "INTEGRATION-INSTRUCTIONS: For each MODIFY item, specify exactly which existing file/function to change and how.",
    "COMPLETENESS: The merged SPEC must cover everything from both inputs. Do not silently drop items from either source.",
    "SELF-REVIEW: After merging, verify that no REUSE item conflicts with a CREATE item (e.g., creating something that already exists).",
  ],
  "scorecard": [
    "ACCUMULATE: If report-card.md already has content, APPEND a new ## section for the current stage. Do NOT overwrite previous sections.",
    "GRADE-SCALE: Final grade only on REPORT stage. A (>=90% pass), B (>=75%), C (>=60%), D (>=50%), F (<50%). Adjust for retry success rate and failure severity.",
    "DATA-DRIVEN: Cite exact numbers from input files. No vague claims. Use markdown tables for metrics.",
    "FAILURE-CATEGORIES: When story results are available, group failures by pattern (verification, build, blocked by deps, etc.).",
    "CONCISE: Each stage section should be 15-25 lines. The full report card should fit on 2 screens max.",
  ],
  "normalizer": [
    "EXTRACT-REQUIREMENTS: Identify all requirements and number them REQ-01, REQ-02, etc. Group by phase/module if the source has phases. Extract or derive testable success criteria from the source — each criterion must be verifiable, not vague.",
    "PRESERVE-DECISIONS: Any explicit architecture, technology, or design decisions in the source must appear in a 'Fixed Architecture Decisions (DO NOT re-derive)' section as constraints.",
    "STRUCTURE: Output must have these sections in order: Problem Statement, Fixed Architecture Decisions, Requirements, Success Criteria, Out of Scope, Constraints, Additional Context.",
    "NO-INVENTION: Do not add requirements, features, or decisions not present in the source document. You are reformatting, not designing.",
    "PRESERVE-DETAIL: Include ALL file paths, interface definitions, config values, code examples from the source. If the source has numbered sections, reference them in requirements (e.g., 'per Section 15'). After structuring, verify every concrete detail appears in the structured sections; if any cannot be categorized, add it to 'Additional Context'.",
  ],
  "plan-validator": [
    "REGISTRY-DETECTION: For each story with changeType: ADDED files, check if the containing directory has a barrel/index file (index.ts, index.js, registry.ts, mod.ts). If so and no story lists that file as MODIFIED, add it to the creating story's sourceFiles as {path, changeType: 'MODIFIED'}.",
    "SHARED-OUTPUT: If multiple stories list the same file in sourceFiles, verify they have a dependency chain (one depends on the other). If not, flag as a potential conflict.",
    "IMPORT-CHAIN: When a story creates new exports, check if any existing file in the project imports from that module. If so and no story lists the importing file as MODIFIED, add it.",
    "STRUCTURED-OUTPUT: Output must be the modified execution-plan.json in a ```json block, followed by a ## CHANGES section listing every modification made and why.",
    "MINIMAL: Only add sourceFiles entries that are clearly necessary. Do not speculatively add files. When in doubt, leave the plan unchanged and log a warning.",
  ],
};

export const ROLE_REPORT_MAPPING: Partial<Record<AgentType, AgentType[]>> = {
  "implementer": ["architect", "security", "analyst"],
  "tester-exec": ["tester-role", "analyst", "security"],
  "diagnostician": ["architect", "security", "tester-role"],
  "refactorer": ["architect", "reviewer"],
  "learner": ["architect", "security", "analyst", "reviewer", "tester-role"],
};

export function getRoleReportsForAgent(
  agentType: AgentType,
  rolesUsed: AgentType[],
): AgentType[] {
  const mapping = ROLE_REPORT_MAPPING[agentType];
  if (!mapping) return [];
  const rolesSet = new Set(rolesUsed);
  return mapping.filter((role) => rolesSet.has(role));
}

export function getAgentRules(agentType: AgentType): string[] {
  return AGENT_RULES[agentType] ?? [];
}

export function buildPrompt(config: AgentConfig): string {
  // Normalize Windows backslash paths to forward slashes for Claude CLI (bash context).
  // Without this, agents strip backslashes and create garbled directory names (K13/K14).
  const toSlash = (p: string): string => p.replace(/\\/g, "/");

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
  const inputBlock = inputFiles.map((f) => `- ${toSlash(f)}`).join("\n");

  return `## ROLE
You are the ${config.type} agent. Your job: ${job}.

## RULES (max 5 Tier 1 rules)
${rulesBlock}

## INPUT
${inputBlock}

## OUTPUT (MANDATORY)
You MUST use the Write tool to create this file: ${toSlash(config.outputFile)}
This is not optional — if this file does not exist when you finish, you will be marked as FAILED.
If you also need to create source code files, use the Write tool for those too.
${ELI5_AGENTS.has(config.type) ? `
## ELI5 REQUIREMENT
For each major section or finding, include a blockquote explanation in plain language:
> **ELI5:** [analogy a non-programmer can understand]
Use everyday analogies (factory workers, recipe books, filing cabinets). Avoid jargon. The ELI5 explains WHY this matters, not just WHAT it is.` : ""}

${STATUS_AGENTS.has(config.type) ? `## STATUS BLOCK (REQUIRED)
Place this HTML comment in the FIRST 200 characters of your output file:
<!-- STATUS: {"result": "PASS"} -->
or
<!-- STATUS: {"result": "FAIL", "details": "brief reason"} -->
This must be a valid JSON object inside an HTML comment. "result" is "PASS" or "FAIL". "details" is optional.
This block is parsed mechanically — do NOT omit it, do NOT alter the format.
` : ""}${SCRATCH_AGENTS.has(config.type) && config.scratchDir ? `## SCRATCH DIRECTORY
Write any helper scripts or temporary files here: ${toSlash(config.scratchDir)}
Do NOT create .ts/.js files in the workspace root. The scratch directory already exists.
` : ""}${config.constitutionContent ? `## PROJECT CONSTITUTION
The following project conventions and standards apply to all work:
${config.constitutionContent}
` : ""}${config.roleReportContents ? `## ROLE REPORTS
The following role-report excerpts are relevant to your task:
${config.roleReportContents}
` : ""}${config.instructionBlocks?.length ? config.instructionBlocks.map((b) => `## ${b.heading}\n${b.content}\n`).join("\n") : ""}${!JSON_OUTPUT_AGENTS.has(config.type) ? `## OUTPUT SENTINEL
End your output file with the exact string \`<!-- HM-END -->\` as the very last line (after all content). This sentinel is checked mechanically to detect truncation.

` : ""}## MEMORY
${config.memoryContent}`;
}

const MAX_ROLE_REPORT_WORDS = 2000;

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "\n...(truncated)";
}

export function buildRoleReportContents(
  agentType: AgentType,
  rolesUsed: RoleName[],
  roleReportsDir: string,
): string | undefined {
  if (!fileExists(roleReportsDir)) return undefined;

  const relevantRoles = getRoleReportsForAgent(agentType, rolesUsed as AgentType[]);
  if (relevantRoles.length === 0) return undefined;

  const parts: string[] = [];
  for (const role of relevantRoles) {
    const reportPath = join(roleReportsDir, `${role}-report.md`);
    const content = readFileSafe(reportPath);
    if (content) {
      parts.push(`### ${role} report\n${truncateToWords(content, MAX_ROLE_REPORT_WORDS)}`);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
