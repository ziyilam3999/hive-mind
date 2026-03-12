# MVP Plan: Hive Mind v3 Production Readiness

> 20 items across 6 phases to move Hive Mind from "interesting prototype" to "production-usable."

---

## Context

The framework comparison ([framework-comparison.md](../../docs/framework-comparison.md)) identifies Hive Mind as "architecturally innovative but operationally fragile." The backlog ([BACKLOG.md](../../docs/BACKLOG.md)) has 4 P0 items and 9 P1 items. This plan identifies the **minimum subset** needed for production readiness, plus user-selected feature additions.

---

## What's Blocking Production Use?

| Pain Point | Backlog Item | Severity | Why It Blocks Production |
|---|---|---|---|
| No retry/backoff — API blip kills pipeline | RD-01 | **Critical** | Any transient failure = full restart |
| No error recovery — failure at story 8/10 = restart all | RD-02 | **Critical** | Lost work, wasted tokens |
| Hardcoded everything — can't tune without forking | RD-03 | **Critical** | Teams can't adapt to their environment |
| Fragile regex parsing — false failures | RD-04 | **Critical** | Wrong results silently |
| No cost visibility — burns money blindly | RD-05 | **High** | Can't budget or forecast |
| Pre-existing test failures waste retries | FW-02 | **High** | Retries blamed for pre-existing bugs |

---

## MVP Overview: 20 Items in 6 Phases

| # | ID | Name | Phase | Effort | Detailed Plan |
|---|---|---|---|---|---|
| 1 | RD-03 | Config file support | 1: Foundation | Small-Medium | Below |
| 2 | — | Spawner upgrade (spawn + JSON + tools) | 1: Foundation | Medium | [spawner-upgrade-plan.md](spawner-upgrade-plan.md) |
| 3 | RD-01 | Exponential backoff + retry | 2: Reliability | Small | Below |
| 4 | RD-04 | Structured output parsing | 2: Reliability | Medium | Below |
| 5 | RD-02 | Graceful error recovery | 2: Reliability | Medium | Below |
| 6 | RD-12 | Agent output mode fix | 3: Visibility & DX | Small | Below |
| 7 | RD-05 | Cost/token tracking | 3: Visibility & DX | Medium | Below |
| 8 | FW-02 | Clean baseline verification | 3: Visibility & DX | Small | Below |
| 9 | ENH-15 | AI-first manifest | 3: Visibility & DX | Small | [manifest-plan.md](manifest-plan.md) |
| 10 | ENH-13 | Checkpoint sound notification | 3: Visibility & DX | Small | Below |
| 11 | ENH-02 | Dependency-aware scheduling | 3: Visibility & DX | Small | Below |
| 12 | ENH-07 | Synthesizer split | 4: Pipeline Quality | Medium | Below |
| 13 | PRD-05 | Code-reviewer agent | 4: Pipeline Quality | Small-Medium | Below |
| 14 | PRD-06 | Log-summarizer agent | 4: Pipeline Quality | Small | Below |
| 17 | ENH-16 | Role-report feedback loop | 4: Pipeline Quality | Medium | [role-report-feedback-loop-plan.md](role-report-feedback-loop-plan.md) |
| 15 | ENH-03 | Parallel story execution | 5: Execution Power | Large | Below |
| 16 | FW-01 | Sub-task decomposition | 5: Execution Power | Large | Below |
| 18 | ENH-11 | Multi-repo module config + CWD threading | 6: Multi-Repo | Medium | Below |
| 19 | FW-14 | Integration verification stage | 6: Multi-Repo | Medium | Below |
| 20 | — | Module-aware story ordering + contracts | 6: Multi-Repo | Small-Medium | Below |

### Dependency Graph

```
Phase 1:  RD-03 (config) ──────┐
          Spawner upgrade ──────┼── Phase 2:  RD-01 (backoff)
                                │             RD-04 (structured output)
                                │             RD-02 (error recovery)
                                │
                                ├── Phase 3:  RD-12 (output mode fix)
                                │             RD-05 (cost tracking)
                                │             FW-02 (baseline check)
                                │             ENH-15 (manifest)
                                │             ENH-13 (sound notification)
                                │             ENH-02 (dependency scheduling)
                                │
                                ├── Phase 4:  ENH-07 (synthesizer split)
                                │             PRD-05 (code-reviewer)
                                │             PRD-06 (log-summarizer)
                                │             ENH-16 (role-report feedback)
                                │
                                ├── Phase 5:  ENH-03 (parallel execution) ← needs ENH-02
                                │             FW-01 (sub-tasks) ← benefits from ENH-02
                                │
                                └── Phase 6:  ENH-11 (multi-repo config + CWD) ← needs Phase 1 spawner upgrade
                                              FW-14 (integration verify) ← needs ENH-11
                                              Module ordering + contracts ← needs ENH-02, ENH-03
```

### Blocker Analysis (User-Selected Items)

| Item | Listed Blocker | Blocker Type | Can We Build Anyway? |
|---|---|---|---|
| ENH-15: Manifest | None | — | Yes |
| ENH-02: Dependency scheduling | "E2E pass" | Soft (confidence) | Yes — `dependencies` field already exists in schema, just unused |
| ENH-13: Sound notification | None | — | Yes |
| ENH-07: Synthesizer split | "Quality measurements" | Soft (data-driven) | Yes — split is architecturally sound regardless of measurements |
| ENH-03: Parallel execution | ENH-02 | Hard | Yes — ENH-02 is in MVP Phase 3 |
| FW-01: Sub-task decomposition | ENH-02 (benefits from) | Soft | Yes — can build independently |
| PRD-05: Code-reviewer agent | "Workflow validated" | Soft (confidence) | Yes — adding an agent is low-risk |
| PRD-06: Log-summarizer agent | "Workflow validated" | Soft (confidence) | Yes — reads existing JSONL, pure analysis |

