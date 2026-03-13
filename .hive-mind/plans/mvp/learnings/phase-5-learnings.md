# Phase 5: Execution Power — Learnings

**Completed:** 2026-03-13 | **Items:** ENH-03 (Parallel Execution), ENH-17 (Compliance Reviewer), ENH-18 (Compliance Fixer) | **FW-01:** Deferred

---

## Design Decisions & Rationale

### ENH-03: Wave-based parallel execution
Stories are grouped into waves based on dependency readiness and file overlap. `getReadyStories()` finds stories with all dependencies resolved, then `filterNonOverlapping()` removes stories that share sourceFiles (prevents concurrent writes to same file). Each wave runs with `runWithConcurrency()` capped at `maxConcurrency` (default 3).

**Key insight:** File overlap filtering is essential — without it, two stories writing to the same file would produce race conditions. The wave executor serializes COMMIT across all stories in a wave (git operations are not parallelizable).

### ENH-17/18: Compliance reviewer + fixer as separate stage
Created `execute-compliance.ts` as a dedicated stage between BUILD and VERIFY, rather than embedding compliance in execute-verify. This keeps verify focused on functional correctness (ACs/ECs) and compliance focused on plan adherence (step file instructions).

**Tradeoff:** Extra stage adds latency (one more agent spawn per story). But compliance gaps would otherwise only be caught by manual review post-pipeline, which is more expensive.

### ENH-17: OUTPUT_TOOLS not READ_ONLY for reviewer
Initial plan specified READ_ONLY tools for compliance-reviewer. Knowledge base review (P42/F43) caught that the reviewer must Write its output report file. OUTPUT_TOOLS (Read, Write, Glob, Grep) is the correct permission set — enough to produce output but not execute arbitrary commands.

### ENH-18: Dedicated compliance-fixer vs reusing existing fixer
The existing fixer is optimized for functional failures (test says FAIL, read error, patch code). Compliance gaps are structural omissions (missing doc comment, missing test). Mixing both concerns would degrade prompt quality. Dedicated agent with DEV_TOOLS (full) can create files, edit code, and run checks to implement missing instructions.

### ENH-18: F39 skip optimization
If compliance-fixer reports `itemsFixed: 0`, skip re-running the reviewer. The fixer couldn't implement anything, so re-review would produce the same FAIL. This saves one agent spawn per stuck compliance loop.

---

## Bugs Found During Tier 3 Dogfood

### K6: Cost data always $0 — CLI JSON array format mismatch
**Symptom:** CostTracker warned "Missing cost data" for every agent, all costs defaulted to $0.
**Root cause:** `spawnClaude()` in `shell.ts` did `JSON.parse(stdout)` expecting a single object, but the claude CLI `--output-format json` returns a JSON **array** of event objects. The result element (with cost) is the last element with `type: "result"`, and the cost field is `total_cost_usd`, not `cost_usd`.
**Fix:** Extract `type: "result"` element from array, check `total_cost_usd` first with `cost_usd` fallback.
**Pattern:** Always test against real CLI output, not assumed format. The CLI format can change between versions.

### K7: Redundant report archives on first-attempt pass
**Symptom:** Stories that passed on first attempt had both `test-report.md` and `test-report-1.md` (identical files). Same for eval-report.
**Root cause:** Archive `copyFileSync` in execute-verify ran unconditionally on every attempt.
**Fix:** Only archive when `attempt > 1`. First-pass stories keep just the main report file.
**Pattern:** Per-attempt archiving only adds value when there are multiple attempts.

---

## Dogfood Results Summary

**PRD:** string-utils (4 stories: types, convert, truncate, analyze)
**Waves:** 2 — Wave 1 (US-01, US-03, US-04 parallel), Wave 2 (US-02 after US-01)
**Outcome:** 4/4 COMPLETED + COMMITTED

| Story | Compliance | Verify Attempts | Notes |
|-------|-----------|----------------|-------|
| US-01 | PASS (5 done) | 2 (FAIL→PASS) | AC regex issue, fixed by fixer |
| US-02 | FAIL→FIX→PASS (29 done) | 1 | Compliance fixer fixed 1 item, re-review passed |
| US-03 | PASS (10 done) | 1 | Clean pass |
| US-04 | PASS (14 done, 1 uncertain) | 2 (FAIL→PASS) | Similar to US-01 |

**Key validation:** ENH-03 wave executor, ENH-17 compliance check, ENH-18 compliance fix loop all exercised in production.

---

## Patterns to Graduate

- **P46: CLI output format testing** — Always verify agent spawner output parsing against actual CLI output, not assumed format. CLI tools return different structures across versions (array vs object, different field names).
- **P47: Compliance as separate stage** — Plan-adherence checking belongs between BUILD and VERIFY as an independent stage. Functional verification (ACs/ECs) and structural verification (did agent follow all instructions?) are orthogonal concerns.

## Anti-Patterns Discovered

- **F47: Assumed JSON shape** — Parsing external tool output by assuming a flat JSON object without testing against real output. The claude CLI returns an array of event objects, not a single result object.
- **F48: Unconditional per-attempt archiving** — Archiving every attempt's output is only valuable when retries occur. On first-pass success, archives are identical copies that waste disk and clutter report directories.
