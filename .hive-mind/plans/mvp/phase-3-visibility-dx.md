# Phase 3: Visibility & DX — Implementation Plan

## Inputs Consulted
- [x] Memory (`memory.md`): P6 (mechanical detection), P31 (verdict placement), `--print` causes raw JSON output (D74), parser is single point of failure (D73)
- [x] Knowledge base: P6 (mechanical detection over judgment), P25 (scan keywords anywhere), P26 (smoke test breaks false-positive chains), C-ATOMIC-1 (atomic tracking writes), C-CONTRACT-1 (output contracts mandatory)
- [x] Phase 2 learnings: `--print` + `--output-format json` dumps full session to stdout as `result` field; fallback writes raw JSON as output file; Haiku agents especially prone; both Tier 3 stories failed for this reason; recommendation to investigate removing `--print` or adding output validation
- [x] mvp-plan.md: 6 items (RD-12, RD-05, FW-02, ENH-15, ENH-13, ENH-02), Tier 3 = ENH-13 dogfood trial (recommended)

---

## Critical Revision: RD-12

The mvp-plan says "remove `--print` from `spawnClaude()` args." **This is wrong.**

Claude CLI help confirms: `--output-format <format> (only works with --print)`. Removing `--print` would:
1. Break non-interactive mode (agents would try to open TUI)
2. Lose `--output-format json` → lose cost/model/session metadata
3. Break the entire spawner pipeline

**Revised fix:** Keep `--print` + `--output-format json`. Remove the fallback write in `spawnAgent()`. If the agent didn't create its output file via Write tool, that's a genuine failure → retry mechanism handles it. This aligns with phase-2-learnings recommendation #2.

---

## Items

### 6. RD-12: Agent Output Mode Fix (REVISED)

- **Goal:** Stop fallback from writing raw session JSON as agent output files
- **Files to modify:**
  - `src/agents/spawner.ts` — remove fallback write logic (lines 38-45), always return failure when output file not created
  - `src/agents/prompts.ts` — strengthen Write tool instruction to be more explicit
- **Files NOT modified:** `src/utils/shell.ts` — `--print` stays
- **Key decision:** Removing fallback instead of `--print`. Rationale: `--output-format json` requires `--print`; agents are instructed to use Write tool; not creating the file is a real failure that should be retried (RD-01 backoff handles this). The fallback was masking genuine failures by writing garbage.

### 7. RD-05: Cost/Token Tracking

- **Goal:** Aggregate per-agent costs into per-story and pipeline totals; add `--budget` spend cap
- **Files to create:**
  - `src/utils/cost-tracker.ts` — `CostTracker` class: `recordAgentCost(storyId, agentType, costUsd, durationMs)`, `getStoryTotal(storyId)`, `getPipelineTotal()`, `checkBudget(budgetUsd): boolean`, `getSummary(): CostSummary`
- **Files to modify:**
  - `src/orchestrator.ts` — instantiate `CostTracker`, pass to execute stages, log summary after each stage
  - `src/stages/execute-build.ts` — record cost after each agent spawn
  - `src/stages/execute-verify.ts` — record cost after each agent spawn
  - `src/stages/execute-learn.ts` — record cost after each agent spawn
  - `src/stages/report-stage.ts` — record cost after each agent spawn
  - `src/index.ts` — add `--budget` flag to `start` command, pass to orchestrator
  - `src/types/agents.ts` — no change (costUsd already exists on AgentResult)
- **Key decision:** CostTracker is a plain class, not a singleton. Instantiated in orchestrator, threaded to stages. Follows config-threading pattern from Phase 1 (no global state).

### 8. FW-02: Clean Baseline Verification

- **Goal:** Run `npm run build` + `npm test` before first story; halt if pre-existing failures
- **Files to create:**
  - `src/stages/baseline-check.ts` — `runBaselineCheck(hiveMindDir, config): Promise<BaselineResult>` — runs configured build/test commands via `runShell()`, returns pass/fail with stdout/stderr
- **Files to modify:**
  - `src/orchestrator.ts` — call `runBaselineCheck()` after plan approval, before first story execution
  - `src/index.ts` — add `--skip-baseline` flag to `start` command
  - `src/config/schema.ts` — add `baselineBuildCommand` and `baselineTestCommand` config fields (defaults: `npm run build`, `npm test`)
- **Key decision:** Baseline runs AFTER plan approval (user has already invested in spec+plan). If baseline fails, halt with clear message — don't burn agent tokens on stories that will fail due to pre-existing issues.

### 9. ENH-15: AI-First Manifest

- **Goal:** Auto-generated `.hive-mind/MANIFEST.md` with artifact inventory, updated at stage boundaries
- **See:** `manifest-plan.md` for full design (5 steps, 217 lines)
- **Files to create:**
  - `src/manifest/generator.ts` — `updateManifest(hiveMindDir): Promise<void>`