All blockers are soft or resolved by other MVP items. Safe to build all.

---

## Dogfooding Strategy

> Use Hive Mind to build Hive Mind — but only once the pipeline is stable enough to do so safely.

### Phase 1-2: Manual Development

The chicken-and-egg problem is concrete: Phases 1-2 fix the very infrastructure problems that make dogfooding risky (no retry/backoff, fragile parsing, `process.exit(1)` crashes, no config override). Develop these phases manually.

### Phase 3: Calibration Trial

After Phase 2 lands (backoff, structured parsing, error recovery), pick **ENH-13 (sound notification)** as the first dogfood candidate:
- Smallest item in Phase 3 (new `src/utils/notify.ts` + 4 call sites)
- Zero dependencies on other Phase 3 items
- Low blast radius if pipeline produces bad code
- Goal is **learning**, not productivity — document every friction point

### Phase 4: Full Dogfooding

By Phase 4, cost tracking (RD-05), baseline verification (FW-02), and dependency scheduling (ENH-02) are in place. Write **one PRD per backlog item** (not per phase):
- ENH-07 (synthesizer split) — pipeline restructures its own planning agents
- PRD-05 (code-reviewer) — natural self-test: generated reviewer reviews its own generated code
- PRD-06 (log-summarizer)
- ENH-16 (role-report feedback loop)

### Phase 5: Dogfooding Mandatory

ENH-03 (parallel execution) and FW-01 (sub-task decomposition) are complex orchestration features. If the pipeline can't build its own orchestration, that's a critical signal.

### Phase 6: Eligible for Dogfooding

Phase 6 adds new modules (`integration-verify.ts`) and extends existing files that Phase 5 already modified (`orchestrator.ts`, `spawner.ts`, execute stages). Since Phase 5 dogfooding has already validated these files, Phase 6 can safely dogfood. Use the branch-first strategy for any changes to `orchestrator.ts`.

### PRD Granularity

**One PRD per backlog item**, not per phase. The PLAN stage's synthesizer works best with focused PRDs, and this enables clean before/after comparison per feature (cost, quality, success rate).

### Self-Referential Safety Rule

**Never dogfood items that modify files the pipeline is currently using.** Phase 3+ items add new modules or modify peripheral files — they don't touch `spawner.ts`, `orchestrator.ts`, or `parser.ts`. For Phase 5's ENH-03 (which modifies `orchestrator.ts`), use a **branch-first strategy**: pipeline runs on a feature branch; the running pipeline instance uses main-branch orchestrator.

---

## Smoke Test Tiers

| Tier | What | Cost | When |
|---|---|---|---|
| **Tier 1 (Unit)** | vitest, mocked spawner, fast | Free | Every code change |
| **Tier 2 (Integration)** | Real file I/O + state transitions, mocked Claude CLI | Free | Phase boundary gate |
| **Tier 3 (Live/Dogfood)** | Actual `claude --print` calls, real pipeline run | ~$5-60 | Phase boundary (selective) |

### Smoke Test / Dogfood Interaction Flow

```
Phase N implementation complete
        │
        ▼
  Tier 1 + Tier 2 smoke tests pass?  ──NO──► Fix issues, re-test
        │
       YES
        │
        ▼
  Phase >= 3?  ──NO──► Proceed to Phase N+1
        │
       YES
        │
        ▼
  Tier 3: Dogfood run on selected item
        │
        ▼
  Document results (cost, failures, quality)
        │
        ▼
  Add regression tests from any dogfood failures
        │
        ▼
  Proceed to Phase N+1
```

Dogfood failures not caught by Tier 1/2 reveal test gaps → new Tier 2 tests are added. Over time, the Tier 2 suite becomes a regression corpus built from real failures.

### Estimated Tier 3 Cost Budget

| Phase | Live Test | Est. Cost |
|---|---|---|
| 2 | Hello-world pipeline (mandatory) | $5-10 |
| 3 | ENH-13 dogfood trial | $15-25 |
| 4 | PRD-05 + ENH-07 dogfood | $30-50 |
| 5 | ENH-03 + FW-01 dogfood (mandatory) | $40-60 |
| 6 | 2-module PRD dogfood trial | $20-35 |
| **Total** | | **$110-180** |

---

## Phase 1: Foundation

### 1. RD-03: Config File Support

**Problem:** 12+ constants hardcoded across the codebase (agent timeout, shell timeout, max retries, memory word cap, graduation threshold, model assignments, etc.). Can't tune without forking.

**Fix:**
- Create `src/config/loader.ts` that reads `.hivemindrc.json` from project root
- All hardcoded values become defaults overridable by config
- Every subsequent MVP item benefits from configurable defaults

**Files:**
- New `src/config/loader.ts`
- ~8 files with hardcoded constants: `src/agents/spawner.ts`, `src/utils/shell.ts`, `src/tooling/detect.ts`, `src/memory/memory-manager.ts`, `src/stages/report-stage.ts`, `src/agents/model-map.ts`

### 2. Spawner Upgrade

