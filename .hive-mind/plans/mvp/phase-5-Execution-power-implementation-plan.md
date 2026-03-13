╭─────────────────────────────────────────────────────────────────────────────────────────╮
│ Plan to implement                                                                       │
│                                                                                         │
│ Phase 5: Execution Power — Implementation Plan                                          │
│                                                                                         │
│ Context                                                                                 │
│                                                                                         │
│ Phase 4 is complete (15/20 MVP items done, all K1-K5 bugs fixed, 247 tests passing, 41  │
│ files, 0 TS errors). Phase 5 has 2 items — the highest-risk in the MVP plan             │
│ ("graduation tests"). This plan implements them one at a time with dogfood between      │
│ each.                                                                                   │
│                                                                                         │
│ Approach: ENH-03 first → dogfood → FW-01 second → dogfood. FW-01 is deferrable — if     │
│ ENH-03 dogfood reveals plan-state corruption, test regressions, or >2 stories of        │
│ rework, defer FW-01 to Phase 6.                                                         │
│                                                                                         │
│ Inputs Consulted                                                                        │
│                                                                                         │
│ - Memory (feedback_workflow_reference.md): Follow workflow.md PRE-PHASE checklist       │
│ - Workflow (mvp/workflow.md): Phase lifecycle protocol, standard plan template          │
│ - Knowledge base (01-proven-patterns.md): P23 (wave parallelism), P32 (config           │
│ threading), P34 (strict output contract), P37 (multi-agent pipeline), P39 (non-fatal    │
│ enrichment), P44 (loud failure)                                                         │
│ - Knowledge base (02-anti-patterns.md): F13 (duplication), F30 (in-memory without disk  │
│ flush), F31 (return-type caller audit), F33 (ambiguous locations)                       │
│ - Phase 4 learnings: Parameter threading is tedious (~20min), non-fatal enrichment      │
│ works, stdin+Write tool fixes validated                                                 │
│ - Shared memory (memory.md): Config threading via params (P32), getReadyStories ready   │
│ for ENH-03, code correctness 100% across 6 runs                                         │
│ - mvp-plan.md: ENH-03 + FW-01 scope, Phase 5 Tier 3 mandatory                           │
│ - Double-critique pipeline (P5): 2 rounds, 18 findings total, all incorporated below    │
│                                                                                         │
│ ---                                                                                     │
│ Phase 5A: ENH-03 — Parallel Story Execution                                             │
│                                                                                         │
│ Goal                                                                                    │
│                                                                                         │
│ Replace sequential story execution with wave-based parallelism. Independent stories run │
│  concurrently within bounded concurrency limits.                                        │
│                                                                                         │
│ Items                                                                                   │
│                                                                                         │
│ ENH-03: Parallel Story Execution                                                        │
│                                                                                         │
│ Files to create:                                                                        │
│                                                                                         │
│ ┌──────────────────────────┬──────────────────────────────────────────────────────────┐ │
│ │           File           │                         Purpose                          │ │
│ ├──────────────────────────┼──────────────────────────────────────────────────────────┤ │
│ │                          │ Mutex class (serialization) + runWithConcurrency(tasks,  │ │
│ │ src/utils/concurrency.ts │ limit) (bounded parallelism, extracted from spawner      │ │
│ │                          │ pattern)                                                 │ │
│ └──────────────────────────┴──────────────────────────────────────────────────────────┘ │
│                                                                                         │
│ Files to modify:                                                                        │
│                                                                                         │
│ File: src/config/schema.ts                                                              │
│ What Changes: Add maxConcurrency: number to HiveMindConfig interface (line 3) +         │
│   DEFAULT_CONFIG (line 52, default: 3)                                                  │
│ ────────────────────────────────────────                                                │
│ File: src/config/loader.ts                                                              │
│ What Changes: Add maxConcurrency to positiveNumbers validation array + return mapping   │
│ in                                                                                      │
│   loadConfig                                                                            │
│ ────────────────────────────────────────                                                │
│ File: src/state/execution-plan.ts                                                       │
│ What Changes: Add "not-started" to VALID_TRANSITIONS["in-progress"] (line 6) for crash  │
│   recovery. Add filterNonOverlapping(stories) greedy wave construction. Add             │
│   resetCrashedStories(plan) function.                                                   │
│ ────────────────────────────────────────                                                │
│ File: src/orchestrator.ts                                                               │
│ What Changes: MAJOR: Replace lines 239-337 with wave executor. Extract                  │
│ executeOneStory().                                                                      │
│   Add story-ID-prefixed console output.                                                 │
│ ────────────────────────────────────────                                                │
│ File: src/stages/execute-verify.ts                                                      │
│ What Changes: Remove internal saveExecutionPlan calls (lines 51-57). Track attempts     │
│   internally, return via existing VerifyResult.attempts field.                          │
│ ────────────────────────────────────────                                                │
│ File: src/agents/spawner.ts                                                             │
│ What Changes: Extract worker-pool pattern (lines 87-101) into runWithConcurrency in     │
│   concurrency.ts. Refactor spawnAgentsParallel to use it.                               │
│                                                                                         │
│ Key Design Decisions                                                                    │
│                                                                                         │
│ 1. Dynamic waves — After each wave, call getReadyStories(plan) for next wave. Handles   │
│ failures gracefully.                                                                    │
│ 2. Greedy wave construction with file-overlap filtering — Iterate ready stories in plan │
│  order. For each candidate, check sourceFiles overlap against stories already selected  │
│ for the wave. If overlap, defer to next wave. Worst case degrades to sequential         │
│ (current behavior = no regression). Post-BUILD conflict detection: parse impl-reports   │
│ for actual files modified; if actual files overlap between wave stories, log warning.   │
│ 3. executeOneStory() returns results, never mutates plan — Returns StoryExecutionResult │
│  { storyId, passed, commitHash?, errorMessage?, attempts }. Wave executor owns all plan │
│  state mutations.                                                                       │
│ 4. runVerify stops writing to plan file — Currently execute-verify.ts:51-57 calls       │
│ incrementAttempts + saveExecutionPlan inside the verify loop. Refactor: track attempts  │
│ internally, return count in VerifyResult.attempts. Wave executor applies                │
│ incrementAttempts after story completes. This eliminates the planMutex-in-runVerify     │
│ complexity entirely.                                                                    │
│ 5. Post-wave serialization for COMMIT, LEARN, and plan writes:                          │
│ Wave N:                                                                                 │
│   BUILD+VERIFY in parallel (via runWithConcurrency, bounded by maxConcurrency)          │
│     └─ Each story returns StoryExecutionResult                                          │
│                                                                                         │
│   Sequential post-wave (wave executor loop):                                            │
│     1. For each passed story: runCommit() → git add/commit (serialized, no git races)   │
│     2. Update plan state: apply all results (passed/failed/attempts/commitHash)         │
│     3. saveExecutionPlan once (single disk write per wave)                              │
│     4. For each story (even failed): runLearn() (serialized, no memory.md races)        │
│     5. costTracker.enforceBudget() (single check per wave)                              │
│ 6. Promise.allSettled for wave execution — One story crash doesn't abort the wave.      │
│ Rejected promises → mark story "failed" with error. Fulfilled promises → process        │
│ result.                                                                                 │
│ 7. Crash recovery — At top of runExecuteStage, call resetCrashedStories(plan) to reset  │
│ any "in-progress" stories back to "not-started". Add "not-started" to                   │
│ VALID_TRANSITIONS["in-progress"] with comment explaining crash-recovery semantics.      │
│ 8. Story-ID-prefixed console output — All console.log in execute stages prefixed with   │
│ [US-XX] for readability under parallelism. appendLogEntry uses appendFileSync which is  │
│ safe for concurrent small writes — document this.                                       │
│ 9. Budget enforcement — Check budget after wave completes (not per-story). No mechanism │
│  to cancel in-flight agents mid-wave — accept this limitation and document it.          │
│ CostTracker.recordAgentCost uses Array.push which is safe under Node.js single-threaded │
│  event loop — no mutex needed, but document the invariant.                              │
│                                                                                         │
│ Execution Order                                                                         │
│                                                                                         │
│ Step 1: Add concurrency.ts utility (new file, no behavior change)                       │
│ - Mutex class: promise-based, FIFO queue, runExclusive(fn)                              │
│ - runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number):                 │
│ Promise<PromiseSettledResult<T>[]> — extracted from spawnAgentsParallel worker-pool     │
│ pattern                                                                                 │
│ - Write tests first (mutex.test.ts, concurrency.test.ts)                                │
│                                                                                         │
│ Step 2: Refactor spawnAgentsParallel to use runWithConcurrency (no behavior change)     │
│ - Import runWithConcurrency from concurrency.ts                                         │
│ - Replace inline worker-pool code (spawner.ts:87-101)                                   │
│ - Run npm test — verify no regressions                                                  │
│                                                                                         │
│ Step 3: Add maxConcurrency to config (no behavior change)                               │
│ - schema.ts: Add to HiveMindConfig interface + DEFAULT_CONFIG (default: 3)              │
│ - loader.ts: Add to positiveNumbers array + return mapping                              │
│ - Write config loader tests                                                             │
│                                                                                         │
│ Step 4: Add wave-construction helpers to execution-plan.ts                              │
│ - resetCrashedStories(plan): ExecutionPlan — reset in-progress → not-started            │
│ - filterNonOverlapping(stories: Story[]): Story[] — greedy wave construction by         │
│ sourceFiles                                                                             │
│ - Add "not-started" to VALID_TRANSITIONS["in-progress"]                                 │
│ - Write tests for each helper                                                           │
│                                                                                         │
│ Step 5: Refactor runVerify — remove internal plan writes (behavior change: no side      │
│ effects)                                                                                │
│ - Remove loadExecutionPlan + incrementAttempts + saveExecutionPlan from lines 51-57     │
│ - Track attempts via local counter (already done at line 41: let attempt = 0)           │
│ - Return attempts via existing VerifyResult.attempts field                              │
│ - Update existing execute-verify tests                                                  │
│ - Run npm test — verify no regressions                                                  │
│                                                                                         │
│ Step 6: Extract executeOneStory() + wave executor (core change)                         │
│ - Extract lines 246-334 of orchestrator.ts into executeOneStory() returning             │
│ StoryExecutionResult                                                                    │
│ - executeOneStory does BUILD + VERIFY only (no COMMIT, no LEARN, no plan mutation)      │
│ - Replace sequential while-loop with:                                                   │
│ resetCrashedStories(plan);                                                              │
│ while (true) {                                                                          │
│   const ready = getReadyStories(plan);                                                  │
│   const wave = filterNonOverlapping(ready);                                             │
│   if (wave.length === 0) break;                                                         │
│                                                                                         │
│   // Mark in-progress + save                                                            │
│   for (const s of wave) plan = updateStoryStatus(plan, s.id, "in-progress");            │
│   saveExecutionPlan(planPath, plan);                                                    │
│                                                                                         │
│   // Parallel BUILD+VERIFY                                                              │
│   const tasks = wave.map(s => () => executeOneStory(s, hiveMindDir, config,             │
│ costTracker, roleReportsDir));                                                          │
│   const settled = await runWithConcurrency(tasks, config.maxConcurrency);               │
│                                                                                         │
│   // Sequential post-wave: COMMIT → plan update → LEARN                                 │
│   for (const [i, result] of settled.entries()) {                                        │
│     const story = wave[i];                                                              │
│     if (result.status === "rejected") {                                                 │
│       plan = updateStoryStatus(plan, story.id, "failed");                               │
│       // ... error logging                                                              │
│     } else if (result.value.passed) {                                                   │
│       const commitResult = await runCommit(story, ...);                                 │
│       plan = updateStoryStatus(plan, story.id, "passed");                               │
│       // ... commit hash, log entries                                                   │
│     } else {                                                                            │
│       plan = updateStoryStatus(plan, story.id, "failed");                               │
│       // ... failure logging                                                            │
│     }                                                                                   │
│   }                                                                                     │
│   saveExecutionPlan(planPath, plan);                                                    │
│                                                                                         │
│   // Sequential LEARN                                                                   │
│   for (const story of wave) await runLearn(story, ...);                                 │
│                                                                                         │
│   costTracker?.enforceBudget();                                                         │
│ }                                                                                       │
│ - Write wave-executor tests (see test plan below)                                       │
│                                                                                         │
│ Tests to Write (ENH-03)                                                                 │
│                                                                                         │
│ Test File: __tests__/utils/concurrency.test.ts (NEW)                                    │
│ Tests: ~10                                                                              │
│ Coverage: Mutex acquire/release, FIFO ordering, runExclusive success/error,             │
│   runWithConcurrency bounded limit, all-settle behavior                                 │
│ ────────────────────────────────────────                                                │
│ Test File: __tests__/orchestrator/wave-executor.test.ts (NEW)                           │
│ Tests: ~12                                                                              │
│ Coverage: Single story backward compat, two independent stories same wave, dependent    │
│ story                                                                                   │
│   waits, failed dep blocks dependent, COMMIT serialized, maxConcurrency=1 sequential,   │
│   Promise.allSettled partial failure, plan state consistent, LEARN runs for all, crash  │
│   recovery resets in-progress, file overlap defers story, budget enforcement after wave │
│ ────────────────────────────────────────                                                │
│ Test File: __tests__/state/dependency-scheduling.test.ts (EXTEND)                       │
│ Tests: ~4                                                                               │
│ Coverage: resetCrashedStories, filterNonOverlapping, diamond deps across waves, overlap │
│                                                                                         │
│   detection                                                                             │
│ ────────────────────────────────────────                                                │
│ Test File: __tests__/config/loader.test.ts (EXTEND)                                     │
│ Tests: ~2                                                                               │
│ Coverage: maxConcurrency defaults to 3, validation rejects negative                     │
│ ────────────────────────────────────────                                                │
│ Test File: __tests__/stages/execute-verify.test.ts (UPDATE)                             │
│ Tests: ~2                                                                               │
│ Coverage: Verify no longer calls saveExecutionPlan, attempts returned in result         │
│                                                                                         │
│ Target: ~277 tests (247 current + ~30 new)                                              │
│                                                                                         │
│ Smoke Test Gate (from mvp-plan.md)                                                      │
│                                                                                         │
│ - Tier 1 (Unit): All tests pass after each step                                         │
│ - Tier 2 (Integration): Wave executor with mocked agents                                │
│ - Tier 3 (Dogfood — MANDATORY): Real pipeline run with 3+ stories, at least one         │
│ parallel wave                                                                           │
│                                                                                         │
│ Dogfood Strategy (ENH-03)                                                               │
│                                                                                         │
│ - PRD: Simple project in $TEMP (not hive-mind-v3). Must produce 3+ stories with         │
│ dependency graph enabling parallelism. Example: US-01 (no deps), US-03 (no deps) → Wave │
│  1 parallel; US-02 (deps US-01) → Wave 2.                                               │
│ - Verify: manager-log.jsonl timestamps show concurrent BUILD_COMPLETE in Wave 1.        │
│ execution-plan.json consistent. No memory.md corruption. Git commits sequential.        │
│ - Estimated cost: ~$10-20                                                               │
│                                                                                         │
│ Risk Mitigations (informed by Phase 4 learnings + critique)                             │
│                                                                                         │
│ ┌───────────────────┬────────────────────────────────────────────────────────────────┐  │
│ │       Risk        │                           Mitigation                           │  │
│ ├───────────────────┼────────────────────────────────────────────────────────────────┤  │
│ │ Plan-state races  │ executeOneStory is pure — returns results, never writes plan.  │  │
│ │                   │ All plan I/O serialized in wave executor.                      │  │
│ ├───────────────────┼────────────────────────────────────────────────────────────────┤  │
│ │ Git index races   │ COMMIT serialized post-wave. Never concurrent git operations.  │  │
│ ├───────────────────┼────────────────────────────────────────────────────────────────┤  │
│ │ memory.md         │ LEARN serialized post-wave. Sequential runLearn calls.         │  │
│ │ corruption        │                                                                │  │
│ ├───────────────────┼────────────────────────────────────────────────────────────────┤  │
│ │ Source file       │ Greedy wave filtering by sourceFiles. Post-BUILD conflict      │  │
│ │ overlap           │ detection via impl-report parsing.                             │  │
│ ├───────────────────┼────────────────────────────────────────────────────────────────┤  │
│ │ Crash recovery    │ resetCrashedStories() at stage entry. VALID_TRANSITIONS        │  │
│ │                   │ updated.                                                       │  │
│ ├───────────────────┼────────────────────────────────────────────────────────────────┤  │
│ │ Budget overrun    │ Accept limitation — can't cancel in-flight agents. Enforce     │  │
│ │ mid-wave          │ after wave.                                                    │  │
│ ├───────────────────┼────────────────────────────────────────────────────────────────┤  │
│ │ runVerify plan    │ Removed entirely — track attempts locally, return in result.   │  │
│ │ writes            │                                                                │  │
│ ├───────────────────┼────────────────────────────────────────────────────────────────┤  │
│ │ Console log       │ Story-ID prefix on all output.                                 │  │
│ │ interleaving      │                                                                │  │
│ └───────────────────┴────────────────────────────────────────────────────────────────┘  │
│                                                                                         │
│ ---                                                                                     │
│ Phase 5B: FW-01 — Sub-task Decomposition                                                │
│                                                                                         │
│ Goal                                                                                    │
│                                                                                         │
│ High-complexity stories get decomposed into 2-4 sub-tasks at plan stage. Each sub-task  │
│ has independent build→verify with per-sub-task retry.                                   │
│                                                                                         │
│ Items                                                                                   │
│                                                                                         │
│ FW-01: Sub-task Decomposition                                                           │
│                                                                                         │
│ Files to create:                                                                        │
│                                                                                         │
│ ┌────────────────────────────────────────┬─────────┐                                    │
│ │                  File                  │ Purpose │                                    │
│ ├────────────────────────────────────────┼─────────┤                                    │
│ │ (none — all changes in existing files) │         │                                    │
│ └────────────────────────────────────────┴─────────┘                                    │
│                                                                                         │
│ Files to modify:                                                                        │
│                                                                                         │
│ ┌────────────────────────────────┬────────────────────────────────────────────────────┐ │
│ │              File              │                    What Changes                    │ │
│ ├────────────────────────────────┼────────────────────────────────────────────────────┤ │
│ │                                │ Add SubTask interface: { id, title, description,   │ │
│ │ src/types/execution-plan.ts    │ sourceFiles, status, attempts, maxAttempts }. Add  │ │
│ │                                │ optional subTasks?: SubTask[] to Story.            │ │
│ ├────────────────────────────────┼────────────────────────────────────────────────────┤ │
│ │ src/types/agents.ts            │ Add "decomposer" to AgentType union                │ │
│ ├────────────────────────────────┼────────────────────────────────────────────────────┤ │
│ │ src/agents/prompts.ts          │ Add decomposer rules (focused on splitting by file │ │
│ │                                │  boundaries, producing JSON output)                │ │
│ ├────────────────────────────────┼────────────────────────────────────────────────────┤ │
│ │ src/agents/tool-permissions.ts │ Add "decomposer" → OUTPUT_TOOLS                    │ │
│ ├────────────────────────────────┼────────────────────────────────────────────────────┤ │
│ │ src/config/schema.ts           │ Add "decomposer": "sonnet" to                      │ │
│ │                                │ DEFAULT_MODEL_ASSIGNMENTS                          │ │
│ ├────────────────────────────────┼────────────────────────────────────────────────────┤ │
│ │ src/state/execution-plan.ts    │ Add updateSubTaskStatus(), getNextSubTask(),       │ │
│ │                                │ incrementSubTaskAttempts() helpers                 │ │
│ ├────────────────────────────────┼────────────────────────────────────────────────────┤ │
│ │                                │ Add decomposition step after enrichment for        │ │
│ │ src/stages/plan-stage.ts       │ complexity: "high" stories. Non-fatal (P39).       │ │
│ │                                │ Structured JSON output with parse+validate (P34,   │ │
│ │                                │ P44).                                              │ │
│ ├────────────────────────────────┼────────────────────────────────────────────────────┤ │
│ │                                │ Sub-task loop in executeOneStory: iterate          │ │
│ │ src/orchestrator.ts            │ sub-tasks sequentially, each gets BUILD→VERIFY.    │ │
│ │                                │ Sub-task exhausting maxAttempts fails the story.   │ │
│ ├────────────────────────────────┼────────────────────────────────────────────────────┤ │
│ │ src/stages/execute-build.ts    │ Accept optional subTaskScope?: { sourceFiles,      │ │
│ │                                │ title } to narrow agent context                    │ │
│ ├────────────────────────────────┼────────────────────────────────────────────────────┤ │
│ │ src/stages/execute-verify.ts   │ Accept optional subTaskScope to narrow AC/EC       │ │
│ │                                │ verification scope                                 │ │
│ └────────────────────────────────┴────────────────────────────────────────────────────┘ │
│                                                                                         │
│ Key Design Decisions                                                                    │
│                                                                                         │
│ 1. Decomposition at PLAN stage — Inspectable at approve-plan checkpoint. Decomposer     │
│ agent runs after enrichment for complexity: "high" stories.                             │
│ 2. Decomposer output contract — Structured JSON: { subTasks: [{ id, title, description, │
│  sourceFiles }] }. Parse with JSON.parse, validate required fields. On parse failure:   │
│ log warning (P44), fall back to monolithic execution (P39).                             │
│ 3. Sub-task attempt semantics — Each SubTask has its own attempts (starts 0) and        │
│ maxAttempts (defaults to story's maxAttempts). Sub-task exhausting attempts → story     │
│ marked failed. Story-level attempts unused when sub-tasks exist.                        │
│ 4. Sub-tasks sequential within a story — No parallelism between sub-tasks (overlapping  │
│ files). In a parallel wave (ENH-03), each story's sub-tasks run sequentially inside     │
│ that story's executeOneStory slot.                                                      │
│ 5. Non-fatal decomposition — If decomposer fails or produces invalid output, story      │
│ proceeds without sub-tasks. Same pattern as enricher (Phase 4, P39).                    │
│ 6. Optional field — subTasks?: SubTask[] on Story. Stories without sub-tasks execute    │
│ exactly as today (zero regression risk).                                                │
│                                                                                         │
│ Execution Order                                                                         │
│                                                                                         │
│ Step 1: Add SubTask type + state helpers                                                │
│ Step 2: Add decomposer agent type (all 4 agent config files)                            │
│ Step 3: Add decomposition step to plan-stage.ts (with parse+validate)                   │
│ Step 4: Sub-task-aware executeOneStory (sub-task loop wrapping BUILD+VERIFY)            │
│ Step 5: Scope narrowing in execute-build.ts + execute-verify.ts                         │
│                                                                                         │
│ Tests to Write (FW-01)                                                                  │
│                                                                                         │
│ Test File: __tests__/state/subtask-management.test.ts (NEW)                             │
│ Tests: ~8                                                                               │
│ Coverage: updateSubTaskStatus, getNextSubTask, incrementSubTaskAttempts, backward       │
│ compat                                                                                  │
│   without subTasks                                                                      │
│ ────────────────────────────────────────                                                │
│ Test File: __tests__/stages/plan-stage-subtask.test.ts (NEW)                            │
│ Tests: ~4                                                                               │
│ Coverage: High-complexity decomposed, low/medium not, decomposer failure non-fatal,     │
│ JSON                                                                                    │
│   validation                                                                            │
│ ────────────────────────────────────────                                                │
│ Test File: __tests__/orchestrator/subtask-execution.test.ts (NEW)                       │
│ Tests: ~6                                                                               │
│ Coverage: Sequential sub-task execution, sub-task failure → story failure, sub-task     │
│ retry                                                                                   │
│   independent, no sub-tasks → existing behavior                                         │
│                                                                                         │
│ Target: ~295 tests (277 after ENH-03 + ~18 new)                                         │
│                                                                                         │
│ Dogfood Strategy (FW-01)                                                                │
│                                                                                         │
│ - PRD: Must produce at least one complexity: "high" story. Example: "CLI tool with arg  │
│ parsing, file processing, formatted output."                                            │
│ - Verify: Decomposer produces sub-tasks. Sub-tasks execute sequentially. Sub-task retry │
│  at sub-task level. Low-complexity stories unaffected.                                  │
│ - Estimated cost: ~$10-20                                                               │
│                                                                                         │
│ FW-01 Deferral Criteria                                                                 │
│                                                                                         │
│ Defer FW-01 to Phase 6 if any of:                                                       │
│ - (a) ENH-03 introduces regression in existing tests                                    │
│ - (b) Wave execution shows plan-state corruption in dogfood                             │
│ - (c) ENH-03 implementation exceeds 2 stories of rework                                 │
│                                                                                         │
│ ---                                                                                     │
│ Verification (per scope)                                                                │
│                                                                                         │
│ 1. npx tsc --noEmit — 0 errors                                                          │
│ 2. npm test — all tests pass                                                            │
│ 3. Tier 3 dogfood — mandatory per scope                                                 │
│ 4. Update progress.md, phase-5-learnings.md, knowledge-base                             │
│                                                                                         │
│ Execution Order Summary                                                                 │
│                                                                                         │
│ Phase 5A: ENH-03 (Parallel Execution)                                                   │
│   Step 1: concurrency.ts (Mutex + runWithConcurrency) + tests                           │
│   Step 2: Refactor spawnAgentsParallel to use runWithConcurrency                        │
│   Step 3: maxConcurrency config + tests                                                 │
│   Step 4: Wave-construction helpers (resetCrashed, filterNonOverlapping) + tests        │
│   Step 5: Refactor runVerify — remove plan writes + update tests                        │
│   Step 6: Extract executeOneStory + wave executor + tests                               │
│   → npm test, npm run build                                                             │
│   → Commit                                                                              │
│   → Tier 3 dogfood                                                                      │
│   → Capture learnings                                                                   │
│                                                                                         │
│ Phase 5B: FW-01 (Sub-task Decomposition)  [defer if criteria met]                       │
│   Step 1: SubTask type + state helpers + tests                                          │
│   Step 2: decomposer agent type (4 files)                                               │
│   Step 3: Plan-stage decomposition + tests                                              │
│   Step 4: Sub-task-aware executeOneStory + tests                                        │
│   Step 5: Scope narrowing in build/verify                                               │
│   → npm test, npm run build                                                             │
│   → Commit                                                                              │
│   → Tier 3 dogfood                                                                      │
│   → Capture learnings, update progress.md, knowledge-base                               │
╰─────────────────────────────────────────────────────────────────────────────────────────╯
