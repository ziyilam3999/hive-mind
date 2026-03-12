# Hive Mind — Consolidated Roadmap & Backlog

> **ELI5: What is this file?**
> This is the single source of truth for everything Hive Mind plans to build. It merges two previous documents — the Enhancement Backlog (feature ideas) and the Production Reliability Roadmap (infrastructure fixes) — into one prioritized list. Items are ordered by urgency: P0 items must land before Hive Mind is production-usable, P1 items build production confidence, P2 items add polish, and everything beyond is future vision.

**MVP Plan:** 19 items across 6 phases selected for production readiness. See `.hive-mind/plans/mvp-plan.md` for full design and dependency graph. Items marked "MVP Phase N" in the table below are included.

**Dogfooding Strategy:** Phases 1-2 are developed manually (they fix the infrastructure that makes dogfooding risky). Phase 3 includes a calibration trial (ENH-13). Phases 4-5 use the pipeline to build itself, with one PRD per item. See `mvp-plan.md § Dogfooding Strategy` for details and the self-referential safety rule.

**Principle:** Never ship a feature without evidence it works. Each version produces learnings. Those learnings justify the next version's features.

**ID Scheme:**
- **RD-xx** — Production reliability items (from roadmap analysis)
- **ENH-xx** — Pipeline enhancement items (from backlog)
- **PRD-xx** — Long-term vision items (from original PRD)
- **FW-xx** — Framework-inspired items (from comparison with Superpowers, GSD, OpenSpec, Spec-Kit, Kiro, Warp Oz)

---

## Quick Reference

| ID | Name | Priority | Target | Blocked By | Status | Dogfood |
|----|------|----------|--------|------------|--------|---------|
| RD-01 | Exponential backoff + retry | P0 | v3.1 | — | MVP Phase 2 | Manual |
| RD-02 | Graceful error recovery | P0 | v3.1 | — | MVP Phase 2 | Manual |
| RD-03 | Config file support | P0 | v3.1 | — | MVP Phase 1 | Manual |
| RD-04 | Structured output parsing | P0 | v3.1 | — | MVP Phase 2 | Manual |
| RD-05 | Cost/token tracking | P1 | v3.1 | — | MVP Phase 3 | Manual |
| ENH-02 | Dependency-aware story scheduling | P1 | v3.1 | E2E pass | MVP Phase 3 | Manual |
| ENH-03 | Parallel story execution | P1 | v3.1 | ENH-02 | MVP Phase 5 | Required |
| RD-06 | Provider abstraction | P1 | v3.1 | — | Not started | — |
| RD-07 | Mid-story checkpointing | P1 | v3.1 | — | Not started | — |
| FW-01 | Sub-task decomposition for complex stories | P1 | v3.1 | ENH-02 | MVP Phase 5 | Required |
| FW-02 | Clean baseline verification before execution | P1 | v3.1 | — | MVP Phase 3 | Manual |
| FW-03 | Project constitution / principles document | P1 | v3.1 | RD-03 | Not started | — |
| ENH-01 | DC feedback loop port | P2 | v3.1 | E2E Bugs 5+6 | Not started | — |
| ENH-04 | Tooling dependency detection | P2 | v3.1 | E2E pass | Not started | — |
| ENH-05 | Output truncation monitoring | P2 | v3.1 | E2E pass | Not started | — |
| RD-08 | KB deduplication | P2 | v3.1 | — | Not started | — |
| RD-09 | CLI help & discoverability | P2 | v3.1 | — | Not started | — |
| RD-10 | Plan stage parallelism | P2 | v3.1 | — | Not started | — |
| RD-11 | Test coverage for critical paths | P2 | v3.1 | — | Not started | — |
| FW-04 | EARS-style acceptance criteria formalization | P2 | v3.1 | — | Not started | — |
| FW-05 | Delta markers for brownfield iteration | P2 | v3.1 | — | Not started | — |
| FW-06 | Quick mode / fast-forward for small changes | P2 | v3.1 | RD-09 | Not started | — |
| ENH-13 | Checkpoint sound notification | P2 | v3.1 | — | MVP Phase 3 | Trial |
| ENH-14 | Bug-fix mode (`--bug`) | P2 | v3.2 | FW-06 | Not started | — |
| ENH-15 | AI-first manifest file (live) | P1 | v3.1 | — | MVP Phase 3 | Manual |
| ENH-16 | Role-report feedback loop | P1 | v3.1 | — | MVP Phase 4 | Eligible |
| FW-07 | Spec self-update during implementation | P2 | v3.2 | RD-04 | Not started | — |
| FW-11 | Docker-sandboxed agent execution | P2 | v3.2 | PRD-07 | Not started | — |
| FW-15 | Agent profiles / permission scoping | P2 | v3.2 | RD-03 | Not started | — |
| FW-16 | AI-first reports / code anchors | P2 | v3.2 | RD-04 | Not started | — |
| ENH-06 | Cross-story pattern mining | P3 | v3.2 | Retrospective data | Not started | — |
| ENH-07 | Synthesizer split | P1 | v3.1 | — | MVP Phase 4 | Eligible |
| ENH-08 | `/hive` Claude Code skill | P3 | v3.3 | v3.0 CLI stable | Not started | — |
| ENH-09 | Session recovery / --resume | P3 | v3.4 | Crash data | Not started | — |
| ENH-10 | Reverify with updated ACs | P3 | v3.4 | ENH-09 | Not started | — |
| ENH-11 | Multi-repo module config + CWD threading | P1 | v3.1 | ENH-03 | MVP Phase 6 | Eligible |
| ENH-12 | Adaptive role weighting | P3 | v3.6 | Multi-chain data | Not started | — |
| FW-08 | Context hygiene / filtered memory per story | P3 | v3.3 | ENH-03 | Not started | — |
| FW-09 | Design-first workflow variant | P3 | v3.4 | RD-09 | Not started | — |
| FW-10 | Agent hooks for automated side-effects | P3 | v3.4 | RD-03 | Not started | — |
| FW-12 | Event-driven pipeline triggers | P3 | v3.4 | RD-03 | Not started | — |
| FW-13 | Visual verification / Computer Use for UI stories | P3 | v3.5 | FW-11 | Not started | — |
| FW-14 | Integration verification stage | P1 | v3.1 | ENH-11 | MVP Phase 6 | Eligible |
| PRD-01 | Stress tier system (Low–Critical) | P3 | v1.1 | MVP baseline | Not started | — |
| PRD-02 | System Flood (full reset) | P3 | v1.1 | PRD-01 | Not started | — |
| PRD-03 | LLM-as-Judge verify phase | P3 | v1.1 | MVP verify data | Not started | — |
| PRD-04 | Anti-phantom SHIP gate | P3 | v1.1 | PRD-03 | Not started | — |
| PRD-05 | code-reviewer agent | P1 | v3.1 | — | MVP Phase 4 | Eligible |
| PRD-06 | log-summarizer agent | P1 | v3.1 | — | MVP Phase 4 | Eligible |
| PRD-07 | Docker sandbox for tests | P3 | v1.2 | Isolation need proven | Not started | — |
| PRD-08 | Auto-spec gen (AST extraction) | P3 | v1.2 | Hand-written specs baseline | Not started | — |
| PRD-09 | Scenario suite extraction (agent) | P3 | v1.2 | Hand-written scenarios baseline | Not started | — |
| PRD-10 | Evidence registry | P3 | v1.2 | Execution data accumulated | Not started | — |
| PRD-11 | Full QCS 0-5 with auto-calc | P3 | v1.2 | v1.1 3-level data | Not started | — |
| PRD-12 | Dynamic agent creation | P3 | v1.2 | Agent type data | Not started | — |
| PRD-13 | Parallel evolution / evolutionary selector | P3 | v1.3 | Failure rate data | Not started | — |
| PRD-14 | Noah's Ark archive (prompt DNA) | P3 | v1.3 | PRD-02 | Not started | — |
| PRD-15 | Neural feedback loop (win/loss) | P3 | v1.3 | Execution patterns | Not started | — |
| PRD-16 | Auto-spec gen phase 2 (runtime) | P3 | v1.3 | PRD-08 | Not started | — |
| PRD-17 | Scenario extraction phase 2 (runtime) | P3 | v1.3 | PRD-09 | Not started | — |
| PRD-18 | VS Code adapter | P3 | v1.3 | CLI stable | Not started | — |
| PRD-19 | Slack adapter | P3 | v1.3 | CLI stable | Not started | — |
| PRD-20 | KB graduation full automation | P3 | TBD | Manual graduation proven | Not started | — |