See [spawner-upgrade-plan.md](spawner-upgrade-plan.md) for full design. Summary:
- `child_process.spawn` replaces `exec` (fixes 10MB buffer cap)
- `--output-format json` enables structured metadata (cost, model, duration)
- `--allowedTools` per agent type (security)
- `spawnAgentsParallel()` utility for concurrent agent spawning
- **Foundational** for RD-04 (structured output) and RD-05 (cost tracking)

### Phase 1 Smoke Test Gate

**All Tier 1+2 must pass before starting Phase 2.**

**Tier 1 (Unit):**
- `.hivemindrc.json` loads and overrides defaults (timeout, retries, model assignments)
- Missing config file gracefully uses defaults (no crash)
- Invalid config values produce clear error message
- Spawner upgrade: `spawnAgentWithRetry` accepts config-driven parameters

**Tier 2 (Integration):**
- Full SPEC stage with mocked spawner using config-driven model assignments
- Roundtrip: write config → load config → spawn agent with correct model parameter
- Spawner produces JSON output with metadata fields (cost, duration, model)

---

## Phase 2: Reliability

### 3. RD-01: Exponential Backoff + Retry

**Problem:** `spawnAgentWithRetry()` has only 1 retry with no delay. No backoff, no jitter.

**Fix:**
- Default `maxRetries` to 3 (4 attempts total)
- Exponential backoff: 1s, 2s, 4s, 8s between retries
- ±20% jitter to prevent thundering herd
- All values configurable via RD-03 config

**File:** `src/agents/spawner.ts`

### 4. RD-04: Structured Output Parsing

**Problem:** 5-level regex cascade in `src/reports/parser.ts` tries increasingly desperate patterns to extract PASS/FAIL. A report saying "this did NOT PASS" would match Level 4 as PASS.

**Fix:**
- Add JSON status block requirement to agent prompts: `<!-- STATUS: {"result": "PASS", "details": "..."} -->`
- Parser tries JSON block first (Level 0). Fall back to existing regex cascade only if JSON missing
- Log warning when falling back to regex
- Builds on spawner upgrade's `--output-format json`

**Files:** `src/reports/parser.ts`, `src/agents/prompts.ts`

### 5. RD-02: Graceful Error Recovery

**Problem:**
1. Error details only go to `console.error` — not persisted
2. No way to resume from a specific story
3. No option to skip failed stories
4. `process.exit(1)` in 5+ places — no graceful shutdown

**Fix:**
- Add `errorMessage` and `lastFailedStage` fields to story type in `src/types/execution-plan.ts`
- Persist error details on catch, not just status change
- Add `--from <story-id>` and `--skip-failed` CLI flags in `src/index.ts`
- Replace `process.exit(1)` with thrown errors caught at top level

**Files:** `src/types/execution-plan.ts`, `src/orchestrator.ts`, `src/index.ts`

### Phase 2 Smoke Test Gate

**All Tier 1+2+3 must pass. Tier 3 is mandatory here — this is the reliability foundation.**

**Tier 1 (Unit):**
- Backoff delay calculation: attempt delays are 1s, 2s, 4s, 8s with ±20% jitter
- Backoff respects max delay cap from config
- Structured output: parser extracts JSON status block (Level 0) before trying regex
- Structured output fallback: when JSON missing, regex cascade still works (with warning logged)
- Error recovery: `runPipeline` catches exceptions → writes error state to checkpoint (no `process.exit`)
- Error recovery: stories already passed remain passed after pipeline error

**Tier 2 (Integration):**
- Simulated transient failure: mock spawner fails attempts 1-2, succeeds attempt 3 → verify backoff delays applied, final result = success
- Simulated permanent failure: mock spawner fails all attempts → story marked "failed", pipeline continues to next story
- Parser regression corpus: 10+ real agent outputs parsed through new structured parser, compared against known-correct verdicts
- Full EXECUTE stage with mocked spawner returning structured output → correct `VerifyResult`

**Tier 3 (Live — MANDATORY):**
- Run complete pipeline on a trivial PRD: "add a `hello-world.ts` file that exports a `greet(name)` function"
- Max 4 stories. Estimated cost: ~$5-10
- Pass criteria: pipeline doesn't crash; passed stories are committed; failed stories logged with error context; report stage produces readable output

---

## Phase 3: Visibility & DX

### 6. RD-12: Agent Output Mode Fix

**Problem:** `spawnClaude()` passes `--print`, which makes Claude dump the full session to stdout.
When agents don't Write their output file, fallback saves raw JSON as file content. Parser can't
extract status → defaults to FAIL. Both Phase 2 Tier 3 stories failed for this reason.

**Fix:**
- Remove `--print` from args in `spawnClaude()` (line 74 of `src/utils/shell.ts`)
- Simplify stdout fallback in `spawnAgent()` — without `--print`, stdout is minimal when agents
  use Write tool as instructed (`prompts.ts` line 128-129)
- `--output-format json` remains — still provides metadata (cost, model, session_id)

**Risk:** LOW. Agents already instructed to use Write tool. Rollback: one-line revert.
**Files:** `src/utils/shell.ts` (1 line), `src/agents/spawner.ts` (simplify lines 38-44)

### 7. RD-05: Cost/Token Tracking

**Problem:** Zero token tracking. 25-35+ agent calls per story with no cost visibility.

**Fix:**
- Parse token usage from Claude CLI JSON output (from spawner upgrade)
- Add `tokensUsed` field to `AgentResult` interface
- Log tokens to `manager-log.jsonl` with each agent invocation
- Display cumulative cost at end of each stage
- Add `--budget <dollars>` CLI flag for spend caps

