# MVP Plan: Hive Mind v3 Production Readiness

> 15 items across 5 phases to move Hive Mind from "interesting prototype" to "production-usable."

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

## MVP Overview: 15 Items in 5 Phases

| # | ID | Name | Phase | Effort | Detailed Plan |
|---|---|---|---|---|---|
| 1 | RD-03 | Config file support | 1: Foundation | Small-Medium | Below |
| 2 | — | Spawner upgrade (spawn + JSON + tools) | 1: Foundation | Medium | [spawner-upgrade-plan.md](spawner-upgrade-plan.md) |
| 3 | RD-01 | Exponential backoff + retry | 2: Reliability | Small | Below |
| 4 | RD-04 | Structured output parsing | 2: Reliability | Medium | Below |
| 5 | RD-02 | Graceful error recovery | 2: Reliability | Medium | Below |
| 6 | RD-05 | Cost/token tracking | 3: Visibility & DX | Medium | Below |
| 7 | FW-02 | Clean baseline verification | 3: Visibility & DX | Small | Below |
| 8 | ENH-15 | AI-first manifest | 3: Visibility & DX | Small | [manifest-plan.md](manifest-plan.md) |
| 9 | ENH-13 | Checkpoint sound notification | 3: Visibility & DX | Small | Below |
| 10 | ENH-02 | Dependency-aware scheduling | 3: Visibility & DX | Small | Below |
| 11 | ENH-07 | Synthesizer split | 4: Pipeline Quality | Medium | Below |
| 12 | PRD-05 | Code-reviewer agent | 4: Pipeline Quality | Small-Medium | Below |
| 13 | PRD-06 | Log-summarizer agent | 4: Pipeline Quality | Small | Below |
| 14 | ENH-03 | Parallel story execution | 5: Execution Power | Large | Below |
| 15 | FW-01 | Sub-task decomposition | 5: Execution Power | Large | Below |

### Dependency Graph

```
Phase 1:  RD-03 (config) ──────┐
          Spawner upgrade ──────┼── Phase 2:  RD-01 (backoff)
                                │             RD-04 (structured output)
                                │             RD-02 (error recovery)
                                │
                                ├── Phase 3:  RD-05 (cost tracking)
                                │             FW-02 (baseline check)
                                │             ENH-15 (manifest)
                                │             ENH-13 (sound notification)
                                │             ENH-02 (dependency scheduling)
                                │
                                ├── Phase 4:  ENH-07 (synthesizer split)
                                │             PRD-05 (code-reviewer)
                                │             PRD-06 (log-summarizer)
                                │
                                └── Phase 5:  ENH-03 (parallel execution) ← needs ENH-02
                                              FW-01 (sub-tasks) ← benefits from ENH-02
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

---

## Phase 3: Visibility & DX

### 6. RD-05: Cost/Token Tracking

**Problem:** Zero token tracking. 25-35+ agent calls per story with no cost visibility.

**Fix:**
- Parse token usage from Claude CLI JSON output (from spawner upgrade)
- Add `tokensUsed` field to `AgentResult` interface
- Log tokens to `manager-log.jsonl` with each agent invocation
- Display cumulative cost at end of each stage
- Add `--budget <dollars>` CLI flag for spend caps

**Files:** `src/agents/spawner.ts`, new `src/utils/cost-tracker.ts`

### 7. FW-02: Clean Baseline Verification

**Problem:** EXECUTE stage assumes codebase compiles and existing tests pass. If they don't, implementer's changes get blamed for pre-existing failures, burning through all retry attempts.

**Fix:**
- New `baseline-check` stage runs before first story: `npm run build` + `npm test` (or configured equivalents)
- If baseline fails: halt with clear message ("Fix existing failures before running Hive Mind")
- Store baseline result in execution plan for audit trail
- Skip on `--skip-baseline` flag

**Files:** `src/orchestrator.ts`, new `src/stages/baseline-check.ts`

### 8. ENH-15: AI-First Manifest

See [manifest-plan.md](manifest-plan.md) for full design. Summary:
- New `src/manifest/generator.ts` with `updateManifest(hiveMindDir)`
- Two-part `.hive-mind/MANIFEST.md`: static navigation (~500 tokens) + auto-generated artifact inventory
- Called at stage boundaries in `orchestrator.ts` + `hive-mind manifest` CLI command

### 9. ENH-13: Checkpoint Sound Notification

**Problem:** Pipeline reaches checkpoint, writes file, exits silently. Human away from terminal doesn't know it's time to review.

**Fix:**
- New `src/utils/notify.ts` exporting `notifyCheckpoint()`
- Writes ASCII BEL (`\x07`) to stdout — works cross-platform including SSH
- Call at all 4 checkpoint exit points in `src/orchestrator.ts`
- `--silent` flag suppresses for CI/scripted environments

**Files:** new `src/utils/notify.ts`, `src/orchestrator.ts` (4 call sites), `src/index.ts` (`--silent` flag)

### 10. ENH-02: Dependency-Aware Story Scheduling

**Problem:** `getNextStory()` in `src/state/execution-plan.ts` returns first `not-started` story by array position. The `dependencies: string[]` field exists on every `Story` but is never read.

**Fix:**
- Modify `getNextStory()` to skip stories whose dependencies haven't all reached `status: "passed"`
- Add `getReadyStories()` that returns ALL stories with satisfied dependencies (needed by ENH-03)
- Add validation: detect circular dependencies at plan load time

**Files:** `src/state/execution-plan.ts` (modify `getNextStory`, add `getReadyStories`)

---

## Phase 4: Pipeline Quality

### 11. ENH-07: Synthesizer Split

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

### 12. PRD-05: Code-Reviewer Agent

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

### 13. PRD-06: Log-Summarizer Agent

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

---

## Phase 5: Execution Power

### 14. ENH-03: Parallel Story Execution

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

### 15. FW-01: Sub-Task Decomposition

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

---

## Post-MVP Items (Deferred)

| Tier | Items | Rationale |
|---|---|---|
| **Next** | ENH-10 (reverify with updated ACs), RD-07 (mid-story checkpoints) | Useful but not critical for production |
| **Later** | RD-06 (provider abstraction), FW-03 (constitution), RD-09 (CLI help) | Not urgent |
| **Polish** | ENH-01, ENH-04, ENH-05, ENH-14, FW-04–FW-07, FW-11, FW-15, FW-16, RD-08, RD-10, RD-11 | P2 items |
| **Vision** | PRD-01–04, PRD-07–20, ENH-06, ENH-08–09, ENH-11–12, FW-08–10, FW-12–14 | P3 future |

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
| Human notification | Silent checkpoint | Sound notification (BEL) |
| Agent navigation | Explore ~10 files | Single manifest file |

---

## Verification

1. `npm run build` — TypeScript compiles cleanly after each phase
2. `npm test` — all existing tests pass (no regressions)
3. Phase 1: `.hivemindrc.json` overrides work; spawner produces JSON output
4. Phase 2: Retry with backoff on simulated failure; `--from` and `--skip-failed` work; JSON status parsing
5. Phase 3: Cost displayed per stage; baseline check halts on pre-existing failures; manifest generates; BEL sounds at checkpoint; dependency ordering respected
6. Phase 4: Synthesizer split produces equivalent quality; code-review-report.md and log-analysis.md generated
7. Phase 5: Independent stories run in parallel waves; high-complexity stories split into sub-tasks with independent retry
