# Phase 2: Reliability — Implementation Plan

## Inputs Consulted

- [x] **Memory** (`C:\Users\ziyil\coding_projects\.hive-mind\memory.md`):
  - PATTERNS: "Parser is the single point of failure in verify" (2026-03-08) — confirms RD-04 is highest-impact item
  - PATTERNS: "Label-free verdict lines cause parser false-FAILs. One-off regex patches have diminishing returns — implement RD-04" (Bug 15, 2026-03-12) — directly motivates Level 0 JSON status block
  - PATTERNS: "Place PASS/FAIL verdict with label keyword in first 200 chars of report" (P31, 2026-03-12) — informs prompt instruction design
  - PATTERNS: "Short-circuit on 100% PASS — US-01 continued fix/diagnosis cycles after eval showed 100% PASS" (2026-03-08) — relevant to error recovery flow
  - MISTAKES: "When pipeline says FAIL but tests say PASS, check manager-log.jsonl first" (F40, 2026-03-12) — informs parser confidence distinction
  - DISCOVERIES: "Agent output format variance is high and irreducible" (2026-03-08) — confirms we must be robust to variation, not constrain format
  - DISCOVERIES: "Parser one-off regex patches (Bug 1 → 14 → 15) have diminishing returns. RD-04 eliminates the entire class permanently" (2026-03-12) — validates structured output approach