**Files:** `src/agents/spawner.ts`, new `src/utils/cost-tracker.ts`

### 8. FW-02: Clean Baseline Verification

**Problem:** EXECUTE stage assumes codebase compiles and existing tests pass. If they don't, implementer's changes get blamed for pre-existing failures, burning through all retry attempts.

**Fix:**
- New `baseline-check` stage runs before first story: `npm run build` + `npm test` (or configured equivalents)
- If baseline fails: halt with clear message ("Fix existing failures before running Hive Mind")
- Store baseline result in execution plan for audit trail
- Skip on `--skip-baseline` flag

**Files:** `src/orchestrator.ts`, new `src/stages/baseline-check.ts`

### 9. ENH-15: AI-First Manifest

See [manifest-plan.md](manifest-plan.md) for full design. Summary:
- New `src/manifest/generator.ts` with `updateManifest(hiveMindDir)`
- Two-part `.hive-mind/MANIFEST.md`: static navigation (~500 tokens) + auto-generated artifact inventory
- Called at stage boundaries in `orchestrator.ts` + `hive-mind manifest` CLI command

### 10. ENH-13: Checkpoint Sound Notification

**Problem:** Pipeline reaches checkpoint, writes file, exits silently. Human away from terminal doesn't know it's time to review.

**Fix:**
- New `src/utils/notify.ts` exporting `notifyCheckpoint()`
- Writes ASCII BEL (`\x07`) to stdout — works cross-platform including SSH
- Call at all 4 checkpoint exit points in `src/orchestrator.ts`
- `--silent` flag suppresses for CI/scripted environments

**Files:** new `src/utils/notify.ts`, `src/orchestrator.ts` (4 call sites), `src/index.ts` (`--silent` flag)

### 11. ENH-02: Dependency-Aware Story Scheduling

**Problem:** `getNextStory()` in `src/state/execution-plan.ts` returns first `not-started` story by array position. The `dependencies: string[]` field exists on every `Story` but is never read.

**Fix:**
- Modify `getNextStory()` to skip stories whose dependencies haven't all reached `status: "passed"`
- Add `getReadyStories()` that returns ALL stories with satisfied dependencies (needed by ENH-03)
- Add validation: detect circular dependencies at plan load time

**Files:** `src/state/execution-plan.ts` (modify `getNextStory`, add `getReadyStories`)

### Phase 3 Smoke Test Gate

**All Tier 1+2 must pass. Tier 3 = ENH-13 dogfood trial (recommended).**

**Tier 1 (Unit):**
- Agent output mode: `spawnClaude()` args do NOT include `--print`
- Cost tracker accumulates tokens per agent spawn, per story, and pipeline total
- Cost tracker handles missing/malformed usage data (returns 0, not crash)
- `--budget` flag halts pipeline when budget exceeded
- Baseline verification: halts with clear message if `npm run build` or `npm test` fail
- `--skip-baseline` flag bypasses baseline check
- Manifest file generated with correct structure at stage boundaries
- `getNextStory()` skips stories with unmet dependencies
- Circular dependency detection throws clear error at plan load time

**Tier 2 (Integration):**
- 3-story execution with dependency chain (S2→S1, S3→S2): verify execution order 1→2→3
- Failed dependency: S1 fails, S2 depends on S1 → S2 skipped, S3 (independent) still executes
- Cost tracking: after mocked pipeline run, cost summary appears in report
- BEL character (`\x07`) written to stdout at all 4 checkpoint exits

**Tier 3 (Dogfood trial):**
- Write PRD for ENH-13 (sound notification), run pipeline on it
- Estimated cost: ~$15-25
- Goal: learning, not productivity — document every friction point
- Pass criteria: pipeline completes without crash (code quality is manual judgment)

---

## Phase 4: Pipeline Quality

### 12. ENH-07: Synthesizer Split

**Problem:** The synthesizer is a single Opus agent doing 3 distinct jobs: story decomposition, AC generation, and EC generation. A single agent optimizing for all three produces lower-quality ACs/ECs.

**Fix — 3 focused agents replacing 1:**

| Agent | Model | Input | Output | Job |
|---|---|---|---|---|
| `planner` | Opus | Spec + role reports | Stories with metadata (id, title, specSections, dependencies, sourceFiles, complexity) | Decompose spec into stories |
| `ac-generator` | Sonnet | Per-story: step skeleton + spec sections | AC-0 through AC-N per story | Generate testable acceptance criteria |
| `ec-generator` | Sonnet | Per-story: step skeleton + ACs | EC-1 through EC-N per story | Generate binary exit criteria |

**Execution flow in `plan-stage.ts`:**
1. Spawn planner (Opus) → produces story skeletons in execution-plan.json
2. For each story, spawn ac-generator (Sonnet) → fills in ACs
3. For each story, spawn ec-generator (Sonnet) → fills in ECs
4. Assemble final step files from combined output

Steps 2 and 3 can run per-story in parallel (independent inputs).

**New agent types:** Add `planner`, `ac-generator`, `ec-generator` to `AgentType` union. Keep `synthesizer` as deprecated alias for backward compat.

**Files:**
- `src/types/agents.ts` — add 3 new agent types
- `src/agents/prompts.ts` — add AGENT_JOBS and AGENT_RULES for each
- `src/agents/model-map.ts` — assign models (Opus for planner, Sonnet for AC/EC)
- `src/stages/plan-stage.ts` — replace single synthesizer call (lines 124-168) with 3-agent pipeline

