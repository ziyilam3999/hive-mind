# Post-MVP Plan: Production Hardening & New Workflows

> After MVP (22 items, 6 phases), Hive Mind has a working pipeline: SPEC → PLAN → EXECUTE → REPORT
> with parallel execution, compliance checking, sub-task decomposition, and multi-repo support.
> This plan prioritizes what's needed to use Hive Mind on real projects reliably.

---

## Design Principle: When to Use Hive Mind vs Claude Code

Hive Mind's value is the **pipeline structure** — SPEC review, multi-agent planning, compliance
verification, and audit trail. This prevents rework by catching design issues before code is written
and verifying plan adherence after code is written.

**Use Hive Mind for:** New features, multi-file changes, cross-cutting concerns, anything that
benefits from a spec review and structured decomposition.

**Use Claude Code directly for:** Typo fixes, single-line changes, dependency bumps, config tweaks,
quick refactors. These don't benefit from spec/plan overhead — the rework risk is negligible.

The boundary is: **if the change is small enough that rework costs less than the pipeline overhead,
use Claude Code directly.**

---

## Decision: Quick Mode (FW-06) — Not Included

FW-06 proposed a `--quick` flag that skips SPEC and PLAN stages, going straight to BUILD.

**Why it's excluded:** Quick mode defeats Hive Mind's core purpose. The pipeline exists to prevent
rework through structured planning and verification. Skipping SPEC/PLAN removes the very mechanism
that distinguishes Hive Mind from "just run Claude Code." If a change is simple enough to skip
planning, it's simple enough to do directly in Claude Code without Hive Mind at all.

The `--fast-forward` variant (auto-approve checkpoints) has more merit for CI/CD integration but
is a separate concern from quick mode. Deferred to a future CI/CD integration phase.

---

## Decision: Bug-Fix Mode (ENH-14) — Included (Phase 1)

ENH-14 proposes a `hive-mind bug --report <path>` command with a diagnosis-first pipeline.

**Why it's included:** Bug fixing is a fundamentally different workflow from feature building, and
it benefits from Hive Mind's structured approach:

| Aspect | Feature Pipeline | Bug-Fix Pipeline |
|--------|-----------------|-----------------|
| Input | PRD (what to build) | Bug report (symptoms, repro steps, logs) |
| Planning | SPEC → multi-role → story decomposition | DIAGNOSE → root cause → single fix |
| Verification | AC/EC per story | Regression: repro steps no longer fail |
| Rework risk | High (wrong spec → wrong code) | Medium (wrong diagnosis → wrong fix) |
| Pipeline | SPEC → PLAN → EXECUTE → REPORT | DIAGNOSE → FIX → VERIFY → REPORT |

The key insight: bugs benefit from **diagnosis before action** (just like features benefit from
specs before code). The diagnostician agent searches the codebase for root cause, producing a
diagnosis report with code locations and recommended fix. The human reviews the diagnosis at a
checkpoint before the fixer acts. This prevents the common pattern of fixing symptoms instead of
root causes.

**When to use bug-fix mode vs Claude Code:** Use bug-fix mode when the bug is non-trivial (unclear
root cause, multiple possible locations, regression risk). Use Claude Code directly for obvious
bugs where you already know the fix.

---

## Phases

### Phase 1: Production Essentials (use Hive Mind on real projects)

| # | ID | Item | Effort | Rationale |
|---|---|------|--------|-----------|
| 1 | FW-03 | Project constitution | Small | Without it, every PRD must restate project conventions. One `constitution.md` auto-injected into all agents. First thing needed for real-project use. |
| 2 | FW-05 | Delta markers (brownfield) | Small | Real projects modify existing code. Agents must know "create new" vs "modify existing" vs "remove" per file. Without this, implementers guess wrong on brownfield changes. |
| 3 | ENH-14 | Bug-fix mode (`--bug`) | Medium | Different workflow for defects: DIAGNOSE → FIX → VERIFY → REPORT. Diagnosis-first prevents fixing symptoms. Reuses EXECUTE sub-pipeline. |

**Smoke test criteria:**
- Tier 1: Unit tests for constitution injection, delta markers, diagnose stage
- Tier 2: Integration test for bug-fix pipeline flow
- Tier 3: Dogfood — fix a real bug in Hive Mind itself using `hive-mind bug`

**Estimated cost:** ~$20-40 for Tier 3

---

### Phase 2: Reliability & Efficiency

| # | ID | Item | Effort | Rationale |
|---|---|------|--------|-----------|
| 4 | RD-07 | Mid-story checkpointing | Medium | Pipeline crash during VERIFY = restart from BUILD. Real projects have longer stories. Resume from last sub-stage saves tokens. |
| 5 | ENH-04 | Tooling dependency detection | Small | Implicit deps (`.ts` → TypeScript, `.py` → Python) undetected. Agents fail on missing tools. |
| 6 | ENH-05 | Output truncation monitoring | Small | Large SPECs/plans may silently truncate. Warn when agent output approaches token limit. |
| 7 | FW-04 | EARS-style AC formalization | Small | Structured WHEN/THEN ACs are more verifiable than free-form. Reduces parser false-FAILs. |

**Smoke test criteria:**
- Tier 1: Unit tests for checkpointing, detection, truncation warning, AC format
- Tier 2: Integration test for crash-resume flow
- Tier 3: Dogfood on a real project where Tier 3 crashed mid-story (if it happens)