---

## P0 — Critical (Must Fix to Be Usable in Production)

> **ELI5:** These are the seatbelts and airbags. The car runs, but you wouldn't drive it on the highway without these safety features. Each one prevents a different class of silent failure.

### RD-01: Exponential Backoff + Retry

**Priority:** P0 | **Effort:** Small | **File:** `src/agents/spawner.ts:47-57`

**Problem:** `spawnAgentWithRetry()` has only 1 retry with no delay between attempts. Transient failures (network timeouts, rate limits, API blips) get no backoff. No jitter means parallel retries all fire simultaneously.

**Current:**
```typescript
export async function spawnAgentWithRetry(
  config: AgentConfig,
  maxRetries: number = 1,  // Only 1 retry — 2 attempts total
): Promise<AgentResult> {
  let lastResult: AgentResult | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await spawnAgent(config);
    if (lastResult.success) return lastResult;
    // No delay between retries. No backoff. No jitter.
  }
  return lastResult!;
}
```

**Fix:**
- Default `maxRetries` to 3 (4 attempts total)
- Add exponential backoff: 1s, 2s, 4s, 8s between retries
- Add ±20% jitter to prevent thundering herd
- Make all values configurable via config file (see RD-03)

---

### RD-02: Graceful Error Recovery

**Priority:** P0 | **Effort:** Medium | **Files:** `src/orchestrator.ts:200-266`, `src/index.ts`, `src/types/execution-plan.ts`
**Absorbs:** ENH-09 (session recovery) partially — the `--from` and `--skip-failed` flags

**Problem:**
1. Error details only go to `console.error` — not persisted in execution plan
2. No way to resume from a specific story (`hive-mind resume --from US-03`)
3. No option to skip failed stories (`--skip-failed`)
4. `process.exit(1)` in 5+ places — no graceful shutdown

**Fix:**
- Add `errorMessage` and `lastFailedStage` fields to story type in `src/types/execution-plan.ts`
- Persist error details on catch, not just status change
- Add `--from <story-id>` and `--skip-failed` CLI flags in `src/index.ts`
- Replace `process.exit(1)` with thrown errors caught at top level

---

### RD-03: Config File Support

**Priority:** P0 | **Effort:** Medium | **Files:** New `src/config/loader.ts` + ~8 files with hardcoded constants

**Problem:** 12+ constants hardcoded across the codebase:

| Constant | File | Value |
|---|---|---|
| Agent timeout | `spawner.ts` | `600_000` (10 min) |
| Shell timeout | `shell.ts` | `120_000` (2 min) |
| Tool detect timeout | `detect.ts` | `30_000` |
| Max retries | `spawner.ts` | `1` |
| Memory word cap | `memory-manager.ts` | `400` |
| Graduation threshold | `memory-manager.ts` | `300` |
| KB size warning | `report-stage.ts` | `5000` words |
| Model assignments | `model-map.ts` | Static map (20 agents) |

**Fix:** Create `src/config/loader.ts` that reads `.hivemindrc.json` from project root. All hardcoded values become defaults overridable by config.

---

### RD-04: Structured Output Parsing

**Priority:** P0 | **Effort:** Medium | **Files:** `src/reports/parser.ts`, `src/agents/prompts.ts`

**Problem:** A 5-level regex cascade tries increasingly desperate patterns to extract PASS/FAIL from agent output. A report saying "this did NOT PASS" would match Level 4 as PASS.

**Fix:**
- Add JSON status block requirement to agent prompts: `<!-- STATUS: {"result": "PASS", "details": "..."} -->`
- Parse JSON block first (Level 0). Fall back to existing regex cascade only if JSON missing.
- Log a warning when falling back to regex.

---

## P1 — High Priority (Needed for Production Confidence)

> **ELI5:** P0 keeps the car from crashing. P1 adds the dashboard gauges (cost tracking), GPS (dependency scheduling), cruise control (parallelism), and a spare tire (checkpointing). You can drive without them, but you wouldn't want to drive far.

### RD-05: Cost/Token Tracking

**Priority:** P1 | **Effort:** Medium | **Files:** `src/agents/spawner.ts`, new `src/utils/cost-tracker.ts`

**Problem:** Zero token tracking. A Hive Mind run spawns 25-35+ agent calls per story with no visibility into cost.

**Fix:**
- Parse Claude CLI output for token usage (via `--output-format json`)
- Add `tokensUsed` field to `AgentResult` interface
- Log tokens to `manager-log.jsonl` with each agent invocation
- Display cumulative cost at end of each stage
- Add `--budget <dollars>` and `--dry-run` CLI flags

**Note:** Neither Superpowers nor GSD tracks costs — this would be a unique differentiator.

---

### ENH-02: Dependency-Aware Story Scheduling

**Priority:** P1 | **Effort:** Medium | **Blocked by:** E2E pass
**File:** `src/execution-plan.ts:113-115`
**Source:** e2e-bug-fix-plan.md, SPEC-v1.0.md:1207

> **ELI5:** You can't put on your shoes before your socks. Right now the pipeline grabs whatever story is next by array position — it doesn't check if prerequisites finished first.