### 13. PRD-05: Code-Reviewer Agent

**Problem:** No automated code quality review. The verify stage checks functional correctness (ACs pass) but not code quality (readability, patterns, performance, security).

**When it runs:** After all stories are committed, during REPORT stage (before reporter agent). Reviews final committed code, not intermediate states.

**Agent config:**
- Type: `code-reviewer`
- Model: Sonnet (precise analysis)
- Input: All `impl-report.md` files + actual source files listed in `sourceFiles` per story
- Output: `.hive-mind/code-review-report.md`

**AGENT_RULES:**
1. CITE-LOCATION: Every finding must include `file:line` reference
2. SEVERITY: Classify as Critical / Warning / Suggestion
3. PATTERNS: Compare against `knowledge-base/` patterns if available
4. NO-STYLE-NITPICKS: Focus on logic, security, performance — not formatting
5. ACTIONABLE: Each finding must include a concrete fix recommendation

**Output format:**
```markdown
## Code Review Report

### Summary
| Severity | Count |
|----------|-------|
| Critical | 0 |
| Warning  | 2 |
| Suggestion | 5 |

### Findings

#### [Warning] Unbounded array growth in `src/parser.ts:42`
**Issue**: `results.push()` in loop with no size check
**Fix**: Add `if (results.length > MAX_RESULTS) break;`
```

**Integration:** Reporter agent receives `code-review-report.md` as additional input → findings appear in consolidated report.

**Files:**
- `src/types/agents.ts` — add `"code-reviewer"` to AgentType
- `src/agents/prompts.ts` — add AGENT_JOBS + AGENT_RULES
- `src/agents/model-map.ts` — assign Sonnet
- `src/stages/report-stage.ts` — spawn code-reviewer before reporter

### 14. PRD-06: Log-Summarizer Agent

**Problem:** `manager-log.jsonl` accumulates structured event data across the entire pipeline run, but nobody analyzes it. Retry patterns, parser confidence ratios, and failure chains are invisible.

**When it runs:** During REPORT stage, before reporter agent. Can run in parallel with code-reviewer (independent inputs).

**Agent config:**
- Type: `log-summarizer`
- Model: Haiku (pattern extraction from structured data — speed over depth)
- Input: `.hive-mind/manager-log.jsonl`
- Output: `.hive-mind/log-analysis.md`

**AGENT_RULES:**
1. PARSE-JSONL: Each line is one `ManagerLogEntry` JSON object
2. GROUP-BY-ACTION: Aggregate by `LogAction` type
3. TEMPORAL-PATTERNS: Identify retry cycles, escalation chains, time gaps
4. PARSER-CONFIDENCE: Report ratio of `"matched"` vs `"default"` confidence
5. CONCISE: Summary table first, details second

**Output format:**
```markdown
## Pipeline Log Analysis

### Event Summary
| Action | Count | Stories Affected |
|--------|-------|-----------------|
| VERIFY_ATTEMPT | 12 | US-01, US-03, US-05 |
| FAILED | 2 | US-03, US-05 |
| COMMITTED | 4 | US-01, US-02, US-04, US-06 |

### Parser Confidence
- Matched: 9/12 (75%)
- Default (fallback): 3/12 (25%)

### Retry Patterns
- US-03: 3 attempts → diagnostician at attempt 2 → PASS at attempt 3
- US-05: 3 attempts → FAILED (max attempts exhausted)
```

**Integration:** Reporter receives `log-analysis.md` as input → pipeline health metrics appear in consolidated report.

**Files:**
- `src/types/agents.ts` — add `"log-summarizer"` to AgentType
- `src/agents/prompts.ts` — add AGENT_JOBS + AGENT_RULES
- `src/agents/model-map.ts` — assign Haiku
- `src/stages/report-stage.ts` — spawn log-summarizer before reporter

### 17. ENH-16: Role-Report Feedback Loop

See [role-report-feedback-loop-plan.md](role-report-feedback-loop-plan.md) for full design. Summary:

**Problem:** Role-reports (analyst, architect, reviewer, security, tester) are generated during planning but never consumed by execution agents. Each agent re-derives insights from scratch, wasting tokens and risking missed specialist findings.

**Fix — Two parts:**

| Part | What | Key Change |
|------|------|------------|
| **A: Planning enrichment** | After role-reports generate, an enricher agent patches step files with structured findings (implementation guidance, security requirements, edge cases). AC consolidator gains a ## Gap Cases section from analyst/tester/reviewer reports. execution-plan.json gains `securityRisk`, `complexityJustification`, `dependencyImpact` fields. | New enricher agent (Sonnet), updated plan-stage pipeline |
| **B: Execution context** | During execution, role-reports are selectively injected into agent prompts via a mapping: implementer gets architect+security+analyst; tester gets tester-role+analyst+security; refactorer gets architect+reviewer; diagnostician gets architect+security+tester-role; learner gets all 5. | New `roleReportContents` in AgentConfig, `getRoleReportsForAgent()` helper, updated execute-build/verify/learn signatures |

**New agent types:** `enricher` (Sonnet) added to AgentType union.