- **Files to modify:**
  - `src/orchestrator.ts` — call `updateManifest()` after each stage completes (try/catch, non-blocking)
  - `src/index.ts` — add `manifest` CLI command
- **Key decision:** Manifest errors are non-fatal (try/catch around every call). Pipeline should never fail because manifest generation failed.

### 10. ENH-13: Checkpoint Sound Notification

- **Goal:** BEL character at checkpoints so human knows pipeline needs attention
- **Files to create:**
  - `src/utils/notify.ts` — `notifyCheckpoint(silent: boolean): void` — writes `\x07` to stdout unless silent
- **Files to modify:**
  - `src/orchestrator.ts` — call `notifyCheckpoint()` at 4 checkpoint write locations (lines ~60, ~114, ~131, ~145)
  - `src/index.ts` — add `--silent` flag to `start` command
- **Key decision:** BEL via stdout (not stderr) — terminal emulators listen on stdout. Simple function, no class needed.

### 11. ENH-02: Dependency-Aware Story Scheduling

- **Goal:** `getNextStory()` respects `dependencies` field; detect circular deps at load time
- **Files to modify:**
  - `src/state/execution-plan.ts`:
    - Modify `getNextStory()` (line 114-116) — skip stories whose dependencies haven't all reached `"passed"`
    - Add `getReadyStories(plan): Story[]` — returns ALL stories with satisfied deps (needed by Phase 5 ENH-03)
    - Add `validateDependencies(plan): void` — detects circular deps + missing dep IDs, throws `HiveMindError`
  - `src/orchestrator.ts` — call `validateDependencies()` when loading execution plan (before first story)
- **Key decision:** `getReadyStories()` returns stories ready for parallel execution (Phase 5 prerequisite). Circular dep detection uses iterative topo-sort — if any node can't be placed, there's a cycle.

---

## Execution Order

### Step 1: RD-12 — Remove fallback write
1. Modify `spawnAgent()` in `src/agents/spawner.ts`: remove lines 38-45 (content extraction + fallback write), remove `stripMarkdownFences()` helper
2. Keep the `fileExists()` check on line 47 — if file exists → success, else → failure with clear error
3. Update prompt in `src/agents/prompts.ts`: add emphasis that Write tool is MANDATORY for output
4. Write unit tests: agent doesn't create file → `success: false` (no fallback), agent creates file → `success: true`
5. Update existing test "falls back to stdout when JSON parse fails" — should now return failure
6. Run `npm run build && npm test`

### Step 2: ENH-13 — Sound notification
1. Create `src/utils/notify.ts` with `notifyCheckpoint()`
2. Add `--silent` flag to `parseArgs()` in `src/index.ts` (update `ParsedCommand` type)
3. Thread `silent` to orchestrator, call `notifyCheckpoint()` at 4 checkpoint locations
4. Write unit tests: BEL written when not silent, not written when silent
5. Run `npm run build && npm test`

### Step 3: ENH-02 — Dependency scheduling
1. Add `validateDependencies()` to `src/state/execution-plan.ts`
2. Modify `getNextStory()` to check dependency satisfaction
3. Add `getReadyStories()` for Phase 5 preparation
4. Call `validateDependencies()` from orchestrator when loading plan
5. Write unit tests: dependency ordering, circular dep detection, missing dep ID error, `getReadyStories` returns correct subset
6. Write integration test: 3-story chain (S2→S1, S3→S2) + 1 independent → verify execution order
7. Run `npm run build && npm test`

### Step 4: RD-05 — Cost tracking
1. Create `src/utils/cost-tracker.ts` with `CostTracker` class
2. Add `--budget` flag to `parseArgs()` in `src/index.ts`
3. Add `baselineBuildCommand`/`baselineTestCommand` config fields... wait, that's FW-02. For RD-05: thread `CostTracker` through orchestrator to execute/report stages
4. After each `spawnAgent`/`spawnAgentWithRetry` call in execute stages, call `tracker.recordAgentCost()`
5. Log pipeline cost summary after each stage
6. If `--budget` set and total exceeds budget, halt with `HiveMindError`
7. Write unit tests: accumulation, budget exceeded, missing cost data (returns 0, not crash)
8. Write integration test: mocked pipeline run → cost summary in output
9. Run `npm run build && npm test`

### Step 5: FW-02 — Baseline verification
1. Add `baselineBuildCommand`/`baselineTestCommand` to config schema
2. Create `src/stages/baseline-check.ts` with `runBaselineCheck()`
3. Add `--skip-baseline` flag to `parseArgs()` in `src/index.ts`
4. Call `runBaselineCheck()` from orchestrator after plan approval, before first story
5. Write unit tests: baseline passes → continue, baseline fails → halt with error, `--skip-baseline` → skip
6. Run `npm run build && npm test`