**Problem:** `getNextStory()` returns first not-started story by array position, ignoring `dependencies` field.

**Fix:** Skip stories whose dependencies haven't all reached `passed`. The `dependencies` array already exists in `execution-plan.json` schema.

---

### ENH-03: Parallel Story Execution

**Priority:** P1 | **Effort:** Large | **Blocked by:** ENH-02
**File:** `src/orchestrator.ts:193-269`
**Source:** PRD-v3.md:179, SPEC-v1.0.md:195
**Merged with:** Roadmap item 3.2 (wave-based parallelism)

> **ELI5:** If the salad has nothing to do with the pasta, you don't wait for the salad to finish before boiling water.

**Problem:** Sequential execution only. Stories with no mutual dependencies could run in parallel.

**Blockers to parallelism:**
1. Shared `memory.md` — `appendToMemory()` reads entire file, modifies, writes. No locking.
2. Shared `execution-plan.json` — concurrent reads/writes would corrupt JSON.
3. Unused `dependencies` field — exists in schema but never read or validated.

**Fix:**
- Use `dependencies` field to build dependency graph
- Group stories into waves (topological sort)
- Execute each wave with `Promise.all()`
- Add file-level mutex for `memory.md` writes
- Use atomic read-modify-write for execution plan updates

---

### RD-06: Provider Abstraction

**Priority:** P1 | **Effort:** Large | **File:** `src/agents/spawner.ts:15-18`

**Problem:** Hardcoded to Claude CLI (`claude --print`). No way to use Anthropic API directly, OpenAI models, or local models.

**Fix:**
```typescript
interface IAgentProvider {
  spawn(config: AgentConfig): Promise<AgentResult>;
  isAvailable(): Promise<boolean>;
}
```
Ship two implementations: `ClaudeCLIProvider` (current behavior) and `AnthropicAPIProvider` (direct API). Config file selects provider.

---

### RD-07: Mid-Story Checkpointing

**Priority:** P1 | **Effort:** Medium | **File:** `src/stages/execute-verify.ts:42-147`
**Absorbs:** ENH-09 (session recovery) partially — the sub-stage resume capability

**Problem:** Stories are all-or-nothing. If the pipeline crashes during VERIFY sub-stage, the entire story must restart from BUILD.

**Fix:**
- Add `currentAttempt`, `lastCompletedSubStage` fields to story type
- Persist after each sub-stage (BUILD, VERIFY, REFACTOR, COMMIT)
- On resume, skip completed sub-stages within a story

---

### FW-01: Sub-Task Decomposition for Complex Stories

**Priority:** P1 | **Effort:** Large | **Blocked by:** ENH-02
**Files:** `src/types/execution-plan.ts`, `src/stages/plan-stage.ts`, `src/stages/execute-build.ts`, `src/stages/execute-verify.ts`, `src/state/execution-plan.ts`
**Inspired by:** Kiro (tasks), Spec-Kit (steps), GSD (sub-tasks), Superpowers (TDD cycles)

> **ELI5:** Instead of handing a chef the entire banquet menu and saying "cook everything," you give them one dish at a time with its own recipe card and taste test.

**Problem:** The `Story` type has no `subTasks` field. The implementer agent receives the entire story as one atomic unit — all ACs, all source files, all at once. For complex stories touching 5+ files, this leads to incomplete implementations and wasted verify cycles.

**Fix:**
- Add optional `SubTask[]` to the `Story` type in `src/types/execution-plan.ts`
- Synthesizer generates sub-tasks for stories marked `complexity: "high"` — each sub-task has a subset of ACs and target files
- Execute sub-tasks sequentially: BUILD sub-task → VERIFY sub-task ACs → next sub-task
- Sub-task failures only retry the failed sub-task, not the entire story

---

### FW-02: Clean Baseline Verification Before Execution

**Priority:** P1 | **Effort:** Small–Medium
**Files:** `src/orchestrator.ts`, new `src/stages/baseline-check.ts`
**Inspired by:** Superpowers (mandatory green-before-start)

> **ELI5:** Before adding a new floor to the building, check that the foundation isn't already cracked. If existing tests fail before you even start, you'll waste every retry attempt chasing ghosts.

**Problem:** The EXECUTE stage assumes the codebase compiles and existing tests pass. If they don't, the implementer's changes get blamed for pre-existing failures, burning through all retry attempts.

**Fix:**
- New `baseline-check` stage runs before first story: `npm run build` + `npm test` (or configured equivalents)
- If baseline fails: halt with clear message ("Fix existing failures before running Hive Mind")
- Store baseline result in execution plan for audit trail
- Skip on `--skip-baseline` flag for known-broken codebases

---

### FW-03: Project Constitution / Principles Document

**Priority:** P1 | **Effort:** Small–Medium | **Blocked by:** RD-03 (config file support)
**Files:** `src/stages/spec-stage.ts`, `src/stages/plan-stage.ts`, `src/agents/prompts.ts`
**Inspired by:** Spec-Kit (constitution.md)

> **ELI5:** Instead of telling every new contractor "we only use metric, never use nails in drywall, and the client hates blue" — you post the house rules on the wall once, and every contractor reads them on day one.

**Problem:** Project-wide constraints (e.g., "always use the ORM, never raw SQL", "all APIs must be RESTful", "use Tailwind not inline styles") must be restated in every PRD. If omitted, agents make inconsistent choices.

**Fix:**
- Read `.hive-mind/constitution.md` if it exists (via config loader from RD-03)
- Inject constitution into researcher, spec-drafter, synthesizer, and critic prompts as a `## Project Principles` section
- Constitution is advisory (agents can note conflicts) not blocking

---

### ENH-15: AI-First Manifest File (Live)

**Priority:** P1 | **Effort:** Small–Medium | **Files:** New `src/manifest/generator.ts`, `src/orchestrator.ts`, `src/index.ts`

> **ELI5:** When a new worker shows up at the job site, instead of wandering around opening every door to figure out where things are, they get a site map at the front gate. The map auto-updates every time a room is finished.

**Problem:** AI agents waste tokens exploring ~10 files every session to orient themselves. No single-file entry point exists for navigating the codebase and `.hive-mind/` artifacts.

**Fix:**
- `.hive-mind/MANIFEST.md` with two parts: static sections (architecture, source map, navigation hints — manually maintained, ~500 tokens) and a dynamic artifact inventory (auto-generated)
- `updateManifest()` called at pipeline stage boundaries (after SPEC, PLAN, EXECUTE, REPORT) — scans `.hive-mind/` and regenerates inventory
- `hive-mind manifest` CLI command for manual refresh outside pipeline runs
- Parent `CLAUDE.md` updated with pointer so agents discover it on session start

**Plan:** `.hive-mind/plans/manifest-plan.md`

---

## P2 — Medium Priority (Polish & Competitive Edge)

> **ELI5:** These are the heated seats, backup camera, and Bluetooth. The car is fully functional without them, but they make the daily experience noticeably better.