---

### Phase 3: DX & Maintainability

| # | ID | Item | Effort | Rationale |
|---|---|------|--------|-----------|
| 8 | RD-09 | CLI help & discoverability | Small | `--help`, `--version`, `--dry-run` (cost estimate). Basic CLI hygiene. |
| 9 | RD-08 | KB deduplication | Small | Knowledge base accumulates duplicates over many runs. Fuzzy-match before graduation. |
| 10 | ENH-01 | DC feedback loop port | Small | Retrospective evaluates story outcomes but not stage effectiveness. Port KEEP/CHANGE/ADD/DROP from double-critique. |

---

### Deferred (revisit after production data)

| ID | Item | Why deferred |
|---|------|-------------|
| RD-06 | Provider abstraction | Large effort. Only needed if switching away from Claude CLI. Revisit when API-direct proves necessary. |
| FW-06 | Quick mode | Defeats pipeline purpose. Use Claude Code directly for small changes. |
| FW-07 | Spec self-update | Needs structured output (RD-04) proven in production first. |
| FW-11 | Docker sandbox | Only needed when test isolation proves necessary. |
| ENH-08 | `/hive` Claude Code skill | Nice-to-have integration. Not blocking production use. |
| ENH-09 | Session recovery / --resume | RD-07 (mid-story checkpoint) covers the critical sub-case. Full session resume needs crash data. |

---

## Bug-Fix Pipeline Design (ENH-14)

```
hive-mind bug --report bug-report.md [--skip-baseline]
        │
        ▼
  DIAGNOSE stage (replaces SPEC)
  - Diagnostician agent reads: bug report + codebase (Glob/Grep/Read)
  - Output: diagnosis-report.md (root cause, code locations, recommended fix)
  - Model: Opus (needs deep codebase reasoning)
        │
        ▼
  Human checkpoint: approve diagnosis
        │
        ▼
  FIX stage (replaces PLAN + EXECUTE)
  - Fixer agent reads: diagnosis-report + source files
  - Applies fix using Write/Edit tools
  - Output: fix-report.md (files changed, approach taken)
  - Model: Opus (needs to modify code correctly)
        │
        ▼
  VERIFY stage (reused from standard pipeline)
  - Tester runs: repro steps from bug report (should now PASS)
  - Tester runs: existing test suite (no regressions)
  - Evaluator runs: bug-specific verification criteria
  - Fix loop: diagnostician → fixer → verify (max 3 attempts)
        │
        ▼
  COMMIT + REPORT (reused)
  - Commit with `fix:` prefix
  - Report summarizes: diagnosis, fix, verification results
```

**Bug report format:**
```markdown
# Bug Report

## Symptoms
What's happening wrong?

## Expected Behavior
What should happen instead?

## Reproduction Steps
1. Step to reproduce...

## Logs / Error Output
(paste relevant logs)

## Affected Files (optional)
If you know where the bug is, list files. Otherwise, diagnostician searches.
```

**Escalation:** If diagnostician determines the bug is systemic (touches 3+ subsystems,
requires architectural change), it recommends escalating to full pipeline mode with a
generated PRD. Human decides at checkpoint.

---

## Dependency Graph

```
Phase 1: FW-03 ──► FW-05 ──► ENH-14
         (no deps)  (no deps)  (reuses EXECUTE sub-pipeline)

Phase 2: RD-07 ──► ENH-04 ──► ENH-05 ──► FW-04
         (no deps)  (no deps)  (no deps)  (no deps)
         (all independent — can parallelize within phase)

Phase 3: RD-09 ──► RD-08 ──► ENH-01
         (no deps)  (no deps)  (no deps)
```

---

## Files to Modify (Phase 1)

### FW-03: Project Constitution
| File | Change |
|------|--------|
| `src/config/loader.ts` | Read `.hive-mind/constitution.md` if exists |
| `src/stages/spec-stage.ts` | Inject constitution into researcher, spec-drafter, critic prompts |
| `src/stages/plan-stage.ts` | Inject constitution into planner, AC/EC generators |
| `src/agents/prompts.ts` | Add `constitutionContent?: string` to prompt builder |

### FW-05: Delta Markers
| File | Change |
|------|--------|
| `src/types/execution-plan.ts` | Add `changeType: "ADDED" \| "MODIFIED" \| "REMOVED"` to source file entries |
| `src/stages/plan-stage.ts` | Update planner prompt to classify each file |
| `src/agents/prompts.ts` | Update implementer prompt to use change type for strategy selection |

### ENH-14: Bug-Fix Mode
| File | Change |
|------|--------|
| `src/index.ts` | Add `bug` command with `--report` flag |
| `src/orchestrator.ts` | Add `runBugFixPipeline()` entry point |
| NEW `src/stages/diagnose-stage.ts` | Diagnostician agent spawn + report parsing |
| `src/agents/prompts.ts` | Add diagnostician job description + rules |
| `src/types/agents.ts` | Add `"diagnostician-bug"` to AgentType (distinct from verify diagnostician) |
| `src/agents/tool-permissions.ts` | `"diagnostician-bug": DEV_TOOLS` (needs full codebase access) |
| `src/agents/model-map.ts` | `"diagnostician-bug": "opus"` |
| `src/types/checkpoint.ts` | Add `"approve-diagnosis"` checkpoint type |