**Files:**
- `src/types/agents.ts` — add `"enricher"` to AgentType, `roleReportContents` to AgentConfig
- `src/types/execution-plan.ts` — add `securityRisk`, `complexityJustification`, `dependencyImpact` to Story
- `src/agents/prompts.ts` — add ROLE_REPORT_MAPPING, `getRoleReportsForAgent()`, enricher job/rules, update `buildPrompt()`
- `src/agents/model-map.ts` — add `"enricher": "sonnet"`
- `src/stages/plan-stage.ts` — add `enrichStepFiles()` post-synthesis step, update AC consolidator
- `src/stages/execute-build.ts`, `execute-verify.ts`, `execute-learn.ts` — accept `roleReportsDir`, inject role-reports per mapping
- `src/orchestrator.ts` — thread `roleReportsDir` to execute-stage functions

### Phase 4 Smoke Test Gate

**All Tier 1+2 must pass. At least 1 Tier 3 dogfood run must complete without crash.**

**Tier 1 (Unit):**
- Synthesizer split: new agent types (`planner`, `ac-generator`, `ec-generator`) in `AgentType` union and `model-map.ts`
- Code-reviewer: receives impl reports + source files, produces review with `file:line` citations
- Log-summarizer: receives `manager-log.jsonl`, produces structured summary
- Role-report feedback: `getRoleReportsForAgent()` returns correct mapping per agent type
- Enricher agent: appends structured sections to step files without modifying existing content

**Tier 2 (Integration):**
- PLAN stage with synthesizer split: mock spawner → verify 3 agents spawned in correct order (planner → ac-gen → ec-gen)
- Role-report injection: mock spawner captures `roleReportContents` parameter → verify implementer gets architect+security+analyst, tester gets tester-role+analyst+security
- Step file enrichment: enricher output contains `## Implementation Guidance`, `## Security Requirements` sections
- AC consolidator receives role-report paths and produces `## Gap Cases` section

**Tier 3 (Dogfood):**
- Run PRD-05 (code-reviewer) through pipeline — natural self-test
- Run ENH-07 (synthesizer split) through pipeline
- Estimated cost: ~$30-50 total

---

## Phase 5: Execution Power

### 15. ENH-03: Parallel Story Execution

**Problem:** Stories execute one at a time. Independent stories with no mutual dependencies could run in parallel.

**Prerequisites:** ENH-02 (dependency scheduling) must land first — provides the dependency graph.

**Fix — Wave-based execution:**

1. **Build dependency graph** from `story.dependencies` field
2. **Topological sort** into waves — each wave contains stories whose dependencies are all satisfied
3. **Execute each wave** with `Promise.all()` (all stories in a wave run concurrently)
4. **Concurrency controls:**
   - `maxConcurrency` config option (default: wave size)
   - File-level mutex for `memory.md` writes (read-modify-write is not atomic)
   - Atomic read-modify-write for `execution-plan.json` updates

**Example:** 6 stories with deps `US-02→US-01`, `US-04→US-03`:
```
Wave 1: [US-01, US-03, US-05, US-06]  ← run in parallel
Wave 2: [US-02, US-04]                 ← run after wave 1 completes
```

**Concurrency safety:**
- `memory.md`: Add in-process mutex around `appendToMemory()` in `src/memory/memory-manager.ts`
- `execution-plan.json`: Use `writeFileAtomic()` with retry-on-conflict, or serialize updates through a queue
- `manager-log.jsonl`: Already append-only (`appendFileSync`) — safe for concurrent writes

**Files:**
- `src/orchestrator.ts` — replace sequential story loop (lines ~193-269) with wave executor
- `src/state/execution-plan.ts` — add `buildWaves(plan)`, `getReadyStories(plan)`
- `src/memory/memory-manager.ts` — add write mutex for `appendToMemory()`
- Config: `maxConcurrency` option via RD-03

### 16. FW-01: Sub-Task Decomposition

**Problem:** The `Story` type has no sub-task concept. The implementer receives an entire story as one atomic unit. For complex stories touching 5+ files, this leads to incomplete implementations and wasted verify cycles.

**Fix — Sub-tasks for high-complexity stories:**

**Type changes** (`src/types/execution-plan.ts`):
```typescript
export interface SubTask {
  id: string;                    // "US-01-T1", "US-01-T2"
  title: string;
  targetFiles: string[];         // subset of story.sourceFiles
  acceptanceCriteria: string[];  // subset of story's ACs
  exitCriteria: string[];        // subset of story's ECs
  status: "not-started" | "in-progress" | "passed" | "failed";
  attempts: number;
}

export interface Story {
  // ... existing fields ...
  subTasks?: SubTask[];          // optional — only for complexity: "high"
}
```

**Generation:** The synthesizer split (ENH-07) makes this natural — the `planner` agent marks stories as `complexity: "high"`, then a new step generates sub-tasks for those stories.

**Execution flow** (in `execute-build.ts` and `execute-verify.ts`):
```
If story.subTasks exists:
  For each subTask (sequential):
    1. BUILD: implementer receives subTask's targetFiles + ACs only
    2. VERIFY: tester-exec runs subTask's ACs only
    3. If FAIL: fix pipeline retries subTask only (not entire story)
    4. If PASS: mark subTask as passed, continue to next
  All subTasks passed → story passed
Else:
  Current behavior (whole-story build + verify)
```

**Key benefit:** Sub-task failure retries only the failed sub-task. A 5-file story with 1 failing sub-task retries only that sub-task's 1-2 files.

**Files:**
- `src/types/execution-plan.ts` — add `SubTask` interface, optional `subTasks` on `Story`
- `src/stages/plan-stage.ts` — sub-task generation for high-complexity stories
- `src/stages/execute-build.ts` — sub-task-aware build loop
- `src/stages/execute-verify.ts` — sub-task-aware verify loop
- `src/state/execution-plan.ts` — sub-task state management helpers