### ENH-01: Port Double-Critique Feedback Loop

**Priority:** P2 | **Effort:** Small | **Blocked by:** E2E Bugs 5+6
**Source:** `/double-critique` skill stages 10-12

> **ELI5:** A "shift supervisor" who reviews each worker's contribution after every run, tracks performance over weeks, and writes up what's working and what's not.

**Problem:** v3 retrospective evaluates story outcomes but not stage effectiveness.

**What to port:**
| DC Concept | v3 Adaptation | File |
|------------|---------------|------|
| Extractor (per-stage effectiveness) | Extend retrospective to analyze `manager-log.jsonl` | `agents/prompts.ts` |
| Effectiveness (cross-run trends) | New `effectiveness-{date}.md` output | `report-stage.ts` |
| KEEP/CHANGE/ADD/DROP framework | Structure retrospective prompt | `agents/prompts.ts` |

**Scope:** Modify `report-stage.ts`, `agents/prompts.ts`. No new files.

---

### ENH-04: Tooling Dependency Detection

**Priority:** P2 | **Effort:** Small | **Blocked by:** E2E pass
**Source:** e2e-bug-fix-plan.md:220-231

> **ELI5:** A recipe says "bake at 350°" but doesn't mention you need an oven. This fix teaches the pipeline to detect implicit tool requirements.

**Problem:** `parseRequiredTooling()` only finds explicit tables. Implicit deps (`.ts` files → TypeScript) undetected.

**Fix:** (1) Spec-drafter prompt adds Required Tooling table, (2) mechanical validation if table missing, (3) fallback detection for common implicit deps.

**Scope:** Modify `detect.ts`, `agents/prompts.ts`.

---

### ENH-05: Output Truncation Monitoring

**Priority:** P2 | **Effort:** Small | **Blocked by:** E2E pass
**Source:** e2e-bug-fix-plan.md:235-248

> **ELI5:** A "tape check" that warns you when agent output might have been cut short.

**Problem:** `claude --print` output bounded by model max tokens. Large SPECs or plans could silently truncate.

**Scope:** Modify `spawner.ts`.

---

### ENH-16: Role-Report Feedback Loop

**Priority:** P1 | **Effort:** Medium | **Blocked by:** — | **MVP Phase 4**
**Source:** `.hive-mind/design/role-report-feedback-loop.md`
**Detailed plan:** `.hive-mind/plans/role-report-feedback-loop-plan.md`

> **ELI5:** Five specialists write reports during planning, but the workers who build and test never read them. This wires each report to the agents that would benefit from it.

**Problem:** Role-reports (analyst, architect, reviewer, security, tester) are generated during the plan stage but never consumed by execution-phase agents. Each agent re-derives insights from scratch or misses them entirely. Step files already cherry-pick some findings (D1, M2) but the selection is ad-hoc.

**Two sub-features:**

| Part | What | Affected Files |
|------|------|----------------|
| **A: Planning enrichment** | After role-reports generate, feed findings back into step files (architect D-notes, reviewer M-notes, security HIGH risks), acceptance-criteria (analyst/tester gap cases), and execution-plan (complexity justification, security risk level) | Plan-stage prompts, plan assembly logic |
| **B: Execution context** | During execution, selectively inject role-reports as agent context: implementer gets architect+security+analyst; tester gets tester-role+analyst+security; refactor gets architect+reviewer; etc. | Agent prompt construction, role-to-agent mapping |

**Scope:** Modify plan-stage orchestration (Part A) and exec-stage agent spawning (Part B). No changes to role-report generation or spec/critique processes.

---

### RD-08: Knowledge Base Deduplication

**Priority:** P2 | **Effort:** Small | **File:** `src/memory/graduation.ts`

**Problem:** Entries graduate from `memory.md` to `knowledge-base/` without checking if a similar pattern already exists. Over many runs, the KB accumulates duplicates.

**Fix:** Before graduating, fuzzy-match the first sentence against existing KB entries. Merge or skip duplicates.

---

### RD-09: CLI Help & Discoverability

**Priority:** P2 | **Effort:** Small | **File:** `src/index.ts`

**Problem:** No `--help` flag, no `--version`, no usage documentation accessible from the CLI.

**Fix:** Add `--help` with usage docs, `--version` flag, `--dry-run` to estimate costs.

---

### RD-10: Plan Stage Parallelism

**Priority:** P2 | **Effort:** Small | **File:** `src/stages/plan-stage.ts:103-122`

**Problem:** Role agents (analyst, architect, security, tester-role, reviewer) spawn sequentially in a for-loop, even though they are fully independent.

**Fix:** Replace the sequential for-loop with `Promise.all()`.

---

### RD-11: Test Coverage for Critical Paths

**Priority:** P2 | **Effort:** Medium | **File:** `src/agents/spawner.ts` (0 tests currently)

**Problem:** The agent spawner — the most critical component — has zero test coverage.

**Fix:** Unit tests for retry logic, integration tests with mock Claude CLI, e2e test with sample PRD.

---

### FW-04: EARS-Style Acceptance Criteria Formalization

**Priority:** P2 | **Effort:** Small
**Files:** `src/stages/plan-stage.ts`, `src/agents/prompts.ts`
**Inspired by:** Kiro (EARS-style requirements → acceptance criteria)

> **ELI5:** Instead of "make sure login works," you write "WHEN the user submits valid credentials, THEN they see the dashboard within 2 seconds." Precise enough that a machine can verify it.

**Problem:** ACs are free-form bash commands with no consistent structure. Some are testable (`npm test -- --grep "login"`), others are vague ("verify the component renders correctly"). The verifier agent must guess intent.

**Fix:**
- Update synthesizer prompt to require WHEN/THEN format for all ACs
- Each AC must include: trigger condition (WHEN), expected outcome (THEN), and verification command
- Validate AC format mechanically before EXECUTE stage — reject stories with malformed ACs

---

### FW-05: Delta Markers for Brownfield Iteration

**Priority:** P2 | **Effort:** Small
**Files:** `src/stages/plan-stage.ts`, `src/agents/prompts.ts`
**Inspired by:** OpenSpec (ADDED/MODIFIED/REMOVED markers per step)

> **ELI5:** A renovation blueprint marks walls as "keep," "knock down," or "build new." Right now, the blueprint just lists every wall without saying what to do with it.

**Problem:** Step source files in the execution plan don't distinguish between new files to create, existing files to modify, and files to remove. The implementer must infer intent from context, leading to errors like creating a file that should have been modified.

**Fix:**
- Add `changeType: "ADDED" | "MODIFIED" | "REMOVED"` to source file entries in the step schema
- Update synthesizer prompt to classify each file
- Implementer prompt uses change type to select strategy (create vs. edit vs. delete)

---

### FW-06: Quick Mode / Fast-Forward for Small Changes