### Step 6: ENH-15 — Manifest
1. Follow `manifest-plan.md` Steps 1-5
2. Create `src/manifest/generator.ts`
3. Add `updateManifest()` calls in orchestrator (wrapped in try/catch)
4. Add `manifest` CLI command
5. Write unit tests per manifest-plan.md
6. Run `npm run build && npm test`

---

## Tests to Write

### RD-12
- `spawnAgent` returns `success: false` when output file not created (no fallback write)
- `spawnAgent` returns `success: true` when output file exists (agent used Write tool)
- `spawnAgentWithRetry` retries when output file not created
- Existing spawner tests updated to reflect removal of fallback

### ENH-13
- `notifyCheckpoint(false)` writes BEL (`\x07`) to stdout
- `notifyCheckpoint(true)` writes nothing (silent mode)
- Integration: BEL appears at all 4 checkpoint locations in orchestrator

### ENH-02
- `getNextStory()` skips stories with unmet dependencies
- `getNextStory()` returns story when all deps are `"passed"`
- `getReadyStories()` returns all dep-satisfied stories
- `validateDependencies()` throws on circular dependency (A→B→A)
- `validateDependencies()` throws on missing dependency ID
- `validateDependencies()` passes for valid dependency graph
- Integration: 3-story dependency chain executes in correct order (S1→S2→S3)
- Integration: S1 fails → S2 (depends on S1) skipped, S3 (independent) still executes

### RD-05
- `CostTracker.recordAgentCost()` accumulates per-story and pipeline totals
- `CostTracker.checkBudget()` returns false when under budget, true when exceeded
- `CostTracker` handles missing/undefined cost data (returns 0, not crash)
- `--budget` flag parsed correctly in CLI
- Integration: mocked pipeline run → cost summary appears

### FW-02
- `runBaselineCheck()` returns pass when build+test succeed
- `runBaselineCheck()` returns fail with stderr when build fails
- `runBaselineCheck()` returns fail with stderr when test fails
- `--skip-baseline` flag bypasses check
- Config: custom build/test commands override defaults
- Integration: baseline fails → pipeline halts before first story

### ENH-15
- See `manifest-plan.md` for detailed test specs
- Manifest generation doesn't crash on empty `.hive-mind/` directory
- Manifest errors don't crash pipeline (try/catch)

---

## Smoke Test Gate (from mvp-plan.md)

**Tier 1 (Unit):**
- Agent output mode: `spawnAgent()` returns failure when output file not created (no fallback write)
- Cost tracker accumulates tokens per agent spawn, per story, and pipeline total
- Cost tracker handles missing/malformed usage data (returns 0, not crash)
- `--budget` flag halts pipeline when budget exceeded
- Baseline verification: halts with clear message if build/test fail
- `--skip-baseline` flag bypasses baseline check
- Manifest file generated with correct structure at stage boundaries
- `getNextStory()` skips stories with unmet dependencies
- Circular dependency detection throws clear error at plan load time

**Tier 2 (Integration):**
- 3-story execution with dependency chain (S2→S1, S3→S2): verify execution order 1→2→3
- Failed dependency: S1 fails, S2 depends on S1 → S2 skipped, S3 (independent) still executes
- Cost tracking: after mocked pipeline run, cost summary appears in report
- BEL character (`\x07`) written to stdout at all 4 checkpoint exits

**Tier 3 (Dogfood trial — recommended):**
- Write PRD for ENH-13 (sound notification), run pipeline on it
- Estimated cost: ~$15-25
- Goal: learning, not productivity — document every friction point
- Pass criteria: pipeline completes without crash (code quality is manual judgment)

---

## Risk Mitigations

| Risk | Mitigation | Source |
|------|-----------|--------|
| RD-12: Removing fallback causes more failures | Retry mechanism (RD-01, Phase 2) handles retries; agents already instructed to use Write tool; fallback was masking failures, not preventing them | Phase 2 Tier 3 learnings |
| RD-12: `--print` removal would break pipeline | **Revised**: keeping `--print`, only removing fallback write | Claude CLI `--help` confirms `--output-format` requires `--print` |
| ENH-02: Circular dep detection too slow | Iterative topo-sort is O(V+E); execution plans have <50 stories | First principles |
| FW-02: Baseline commands vary by project | Config fields `baselineBuildCommand`/`baselineTestCommand` with sensible defaults | P6 (mechanical detection), config pattern from Phase 1 |
| ENH-15: Manifest errors crash pipeline | All `updateManifest()` calls wrapped in try/catch | C-ATOMIC-1 (non-critical writes shouldn't block critical path) |
| Phase 2 learnings: Windows PATH for spawn | Already fixed (`shell: process.platform === "win32"`) in Phase 2 | Phase 2 Tier 3 |
| Phase 2 learnings: caller audit when adding union members | Grep for existing members before adding new ones (StoryStatus lesson) | Phase 2 learnings |