### Phase 5 Smoke Test Gate

**All Tier 1+2+3 must pass. Tier 3 is mandatory — this is the graduation test.**

**Tier 1 (Unit):**
- Independent stories spawn concurrently; dependent stories wait
- Failure in one parallel story doesn't crash siblings
- `maxConcurrency` config option respected
- Sub-task decomposition: high-complexity story split into `SubTask[]`
- Sub-task failure retried independently (not full story)
- Parent story marked "passed" only when all sub-tasks pass

**Tier 2 (Integration):**
- 5-story plan with 2 independent pairs + 1 dependent: mock spawner with artificial delays → verify parallel pairs execute concurrently (wall-clock < sequential)
- Race condition: parallel stories writing to `execution-plan.json` → atomic writes prevent corruption
- Sub-task lifecycle: 3-sub-task story, sub-task 2 fails → only sub-task 2 retried, sub-tasks 1+3 unchanged
- Memory mutex: concurrent `appendToMemory()` calls don't corrupt `memory.md`

**Tier 3 (Dogfood — MANDATORY):**
- Run ENH-03 (parallel execution) through pipeline WITH parallel execution enabled — pipeline uses its own new feature to build itself
- Run FW-01 (sub-task decomposition) — the implementation story should itself be decomposed into sub-tasks
- Estimated cost: ~$40-60 total

---

## Phase 6: Multi-Repo

> Multi-repo support enables Hive Mind to orchestrate changes across multiple repositories in a single pipeline run. The full design is in `.hive-mind/design/multi-repo-enhancements.md` — this section summarizes the 3 MVP items covering all 7 design components across 5 implementation waves.

**Prerequisites:** Phase 1 (spawner upgrade for CWD threading), Phase 3 (ENH-02 dependency scheduling for module-aware ordering), Phase 5 (ENH-03 parallel execution for wave-based module execution).

**Backward compatibility:** Single-repo mode is unchanged. When no `modules` field exists in the PRD metadata, all behavior defaults to current single-repo behavior.

### 18. ENH-11: Multi-Repo Module Config + CWD Threading

**Problem:** The pipeline assumes a single working directory. All agent spawns, file operations, and commit stages operate on `process.cwd()`. Multi-repo workflows require explicit CWD per module.

**Fix — Two design components:**

**Component 1: Module Configuration (Wave 1)**
- PRD metadata gains an optional `modules` array declaring each repo module:
  ```yaml
  modules:
    - name: shared-lib
      path: ../shared-lib        # relative to PRD location
      role: dependency           # dependency | consumer | standalone
    - name: web-app
      path: ../web-app
      role: consumer
  ```
- Schema version detection: if `modules` present, schema ≥ v2; if absent, backward-compatible v1
- Module path resolution: relative paths resolved against PRD location at parse time

**Component 2: CWD Threading (Wave 2)**
- `orchestrator.ts`: thread `moduleCwd` through stage dispatch
- `spawner.ts`: `spawnAgent()` accepts optional `cwd` parameter, passed to `child_process.spawn`
- Execute stages (`execute-build.ts`, `execute-verify.ts`, `execute-commit.ts`): receive and use `moduleCwd` instead of `process.cwd()`
- Story type gains optional `module?: string` field linking each story to its target module

**Files:** `src/types/execution-plan.ts`, `src/orchestrator.ts`, `src/agents/spawner.ts`, `src/stages/execute-build.ts`, `src/stages/execute-verify.ts`, `src/stages/execute-commit.ts`, `src/index.ts` (PRD parser)

### 19. FW-14: Integration Verification Stage

**Problem:** After implementing stories across multiple modules, there's no verification that the modules work together. Each module's tests pass in isolation, but cross-module contracts (API types, shared interfaces, import paths) may be broken.

**Fix — Integration verification (Wave 4):**
- New `integration-verify` stage runs after all module stories are committed
- Spawns a verification agent per module boundary (e.g., shared-lib ↔ web-app)
- Agent runs cross-module type checks (`tsc --noEmit` across module boundaries) and integration tests if configured
- Results feed into the report stage alongside per-module verify results
- Skipped automatically in single-repo mode (no modules = no boundaries)

**Files:** new `src/stages/integration-verify.ts`, `src/orchestrator.ts` (stage dispatch), `src/types/execution-plan.ts` (integration verify results)

### 20. Module-Aware Story Ordering + Contracts

**Problem:** The dependency scheduler (ENH-02) and wave executor (ENH-03) operate on story-level dependencies only. With multi-repo, stories in a consumer module may depend on stories in a dependency module being completed first.

**Fix — Two design components:**

**Component 3: Module-Aware Story Ordering (Wave 3)**
- Extend topological sort to respect module roles: `dependency` module stories sort before `consumer` module stories
- `buildWaves()` gains module awareness: stories from a dependency module cannot be in the same wave as consumer stories that depend on them
- Cross-module dependency edges are inferred from module `role` declarations (explicit `dependencies` field still supported for fine-grained control)

**Component 4: Inter-Module Contracts (Wave 3)**
- Stories can declare `exports` and `imports` to define cross-module contracts
- Contract validation at plan load time: every `import` must match an `export` from a dependency module
- Contract types are advisory (help the implementer agent understand boundaries) rather than enforced at runtime