**Priority:** P2 | **Effort:** Medium | **Blocked by:** RD-09 (CLI discoverability)
**Files:** `src/index.ts`, `src/orchestrator.ts`
**Inspired by:** OpenSpec (quick-start), GSD (single-task focus)

> **ELI5:** You don't need a full building inspection to hang a picture frame. Quick mode skips the architect and just hands the task to the builder.

**Problem:** The full 4-stage pipeline (SPEC → PLAN → EXECUTE → REPORT) with 4 human approval checkpoints runs even for trivial changes like typo fixes, dependency bumps, or single-file refactors.

**Fix:**
- `--quick` flag: skips SPEC and PLAN stages entirely. User provides a one-line description, implementer builds it directly, VERIFY runs ACs, REPORT summarizes.
- `--fast-forward` flag: runs full pipeline but auto-approves all checkpoints (no human pauses). Useful for CI/CD integration.
- Both flags logged in execution plan for audit trail.

---

### ENH-13: Checkpoint Sound Notification

**Priority:** P2 | **Effort:** Small | **Files:** `src/orchestrator.ts`, new `src/utils/notify.ts`

> **ELI5:** The oven timer goes off when your food is done. Right now, Hive Mind finishes cooking and just sits there quietly — you have to keep checking.

**Problem:** When the pipeline reaches a checkpoint, it writes the checkpoint file and exits with a console message. If the human is away from the terminal (likely during 10+ minute stages), they don't know it's time to review.

**Fix:**
- New `notifyCheckpoint()` utility that writes the ASCII BEL character (`\x07`) to stdout
- Call at all 4 checkpoint exit points in `src/orchestrator.ts` (lines 65, 119, 136, 150)
- Works cross-platform including SSH sessions (bell is forwarded by terminal)
- Optional `--silent` flag to suppress for CI/scripted environments
- Future enhancement: `node-notifier` integration behind a `--notify` flag for OS-native notifications

**Review:** `.hive-mind/reviews/sound-notification-feature-review.md`

---

### ENH-14: Bug-Fix Mode (`--bug`)

**Priority:** P2 | **Effort:** Medium | **Blocked by:** FW-06 (quick mode infrastructure)
**Files:** `src/index.ts`, `src/orchestrator.ts`, new `src/stages/diagnose-stage.ts`, `src/agents/prompts.ts`

> **ELI5:** When a pipe bursts, you don't call the architect to redesign the house — you call a plumber who diagnoses the leak, fixes it, and checks that water flows again. Bug-fix mode sends the plumber, not the architect.

**Problem:** Hive Mind only accepts a PRD as input and runs the full 4-stage pipeline. Bug reports describe symptoms and expected behavior, not product requirements. Running researcher → justifier → spec-drafter → 2 critic rounds to fix a null pointer exception wastes time and tokens. Developers default to fixing bugs outside Hive Mind, missing the audit trail and verify loop benefits.

**How it differs from FW-06 (quick mode):**
- FW-06 skips SPEC/PLAN for *any* small change — still takes a one-line description as input
- ENH-14 replaces the agent pipeline entirely with a diagnosis-first flow designed for defects — takes a bug report (symptoms, repro steps, expected vs actual behavior) as input

**Fix:**
- `hive-mind bug --report <path>` accepts a bug report (markdown with symptoms, repro steps, logs)
- New DIAGNOSE stage replaces SPEC: diagnostician agent searches codebase for root cause, produces a diagnosis report with code locations and recommended fix
- Single human checkpoint after DIAGNOSE (approve diagnosis before fix attempt)
- Reuses EXECUTE sub-pipeline (implementer → tester → fixer → evaluator → committer) from the standard flow
- Skips PLAN stage entirely — no story decomposition needed for single-issue fixes
- For complex bugs touching multiple subsystems, diagnostician can recommend escalating to full pipeline mode

---

### ENH-11: Multi-Repo Module Config + CWD Threading

**Priority:** P1 | **Effort:** Medium | **Blocked by:** ENH-03 (parallel execution)
**Files:** `src/types/execution-plan.ts`, `src/orchestrator.ts`, `src/agents/spawner.ts`, `src/stages/execute-build.ts`, `src/stages/execute-verify.ts`, `src/stages/execute-commit.ts`, `src/index.ts`

> **ELI5:** Instead of one kitchen making one meal, the restaurant has multiple kitchens — each needs its own ingredients delivered to the right counter, not all dumped in the same spot.

**Problem:** The pipeline assumes a single working directory. All agent spawns, file operations, and commit stages operate on `process.cwd()`. Multi-repo workflows require explicit CWD per module.

**Fix — Two components:**

**Module Configuration:**
- PRD metadata gains an optional `modules` array declaring each repo module (name, relative path, role: dependency/consumer/standalone)
- Schema version detection: if `modules` present, schema ≥ v2; if absent, backward-compatible v1
- Module path resolution: relative paths resolved against PRD location at parse time

**CWD Threading:**
- `orchestrator.ts`: thread `moduleCwd` through stage dispatch
- `spawner.ts`: `spawnAgent()` accepts optional `cwd` parameter, passed to `child_process.spawn`
- Execute stages receive and use `moduleCwd` instead of `process.cwd()`
- Story type gains optional `module?: string` field linking each story to its target module

**Backward compatibility:** When no `modules` field exists in the PRD, all behavior defaults to current single-repo behavior. Zero changes for single-repo users.

**Full design:** See `.hive-mind/design/multi-repo-enhancements.md` (Waves 1-2: Module Configuration + CWD Threading)

---

### FW-07: Spec Self-Update During Implementation

**Priority:** P2 | **Effort:** Medium | **Blocked by:** RD-04 (structured output parsing)
**Files:** `src/agents/prompts.ts`, new `src/stages/reconcile-stage.ts`, `src/orchestrator.ts`
**Inspired by:** Addresses a known OpenSpec weakness (static specs drift from reality)

> **ELI5:** If the builder discovers the wall is load-bearing and can't be removed, they update the blueprint instead of pretending they followed it.

**Problem:** Step files are static. When the implementer deviates from the plan (e.g., discovers a file needs different changes, or an additional file is required), the deviation isn't tracked. The execution plan becomes fiction.

**Fix:**
- Implementer's impl-report already lists FILES CREATED / FILES MODIFIED — parse these as actual changes
- New `reconcile` sub-stage after EXECUTE compares planned vs. actual files
- If deviations found: update execution plan with actual file list + log deviation reason
- No blocking — deviations are recorded, not rejected

---

### FW-11: Docker-Sandboxed Agent Execution

**Priority:** P2 | **Effort:** Large | **Blocked by:** PRD-07
**Files:** `src/agents/spawner.ts`, new `src/agents/docker-executor.ts`, `src/config/loader.ts`
**Inspired by:** Warp Oz (every agent run gets its own Docker container)