- [x] **Knowledge base** (`C:\Users\ziyil\coding_projects\.hive-mind\knowledge-base\`):
  - `01-proven-patterns.md`: P6 (mechanical detection over judgment) — parser Level 0 is mechanical; P25 (scan keywords anywhere) — existing regex cascade already implements this, preserve it as fallback; P31 (verdict in first 200 chars) — add to prompt instruction
  - `02-anti-patterns.md`: F31 (return-type changes need caller audit) — `parseReportStatus` return type unchanged, but `StoryStatus` adding "skipped" needs caller audit; F34 (first-word regex fails) — existing bug that RD-04 bypasses; F35 (all-or-nothing verify with no recovery) — directly motivates RD-02 `--from`/`--skip-failed`; F40 (misattributing pipeline failures to code) — motivates parser confidence distinction in RD-04; F30 (in-memory tracking without atomic writes) — error persistence must use `writeFileAtomic`
  - `03-design-constraints.md`: C-ATOMIC-1 (tracking files written atomically after state transition) — error details must be persisted atomically; C3 (rules need mechanical verification) — structured output is mechanically verifiable

- [x] **Phase 1 learnings** (`learnings/phase-1-learnings.md`):
  - vi.mock hoisting pattern — all new tests must follow inline-factory pattern
  - Config threading — new config fields (`retryBaseDelayMs`, `retryMaxDelayMs`) follow established merge pattern
  - Defensive JSON parsing — `spawnClaude()` fallback pattern already in place, RD-04 adds a second layer at report level
  - Caller audit on signature changes (F31) — `StoryStatus` consumers must be audited when adding "skipped"

- [x] **mvp-plan.md**: Items 3 (RD-01), 4 (RD-04), 5 (RD-02) with smoke test criteria (Tier 1+2+3, Tier 3 MANDATORY)
- [x] **BACKLOG.md**: Detailed problem statements and fix descriptions for each item

---

## Items

### RD-01: Exponential Backoff + Retry

**Goal:** Replace naive retry loop in `spawnAgentWithRetry()` with exponential backoff, jitter, and configurable parameters.

**Files to create:**
- `src/utils/backoff.ts` — pure functions for delay calculation (testable without async)

**Files to modify:**
- `src/agents/spawner.ts:62-73` — use backoff delay between retries
- `src/config/schema.ts` — add `retryBaseDelayMs` (default: 1000), `retryMaxDelayMs` (default: 16000) fields
- `src/config/loader.ts:36-53` — add new fields to positive number validation + merge logic

**Function signatures:**
```typescript
// src/utils/backoff.ts
export function calculateBackoffDelay(
  attempt: number,       // 0-indexed retry number (0 = first retry)
  baseDelayMs: number,   // default 1000
  maxDelayMs: number,    // default 16000
): number;               // delay in ms with ±20% jitter applied

export function sleep(ms: number): Promise<void>;
```

**Key decisions:**
- Backoff as pure functions in `utils/backoff.ts` — easy to unit test delay calculations without mocking timers
- Jitter: ±20% uniform random on top of exponential — prevents thundering herd when parallel agents all retry simultaneously
- Delays: 1s, 2s, 4s, 8s, 16s (capped) — aggressive enough to help with rate limits, not so long that pipeline stalls
- `sleep()` separated from calculation for mockability

---

### RD-04: Structured Output Parsing

**Goal:** Add JSON status block as Level 0 parser, falling back to existing regex cascade with a warning.

**Files to modify:**
- `src/agents/prompts.ts:117-138` — add STATUS block instruction to agent prompt template
- `src/reports/parser.ts:6-40` — add Level 0 JSON extraction before regex cascade

**No new files** — changes are surgical to existing parser and prompt builder.

**Key decisions:**
- Status block format: `<!-- STATUS: {"result": "PASS", "details": "..."} -->` — HTML comment so it doesn't render in markdown but survives output formatting
- Level 0 is additive: if JSON block missing, fall back to regex cascade with `console.warn` — zero breakage risk
- Only `parseReportStatus()` changes; `parseTestReport()`, `parseEvalReport()`, `parseImplReport()`, `parseFixReport()` all delegate to it
- Prompt instruction added only to agents that produce status reports: `tester-exec`, `evaluator`, `implementer`, `fixer` — not all agents
- **Parser confidence upgrade (per F35, F40):** `ParseResult.confidence` gains a third value `"structured"` (from JSON block), distinguishing "verified FAIL" (structured/matched) from "unable to determine" (default). When confidence is `"default"`, orchestrator should log a warning rather than treating it as a definitive FAIL — this addresses the "all-or-nothing verify" anti-pattern (F35) and "misattributing pipeline failures to code" (F40)
- **Prompt placement per P31:** STATUS block instruction tells agents to place it in first 200 characters of the report, reinforcing the verdict placement pattern
- **Agent output variance is irreducible (memory 2026-03-08):** The JSON block gives agents a mechanical way to report status reliably even when their free-text format varies. This addresses the root cause, not the symptoms

---

### RD-02: Graceful Error Recovery

**Goal:** Persist error details, support `--from`/`--skip-failed` resume, eliminate `process.exit(1)` from pipeline internals.

**Files to modify:**
- `src/types/execution-plan.ts:5-19` — add `errorMessage?: string` and `lastFailedStage?: string` to `Story`
- `src/orchestrator.ts:37-38,92-93` — replace `process.exit(1)` with thrown errors
- `src/orchestrator.ts:262-265` — persist `errorMessage` and `lastFailedStage` on catch
- `src/index.ts:19-57` — add `resume` command with `--from` and `--skip-failed` flags
- `src/index.ts:26,35,45,55,67,73,82,91` — replace `process.exit(1)` in `parseArgs` with thrown errors
- `src/state/execution-plan.ts` — add `getStoryById()` helper

**Function signatures:**
```typescript
// src/index.ts — new ParsedCommand variant
| { command: "resume"; from?: string; skipFailed?: boolean }

// src/state/execution-plan.ts
export function getStoryById(plan: ExecutionPlan, storyId: string): Story | undefined;
```

**Key decisions:**
- Custom `HiveMindError` class (extends Error) — distinguishes user-facing errors (missing PRD, bad args) from internal bugs
- `parseArgs()` throws `HiveMindError` instead of `process.exit(1)` — lets `main()` catch and print cleanly
- Only `main()` calls `process.exit()` — single exit point at the top level
- `--from US-03` marks all stories before US-03 as "skipped" (new status) — preserves their existing state
- `--skip-failed` marks stories with status "failed" as "skipped" before re-executing — lets pipeline continue past previously broken stories
- `errorMessage` and `lastFailedStage` persisted to `execution-plan.json` on every failure — enables post-mortem analysis
- **Atomic error persistence (per C-ATOMIC-1, F30):** Error details written to disk via `writeFileAtomic` + `saveExecutionPlan` immediately on catch, BEFORE any subsequent action — prevents stale tracking after context loss
- **StoryStatus caller audit (per F31):** Adding `"skipped"` to `StoryStatus` requires auditing all consumers: `getNextStory()`, `updateStoryStatus()`, orchestrator status checks (`plan.stories.every(s => s.status === "failed")`), report-stage story collection. Each must handle the new status correctly
- **Addresses F35 (all-or-nothing verify):** `--from` and `--skip-failed` provide recovery paths when parser bugs cause false failures on correct code — the user can skip the falsely-failed story and continue

---

## Execution Order

### Step 1: Backoff utility (`src/utils/backoff.ts`)
Create pure functions `calculateBackoffDelay()` and `sleep()`. No dependencies on other code.

### Step 2: Backoff config fields
Add `retryBaseDelayMs` and `retryMaxDelayMs` to:
- `src/config/schema.ts` (interface + defaults)
- `src/config/loader.ts` (validation + merge)

### Step 3: Backoff tests
Write unit tests for `calculateBackoffDelay()`:
- Delays increase exponentially: attempt 0 → ~1s, attempt 1 → ~2s, etc.
- Delay capped at `maxDelayMs`
- Jitter stays within ±20% range
- Config override respected

### Step 4: Wire backoff into spawner
Update `spawnAgentWithRetry()` in `src/agents/spawner.ts` to call `sleep(calculateBackoffDelay(...))` between retries.

### Step 5: Spawner retry tests
Update `src/__tests__/agents/spawner.test.ts`:
- Mock `sleep` to avoid real delays
- Verify backoff called with correct attempt numbers
- Verify retry count from config respected

### Step 6: Structured output — prompt update
Add STATUS block instruction to `src/agents/prompts.ts` for status-producing agents.

### Step 7: Structured output — parser Level 0
Add JSON status block extraction to `parseReportStatus()` in `src/reports/parser.ts`. Existing regex cascade becomes Level 1+.

### Step 8: Parser tests
- Test JSON block extraction (Level 0)
- Test fallback to regex when JSON missing (with warning)
- Test malformed JSON block → falls back gracefully
- Regression: existing parser tests still pass unchanged

### Step 9: Error types
Create `HiveMindError` class (can be inline in `src/index.ts` or a small `src/utils/errors.ts`).

### Step 10: Story type extension
Add `errorMessage` and `lastFailedStage` fields to `Story` in `src/types/execution-plan.ts`. Add `"skipped"` to `StoryStatus`. Add `getStoryById()` to `src/state/execution-plan.ts`.

### Step 11: Orchestrator error persistence
Update `src/orchestrator.ts` catch blocks to persist `errorMessage` and `lastFailedStage` on stories. Replace `process.exit(1)` with thrown errors.

### Step 12: CLI resume command
Add `resume` command with `--from` and `--skip-failed` to `parseArgs()`. Replace all `process.exit(1)` in `parseArgs` with thrown `HiveMindError`. Wire into `main()`.

### Step 13: Error recovery tests
- `parseArgs` throws on bad input (not `process.exit`)
- `--from US-03` skips stories before US-03
- `--skip-failed` skips previously failed stories
- `errorMessage` persisted to execution plan on failure
- Orchestrator doesn't call `process.exit` internally

### Step 14: Integration tests
- Simulated transient failure: mock spawner fails attempts 1-2, succeeds attempt 3 → verify backoff delays, final success
- Simulated permanent failure: all attempts fail → story marked "failed" with errorMessage, pipeline continues to next story
- Parser regression corpus: 10+ known agent outputs → correct verdicts through Level 0 + fallback
- Full pipeline with errors: one story fails, next succeeds, error details persisted

### Step 15: Verification
- `npm run build` — 0 TypeScript errors
- `npm test` — all tests pass
- Update `progress.md`

---

## Tests to Write

### RD-01 Tests (`src/__tests__/utils/backoff.test.ts`)
- `calculateBackoffDelay(0, 1000, 16000)` → ~1000ms ±20%
- `calculateBackoffDelay(1, 1000, 16000)` → ~2000ms ±20%
- `calculateBackoffDelay(4, 1000, 16000)` → capped at ~16000ms ±20%
- `calculateBackoffDelay(10, 1000, 16000)` → still capped, no overflow
- Custom base/max from config respected

### RD-01 Spawner Tests (extend `src/__tests__/agents/spawner.test.ts`)
- Retry calls `sleep()` between attempts with increasing delays
- No sleep before first attempt
- Success on first attempt → no sleep at all
- `maxRetries: 0` → single attempt, no retry

### RD-04 Tests (extend `src/__tests__/reports/parser.test.ts`)
- `<!-- STATUS: {"result": "PASS"} -->` → PASS with confidence "matched"
- `<!-- STATUS: {"result": "FAIL", "details": "tests failed"} -->` → FAIL
- No JSON block → falls back to regex cascade (existing behavior)
- Malformed JSON in status block → falls back to regex
- JSON block + regex disagree → JSON block wins
- "this did NOT PASS" without JSON block → still FAIL (existing bug fixed by Level 0 taking priority when present)

### RD-02 Tests
- `parseArgs(["node", "cli", "resume", "--from", "US-03"])` → `{ command: "resume", from: "US-03" }`
- `parseArgs(["node", "cli", "resume", "--skip-failed"])` → `{ command: "resume", skipFailed: true }`
- `parseArgs` throws `HiveMindError` on unknown command (not `process.exit`)
- Story with `errorMessage` survives save/load roundtrip
- `getStoryById` returns correct story or undefined
- Orchestrator catch writes `errorMessage` to plan

### Integration Tests (`src/__tests__/integration/retry-and-recovery.test.ts`)
- Mock spawner: fail twice then succeed → verify 2 backoff sleeps + final success
- Mock spawner: fail all attempts → story status "failed", `errorMessage` populated, next story still runs
- Pipeline with `--from US-03`: stories US-01, US-02 marked "skipped", US-03 executed

---

## Smoke Test Gate (from mvp-plan.md)

**Tier 1 (Unit):**
- [ ] Backoff delay calculation: attempt delays are 1s, 2s, 4s, 8s with ±20% jitter
- [ ] Backoff respects max delay cap from config
- [ ] Structured output: parser extracts JSON status block (Level 0) before trying regex
- [ ] Structured output fallback: when JSON missing, regex cascade still works (with warning logged)
- [ ] Error recovery: `runPipeline` catches exceptions → writes error state (no `process.exit`)
- [ ] Error recovery: stories already passed remain passed after pipeline error

**Tier 2 (Integration):**
- [ ] Simulated transient failure: mock spawner fails attempts 1-2, succeeds attempt 3 → backoff delays applied, final result = success
- [ ] Simulated permanent failure: mock spawner fails all attempts → story marked "failed", pipeline continues to next story
- [ ] Parser regression corpus: 10+ real agent outputs → correct verdicts
- [ ] Full EXECUTE stage with mocked spawner returning structured output → correct `VerifyResult`

**Tier 3 (Live — MANDATORY):**
- [ ] Run complete pipeline on trivial PRD: "add hello-world.ts exporting greet(name)"
- [ ] Max 4 stories, estimated cost ~$5-10
- [ ] Pass criteria: no crash; passed stories committed; failed stories logged with error context; report produced

---

## Risk Mitigations

| Risk | Mitigation | Source |
|------|-----------|--------|
| vi.mock hoisting breaks new tests | Follow Phase 1 pattern: inline mock impl inside factory | Phase 1 learnings |
| Backoff makes tests slow | Mock `sleep()` in all test files — never use real delays | First principles |
| Parser change breaks existing outputs | Level 0 is additive; all existing regex tests remain unchanged | Design |
| `process.exit` removal breaks CLI behavior | Single exit point in `main()` catch; test `parseArgs` throws, not exits | Design |
| Story type change breaks execution plan files | New fields are optional (`?`) — existing plans remain valid | Backwards compat |
| "skipped" status breaks plan consumers | Audit all `StoryStatus` consumers: `getNextStory`, `updateStoryStatus`, orchestrator checks, report-stage collection | F31, Phase 1 learnings |
| Error details lost on context break | Use `writeFileAtomic` + `saveExecutionPlan` immediately on catch, before next action | C-ATOMIC-1, F30 |
| Parser confidence "default" treated as definitive FAIL | Distinguish "structured"/"matched" (definitive) from "default" (uncertain); log warning on "default" | F35, F40, memory |
| Agent output format variance defeats prompt instructions | JSON status block is mechanical (P6) — agents either emit it or don't; no interpretation needed | Memory (2026-03-08), KB P6 |
| Regex cascade still has false positives ("did NOT PASS") | Level 0 JSON block takes precedence when present; regex only fires as fallback with logged warning | F34, BACKLOG RD-04 |