**Component 5: Synthesizer Updates (Wave 5)**
- Planner agent (from ENH-07 synthesizer split) gains module awareness: generates stories scoped to modules
- AC/EC generators receive module context (which module, what role, what contracts)
- Step files include module metadata for implementer context

**Files:** `src/state/execution-plan.ts` (module-aware topo sort), `src/types/execution-plan.ts` (contract types), `src/stages/plan-stage.ts` (synthesizer module awareness)

### Phase 6 Smoke Test Gate

**All Tier 1+2 must pass. Tier 3 dogfood recommended.**

**Tier 1 (Unit):**
- Module parsing: PRD with `modules` array produces correct module config objects
- CWD resolution: relative module paths resolved correctly against PRD location
- Backward compat: PRD without `modules` field produces single-module default (identical to current behavior)
- Topo sort: dependency-module stories sort before consumer-module stories
- Schema version: `modules` present → schema v2; absent → schema v1 (no migration needed)
- Contract validation: import without matching export throws clear error at plan load time

**Tier 2 (Integration):**
- Multi-module execution with mocked spawner: verify `cwd` parameter passed correctly to each agent spawn
- Story ordering: 4 stories across 2 modules (2 dep, 2 consumer) → dep stories execute in earlier waves
- Integration verifier spawned after all module stories committed (mocked spawner captures call)
- Single-repo regression: existing test suite passes unchanged (no `modules` = no behavioral change)

**Tier 3 (Dogfood):**
- Run a 2-module PRD through the pipeline (e.g., shared-lib exporting a utility + consumer importing it)
- Estimated cost: ~$20-35
- Pass criteria: pipeline completes, CWD correct per module, integration verify runs, stories in correct order

---

## Post-MVP Items (Deferred)

| Tier | Items | Rationale |
|---|---|---|
| **Next** | ENH-10 (reverify with updated ACs), RD-07 (mid-story checkpoints) | Useful but not critical for production |
| **Later** | RD-06 (provider abstraction), FW-03 (constitution), RD-09 (CLI help) | Not urgent |
| **Polish** | ENH-01, ENH-04, ENH-05, ENH-14, FW-04–FW-07, FW-11, FW-15, FW-16, RD-08, RD-10, RD-11 | P2 items |
| **Vision** | PRD-01–04, PRD-07–20, ENH-06, ENH-08–09, ENH-12, FW-08–10, FW-12–13 | P3 future |

---

## Post-MVP Maturity

| Dimension | Today | After MVP |
|---|---|---|
| Reliability | Fragile — halts on failures | Retry + recovery + baseline check |
| Cost awareness | None | Budget controls + per-stage tracking |
| Output parsing | 5-level regex cascade | JSON-first with regex fallback |
| Parallelism | Sequential only | Wave-based story execution |
| Task granularity | Whole-story only | Sub-task decomposition for complex stories |
| Story scheduling | Array position | Dependency-aware |
| Planning quality | Single monolithic synthesizer | 3 focused agents (planner/AC/EC) |
| Code quality | No review | Automated code review in report stage |
| Pipeline observability | Raw JSONL, unanalyzed | Log analysis with patterns + recommendations |
| Role-report utilization | Generated but unused by execution agents | Injected into agent prompts via mapping + step file enrichment |
| Human notification | Silent checkpoint | Sound notification (BEL) |
| Agent navigation | Explore ~10 files | Single manifest file |
| Multi-repo support | Single repo only | Module-aware orchestration with CWD threading + integration verification |

---

## Verification

### Continuous (every code change)
1. `npm run build` — TypeScript compiles cleanly
2. `npm test` — all existing tests pass (no regressions)
3. All Tier 1 unit tests for the current phase pass

### Phase Boundary Gates
Each phase has a formal smoke test gate (see per-phase sections above). The gate criteria are:
- **Phases 1-2:** All Tier 1 + Tier 2 must pass
- **Phase 2:** Tier 3 is MANDATORY (hello-world live pipeline run)
- **Phases 3-4:** All Tier 1 + Tier 2 must pass; Tier 3 dogfood recommended
- **Phase 5:** All Tier 1 + Tier 2 + Tier 3 must pass (graduation test)
- **Phase 6:** All Tier 1 + Tier 2 must pass; Tier 3 dogfood recommended (2-module PRD)

### Dogfooding Checkpoints
- **Phase 3:** ENH-13 dogfood trial — document friction points, add regression tests from failures
- **Phase 4:** At least 1 dogfood run (PRD-05 or ENH-07) must complete without crash
- **Phase 5:** ENH-03 and FW-01 dogfood runs are mandatory — pipeline builds its own orchestration
- **Phase 6:** 2-module PRD dogfood trial — verify CWD threading, module ordering, and integration verification work end-to-end

### Per-Phase Functional Verification
1. Phase 1: `.hivemindrc.json` overrides work; spawner produces JSON output
2. Phase 2: Retry with backoff on simulated failure; `--from` and `--skip-failed` work; JSON status parsing
3. Phase 3: Cost displayed per stage; baseline check halts on pre-existing failures; manifest generates; BEL sounds at checkpoint; dependency ordering respected
4. Phase 4: Synthesizer split produces equivalent quality; code-review-report.md and log-analysis.md generated; step files contain enrichment sections from role-reports; execution agents receive role-report context in prompts
5. Phase 5: Independent stories run in parallel waves; high-complexity stories split into sub-tasks with independent retry
6. Phase 6: Module config parsed from PRD; CWD threaded to spawner and execute stages; module-aware story ordering; integration verification runs after all module stories; single-repo behavior unchanged