> **ELI5:** Instead of letting every contractor work in your living room, you give each one a separate workshop with its own tools. If one makes a mess, it doesn't affect the others.

**Problem:** Agents run in the host OS with full filesystem access. No isolation between agent runs. PRD-07 only sandboxes *tests*, not the agents themselves. A misbehaving agent can modify files outside its story's scope, read sensitive files, or interfere with concurrent agents (once ENH-03 lands).

**Fix:**
- Wrap `spawnAgent()` in an optional Docker executor. When `execution.sandbox: true` in `.hivemindrc.json`, each story runs in a container built from a configurable base image
- Container mounts only the story's target files as read-write; everything else is read-only
- Secrets injected via env vars, not filesystem
- Falls back to host execution when Docker is unavailable or sandbox is disabled
- Extends PRD-07 (which sandboxes tests only) to sandbox the entire agent lifecycle

---

### FW-15: Agent Profiles / Permission Scoping

**Priority:** P2 | **Effort:** Medium | **Blocked by:** RD-03 (config file support)
**Files:** `src/config/loader.ts`, `src/agents/spawner.ts`, `src/agents/model-map.ts`
**Inspired by:** Warp Oz (Agent Profiles control permissions, model choice, and defaults per agent type)

> **ELI5:** The electrician should only touch wiring, the plumber should only touch pipes. Right now, every worker has the master key to every room.

**Problem:** All agents run with the same permissions and behavioral defaults. No way to restrict what a fixer agent can do vs. what an implementer can do (e.g., "fixer can only modify files listed in the step file"). No per-agent model overrides beyond the static model-map.

**Fix:**
- Add `profiles` section to `.hivemindrc.json`
- Each agent type gets a profile specifying: allowed file patterns (glob), model override, timeout override, max output tokens, and behavioral flags (e.g., `canCreateFiles: false` for fixers)
- Spawner reads profile before invoking agent and injects constraints into the prompt
- Default profiles match current behavior (no breaking changes)

---

### FW-16: AI-First Reports / Code Anchors

**Priority:** P2 | **Effort:** Medium | **Blocked by:** RD-04 (structured output parsing)
**Files:** `src/types/reports.ts`, `src/reports/templates.ts`, `src/reports/parser.ts`, `src/agents/prompts.ts`
**Inspired by:** Warp Oz (Skills with embedded code context), general AI-agent navigation patterns

> **ELI5:** After building a house, the contractor forgets where every wire and pipe goes. Right now, the as-built drawings just say "kitchen" — but if they said "kitchen, north wall, stud #3, 42 inches from floor," any future electrician could find the wire in seconds instead of scanning the whole house.

**Problem:** After development completes, an agent has no memory of what was built. It must either re-read the entire source code (slow, token-expensive) or read the reports. Current reports contain bare file paths (e.g., `src/foo.ts`) but no precise code pointers. An agent reading an ImplReport cannot jump to the `createWidget` function without grepping the entire file. This is wasteful when the report *already knows* exactly where that symbol lives.

**Design — Dual-Anchor `CodeAnchor` type:**
```typescript
interface CodeAnchor {
  file: string;                   // e.g., "src/utils/parser.ts"
  symbol: string;                 // e.g., "parseConfig" — primary stable anchor
  lineRange?: [number, number];   // e.g., [42, 58] — fast but fragile secondary anchor
  generatedAt?: string;           // ISO timestamp — enables staleness detection
}
```

The symbol is the **primary anchor** (survives insertions/deletions). The lineRange is the **fast path** (direct jump, no grep needed). The `generatedAt` timestamp lets consumers detect staleness: if the file's mtime is newer than `generatedAt`, fall back to symbol search.

**Classification of all 12 report types:**

| Category | Reports | Anchor Type | Rationale |
|----------|---------|-------------|-----------|
| **AI-First (High)** | ImplReport, FixReport, DiagnosisReport | `file:lineRange:symbol` + `generatedAt` | Short-lived, consumed in same pipeline run — line numbers always fresh |
| **AI-First (Medium)** | ResearchReport, RefactorReport, RoleReport | `file:symbol` only (no lineRange) | Long-lived, referenced across runs — line numbers would mislead |
| **Human-First** | TestReport, EvalReport, CritiqueReport, LearningReport, ConsolidatedReport, RetrospectiveReport | No change | Command-based, summary-level, or ELI5 — code pointers add no value |

**High-priority report changes:**

1. **ImplReport** — `filesCreated.exports: string[]` → `CodeAnchor[]`; `outputContractVerification.location: string` → `CodeAnchor`. The commit stage (`execute-commit.ts`) parses this via `parseImplReport` — parser must handle both old and new formats.

2. **FixReport** — `fixesApplied` gains `lineRange?` and `symbols?` fields; `acFixMapping` gains `targets?: CodeAnchor[]`. The commit stage uses `parseFixReport` to extract file paths — backward-compatible enhancement.

3. **DiagnosisReport** — `rootCause` gains `codeLocations: CodeAnchor[]` for structured evidence; `recommendedFix.files: string[]` → `recommendedFix.targets: CodeAnchor[]`. The fixer agent receives this as primary input — structured locations eliminate the need to re-search for root cause code.

**Medium-priority report changes:**

4. **ResearchReport** — `codebaseAnalysis.relevantFiles: string[]` → `{ file, symbols?, role }[]`; `existingPatterns` gains `exemplar?: { file, symbol }`.

5. **RefactorReport** — `changes` gains `symbols?: string[]` for affected symbols.

6. **RoleReport** — `findings: string[]` → `{ finding, codeRefs?: CodeAnchor[] }[]` (optional — not all roles reference code).

**Staleness mitigation strategy:**
- Short-lived reports (High): `lineRange` is always fresh — no other agent modifies files between generation and consumption within the same pipeline run
- Long-lived reports (Medium): `lineRange` omitted entirely — prevents false confidence from stale line numbers
- Resolution algorithm for consumers: (1) If `generatedAt` is fresh → trust `lineRange`; (2) Else → grep for `symbol` in `file`; (3) If symbol not found → flag as stale, fall back to reading full file
- Optional `validateAnchor()` utility function for programmatic staleness checking

**Implementation phases:**
1. Add `CodeAnchor` type and update 3 High-priority interfaces (all new fields optional for backward compat)
2. Update template functions to render anchor columns in markdown tables
3. Update `parseImplReport` and `parseFixReport` to extract anchors (backward-compatible with old format)
4. Add CODE-ANCHORS rules to agent prompts (implementer, fixer, diagnostician, researcher)
5. Update 3 Medium-priority interfaces and templates

---

## P3 — Low Priority (Future Versions)

> **ELI5:** These are the "after you've lived in the house for a year" improvements. You need real usage data to know what's worth building.

### v3.2

| ID | Feature | Blocked By |
|----|---------|------------|
| ENH-06 | Automated cross-story pattern mining | Retrospective data |
| ENH-07 | Synthesizer split (planner → AC-gen → EC-gen) | Quality measurements |

### v3.3

| ID | Feature | Blocked By |
|----|---------|------------|
| ENH-08 | `/hive` Claude Code skill | v3.0 CLI stable |
| FW-08 | Context hygiene / filtered memory per story | ENH-03 (parallel execution) |

### v3.4

| ID | Feature | Blocked By |
|----|---------|------------|
| ENH-09 | Session recovery / --resume (full) | Crash data; partially covered by RD-02 + RD-07 |
| ENH-10 | Reverify (re-run VERIFY with updated ACs) | ENH-09 |
| FW-09 | Design-first workflow variant | RD-09 (CLI discoverability) |
| FW-10 | Agent hooks for automated side-effects | RD-03 (config file support) |
| FW-12 | Event-driven pipeline triggers | RD-03 (config file support) |

### v3.5

| ID | Feature | Blocked By |
|----|---------|------------|
| FW-13 | Visual verification / Computer Use for UI stories | FW-11 (Docker sandbox) |

### v3.6

| ID | Feature | Blocked By |
|----|---------|------------|
| ENH-12 | Adaptive role weighting | Multi-chain data |

### FW-08: Context Hygiene / Filtered Memory Per Story

**Priority:** P3 | **Effort:** Small–Medium | **Blocked by:** ENH-03
**Files:** `src/memory/memory-manager.ts`, `src/stages/execute-build.ts`
**Inspired by:** GSD (fresh context per task)

> **ELI5:** You don't hand a plumber the electrician's notes. Each worker gets only the lessons relevant to their current job.

**Problem:** `memory.md` grows with learnings from all stories. By story 5, the implementer agent receives patterns from stories 1-4 that may be irrelevant (e.g., "React component patterns" when the current story is backend-only). This wastes context window and can mislead the agent.

**Fix:**
- Before injecting memory into the implementer prompt, filter entries by relevance to the current story's `specSections` and `sourceFiles`
- Simple keyword/file-path matching first; upgrade to semantic similarity later if needed
- Unfiltered memory still available to the retrospective agent (needs full picture)

---

### FW-09: Design-First Workflow Variant

**Priority:** P3 | **Effort:** Medium | **Blocked by:** RD-09
**Files:** `src/index.ts`, `src/stages/spec-stage.ts`, `src/agents/prompts.ts`
**Inspired by:** Kiro (design doc → specs → tasks)

> **ELI5:** Some teams start with "here's the architecture diagram" instead of "here's the product requirements." This mode lets them enter through the architect's door instead of the product manager's door.

**Problem:** Hive Mind only accepts a PRD as input. Teams with an architecture-first or design-first workflow must reformat their design documents into PRD format, which adds friction.

**Fix:**
- `--design <path>` flag accepts an architecture/design document instead of a PRD
- Researcher and spec-drafter receive alternate prompts that derive requirements from the design
- Synthesizer generates stories that implement the design rather than satisfying product requirements
- All downstream stages (EXECUTE, REPORT) remain unchanged

---

### FW-10: Agent Hooks for Automated Side-Effects

**Priority:** P3 | **Effort:** Medium | **Blocked by:** RD-03
**Files:** new `src/hooks/runner.ts`, `src/stages/execute-build.ts`, `src/config/loader.ts`
**Inspired by:** Kiro (event-driven hooks for automated actions)

> **ELI5:** After the builder finishes a wall, a checklist automatically triggers: inspector checks the studs, electrician verifies no wires were cut, painter preps the surface. No one has to remember to call each person — it happens automatically.

**Problem:** No event-driven automations after implement or refactor stages. Users who want automated security scans, import checks, or lint passes after each implementation must run them manually.

**Fix:**
- Hooks config in `.hivemindrc.json` under a `hooks` key
- Supported hook points: `post-build`, `post-verify`, `post-refactor`, `post-commit`
- Each hook specifies a shell command to run
- Hook failures are logged but non-blocking by default (configurable to blocking)
- Example: `"post-build": ["npx eslint --fix src/", "npx audit-ci"]`

---

### FW-12: Event-Driven Pipeline Triggers

**Priority:** P3 | **Effort:** Medium | **Blocked by:** RD-03
**Files:** new `src/triggers/webhook-server.ts`, new `src/triggers/file-watcher.ts`, `src/index.ts`
**Inspired by:** Warp Oz (cron schedules, Slack/Linear/GitHub Actions integrations, webhooks, API calls)

> **ELI5:** Instead of walking to the factory and pressing the start button every time, you set up automatic triggers — the factory starts itself when a customer places an order, when the clock hits 6 AM, or when new materials arrive.

**Problem:** The pipeline only starts via manual CLI invocation (`hive-mind start --prd`). No way to trigger automatically from CI, webhooks, or schedules. Teams wanting to run Hive Mind on every PR or on a nightly schedule must build their own wrapper scripts.

**Fix:**
- `hive-mind serve` mode: starts an HTTP server that listens for webhook triggers (GitHub webhooks, generic POST requests)
- `--watch <glob>` flag: monitors file changes and auto-triggers pipeline when matched files change
- GitHub Action wrapper: `hive-mind-action` that runs the pipeline in CI with configurable triggers
- All triggers log to `manager-log.jsonl` with trigger source metadata

---

### FW-13: Visual Verification / Computer Use for UI Stories

**Priority:** P3 | **Effort:** Large | **Blocked by:** FW-11 (Docker sandbox)
**Files:** new `src/stages/visual-verify.ts`, `src/stages/execute-verify.ts`, `src/agents/prompts.ts`
**Inspired by:** Warp Oz (Computer Use — agents take screenshots and verify visual output)

> **ELI5:** Instead of just checking that the paint cans are the right color, you take a photo of the finished wall and compare it to the design mockup.

**Problem:** Verification is bash-command-only. UI stories ("add dark mode toggle," "redesign the settings page") can't be visually verified — the verifier can only check if code compiles and tests pass, not if the button looks right or the layout matches the design.

**Fix:**
- For stories tagged `ui: true` in the step file, add an optional visual verification step after standard verification
- Launch a headless browser (Playwright) inside the Docker sandbox to render the relevant page
- Take a screenshot and pass it to a vision-capable model (Claude with vision)
- The evaluator agent receives the screenshot and judges visual correctness against the story's AC descriptions
- Visual verification failures are advisory (logged but non-blocking by default), configurable to blocking

---

### FW-14: Integration Verification Stage

**Priority:** P1 | **Effort:** Medium | **Blocked by:** ENH-11 (multi-repo module config)
**Files:** new `src/stages/integration-verify.ts`, `src/orchestrator.ts`, `src/types/execution-plan.ts`
**Inspired by:** Warp Oz (agents can modify files across multiple repositories in a single run)

> **ELI5:** When the restaurant changes its menu, someone needs to verify the website, the delivery app, and the in-store display all show the same prices — not just that each one individually looks fine.

**Problem:** After implementing stories across multiple modules, there's no verification that the modules work together. Each module's tests pass in isolation, but cross-module contracts (API types, shared interfaces, import paths) may be broken.

**Fix:**
- New `integration-verify` stage runs after all module stories are committed
- Spawns a verification agent per module boundary (e.g., shared-lib ↔ web-app)
- Agent runs cross-module type checks (`tsc --noEmit` across module boundaries) and integration tests if configured
- Results feed into the report stage alongside per-module verify results
- Skipped automatically in single-repo mode (no modules = no boundaries)

**Full design:** See `.hive-mind/design/multi-repo-enhancements.md` (Wave 4: Integration Verification)

---

## Long-Term Vision (PRD v1.x)

> **ELI5:** The v3.x/RD items (above) are about making the current pipeline better. The v1.x items (below) are from the original Hive Mind vision — self-healing, self-improving, and multi-platform support. Think of above as "tune-ups for the car" and below as "building a whole fleet."

These are from the original Hive Mind PRD (v1.0–v1.3 roadmap). They apply to the protocol framework, not just v3.

### v1.1

| ID | Feature | Source |
|----|---------|--------|
| PRD-01 | Stress tier system (Low/Medium/High/Critical) | PRD.md:1301-1312 |
| PRD-02 | System Flood (full reset on cascade failures) | PRD.md:1314-1322 |
| PRD-03 | LLM-as-Judge automated verify phase | PRD.md:1958, 1985 |
| PRD-04 | Anti-phantom SHIP gate (claims → evidence) | PRD.md:1986 |
| PRD-05 | code-reviewer agent | PRD.md:1984 |
| PRD-06 | log-summarizer agent | PRD.md:1984 |

### v1.2

| ID | Feature | Source |
|----|---------|--------|
| PRD-07 | Docker sandbox for test execution | PRD.md:1965, 1997 |
| PRD-08 | Auto-spec gen phase 1 (ts-morph AST) | PRD.md:1724, 1762 |
| PRD-09 | Scenario suite extraction (agent-driven) | PRD.md:1789, 1815 |
| PRD-10 | Evidence registry | PRD.md:1960, 1998 |
| PRD-11 | Full QCS 0-5 with auto-calculation | PRD.md:1999 |
| PRD-12 | Dynamic agent creation | PRD.md:2000 |

### v1.3

| ID | Feature | Source |
|----|---------|--------|
| PRD-13 | Parallel evolution / evolutionary selector | PRD.md:1324-1356 |
| PRD-14 | Noah's Ark archive (prompt DNA) | PRD.md:1358-1387 |
| PRD-15 | Neural feedback loop (win/loss tracking) | PRD.md:1389-1404 |
| PRD-16 | Auto-spec gen phase 2 (runtime enrichment) | PRD.md:1725 |
| PRD-17 | Scenario extraction phase 2 (runtime) | PRD.md:1790 |
| PRD-18 | VS Code adapter | PRD.md:445 |
| PRD-19 | Slack adapter | PRD.md:446 |

### TBD

| ID | Feature | Source |
|----|---------|--------|
| PRD-20 | KB graduation full automation | SPEC Risks section |

---

## Maturity Progression

| Dimension | Today | After P0 | After P0+P1 | After All |
|---|---|---|---|---|
| **Reliability** | Fragile — halts on failures | Usable with monitoring | Production-grade | Production-grade |
| **Cost awareness** | None | Manual tracking | Budget controls + tracking | Budget + dry-run |
| **Parallelism** | Sequential only | Sequential only | Wave-based stories | Wave-based + plan stage |
| **Provider flexibility** | Claude CLI only | Claude CLI only | Multi-provider | Multi-provider |
| **Multi-repo support** | Single repo only | Single repo only | Module-aware orchestration | Full multi-repo with integration verification |
| **Resumability** | Stage-level only | Stage + story-level | Stage + story + mid-story | Full |
| **Task granularity** | Whole-story only | Whole-story only | Sub-task decomposition | Sub-task + filtered context |
| **Spec quality** | Free-form ACs | Free-form ACs | EARS-style WHEN/THEN ACs | EARS + delta markers + self-update |
| **Ceremony flexibility** | Full pipeline always | Full pipeline always | Quick mode + fast-forward | Quick + design-first + hooks + triggers |
| **Execution isolation** | None (host OS) | None (host OS) | Docker sandbox available | Docker sandbox + visual verify |
| **Trigger flexibility** | CLI only | CLI only | CLI only | CLI + webhook + watch + CI |
| **Report code anchoring** | Bare file paths only | Bare file paths only | Dual-anchor (symbol + line) for 3 high-priority reports | Full anchoring across 6 AI-first reports |
| **Recommendation** | "Interesting, but not yet" | "Yes, with caveats" | "Yes, for complex projects" | "Recommend over others for audit-heavy work" |

### When to Recommend Each Framework (Post-Improvements)

| Scenario | Best Choice | Why |
|---|---|---|
| Solo dev, quick feature | GSD | Fresh context per task, minimal ceremony |
| Portable dev habits across tools | Superpowers | Tool-agnostic skills, works everywhere |
| Complex multi-story project with audit needs | **Hive Mind** | 21 specialists, memory graduation, full audit trail |
| Team wanting to enforce TDD | Superpowers | TDD baked into workflow, not optional |
| Long-running autonomous pipeline | **Hive Mind** (after P0+P1) | Checkpoints, escalation, cost controls |
| Quick fix or single-file change | **Hive Mind** `--quick` (after P2) | Minimal ceremony, still audited |
| Architecture-first team | **Hive Mind** `--design` (after P3) | Design doc entry point, no PRD reformatting |
| Cloud-scale parallel agents | **Warp Oz** (today) | Docker isolation, event triggers, multi-model — Oz's sweet spot |
| Event-driven / CI-triggered pipeline | **Hive Mind** `serve` (after P3) or **Warp Oz** | Webhook/cron triggers with audit trail |
| UI-heavy feature with visual verification | **Hive Mind** `ui: true` (after P3) or **Warp Oz** | Screenshot-based verification for visual correctness |

---

*Consolidated from: Enhancement Backlog + Production Reliability Roadmap + Framework Comparison Analysis (2026-03-11). Warp Oz items (FW-11 through FW-15) added 2026-03-11. AI-first reports item (FW-16) added 2026-03-11. Checkpoint sound notification (ENH-13) added 2026-03-11. AI-first manifest (ENH-15) added 2026-03-11. MVP plan (15 items, 5 phases) created 2026-03-11 — ENH-07, PRD-05, PRD-06 promoted from P3 to P1. Multi-repo Phase 6 (ENH-11, FW-14) promoted from P3 to P1 (2026-03-12) — supersedes old `--repos` flag approach with PRD-declared modules.*
