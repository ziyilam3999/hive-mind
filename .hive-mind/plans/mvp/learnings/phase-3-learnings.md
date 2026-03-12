# Phase 3: Visibility & DX — Learnings

**Completed:** 2026-03-12 | **Items:** RD-12 (Output Mode Fix), RD-05 (Cost Tracking), FW-02 (Baseline Check), ENH-15 (Manifest), ENH-13 (Notifications), ENH-02 (Dependency Scheduling)

---

## Design Decisions & Rationale

### RD-12: Remove fallback write — strict output contract
Removed the `--print` fallback that wrote raw stdout to the output file when agents didn't use the Write tool. Now if the output file doesn't exist after spawn, the agent returns failure immediately. This is the fix for the Phase 2 Tier 3 finding where raw JSON session logs were written as report content.

**Tradeoff:** Agents that fail to use Write now fail explicitly rather than producing garbage output. This is correct behavior — a silent corruption was worse than a loud failure.

### RD-05: CostTracker as simple accumulator (not singleton)
CostTracker is instantiated at the approve-plan checkpoint and passed through the execute loop. Records per-story, per-agent-type costs with timestamps. Budget enforcement via `enforceBudget()` that throws HiveMindError. Keeps the O(n) query pattern — no need for indexing at pipeline scale.

### FW-02: Baseline check as fail-fast guard
`runBaselineCheck()` runs build + test commands sequentially before EXECUTE stage. Fails with first 500 chars of output for diagnostics. Configurable via `baselineBuildCommand` / `baselineTestCommand` in config. `--skip-baseline` flag bypasses. This prevents burning agent tokens on a broken codebase.

### ENH-15: Hybrid static + dynamic manifest
MANIFEST.md has a static section (architecture, source map, conventions — written by humans/AI) and a dynamic `## Artifact Inventory` section auto-generated at stage boundaries. Marker-based preservation: content above the marker survives re-runs. Non-fatal via `safeUpdateManifest()` try/catch wrapper.

### ENH-13: BEL character for checkpoint notifications
Single `\x07` write to stdout at each checkpoint. `--silent` flag suppresses. Minimal implementation (9 lines) — no audio libraries, no platform-specific code.

### ENH-02: Kahn's algorithm for dependency validation
`validateDependencies()` uses topological sort (Kahn's algorithm) to detect cycles and missing IDs in the story dependency graph. `getNextStory()` respects the DAG — only returns stories whose dependencies have all passed. `getReadyStories()` returns all independent ready stories (for future parallel execution in Phase 5).

---

## Technical Challenges

### Manifest preservation across re-runs (cost: ~10min)
**Problem:** Re-running the manifest generator would overwrite user edits to the static section (architecture notes, conventions).

**Fix:** Read existing MANIFEST.md, find `## Artifact Inventory` marker, preserve everything above it, regenerate only the dynamic section below. If marker not found, append.

**Pattern:** Marker-based section preservation for hybrid human+generated docs.

### Config schema extension for new features (cost: ~5min)
**Problem:** Adding `baselineBuildCommand`, `baselineTestCommand`, `budget`, and `silent` to config required schema updates, loader defaults, and type propagation.

**Fix:** Extended `HiveMindConfig` type, added defaults in `DEFAULT_CONFIG`, added validation in schema. Config threading pattern from Phase 1 made this straightforward.

### Dependency scheduling with existing story loop (cost: ~15min)
**Problem:** The existing story loop in orchestrator.ts iterated `plan.stories` linearly. Dependency scheduling needed to change the iteration pattern to use `getNextStory()` which checks dependency status.

**Fix:** Replaced `for (const story of plan.stories)` with `while (const story = getNextStory(plan))` loop. `getNextStory()` returns `undefined` when all stories are done or blocked. Added `validateDependencies()` call before the loop starts.

**Pattern:** Dependency graph as a layer on top of existing plan structure — stories gain optional `dependsOn: string[]` field, backward compatible.

---

## Patterns Established

| Pattern | Where | Reuse in Phase 4+ |
|---------|-------|-------------------|
| Strict output contract (no fallback) | `agents/spawner.ts` | All agent types |
| Marker-based doc preservation | `manifest/generator.ts` | Any hybrid human+generated docs |
| Kahn's algorithm cycle detection | `state/execution-plan.ts` | Any DAG validation |
| safeUpdateManifest() try/catch | `orchestrator.ts` | Non-fatal side-effects at boundaries |
| Checkpoint BEL notification | `utils/notify.ts` | Any human attention point |
| Budget enforcement pattern | `utils/cost-tracker.ts`, `orchestrator.ts` | Rate limiting, resource caps |
| Fail-fast baseline guard | `stages/baseline-check.ts` | Pre-flight checks for any stage |

---

## Tier 3 Decision

Skipped Phase 3 Tier 3 dogfood (marked "recommended" not mandatory). Reasoning:
1. Phase 2 Tier 3 was mandatory and revealed the `--print` fallback issue — now fixed by RD-12
2. Phase 4 Tier 3 is also mandatory and will validate RD-12 fix + all Phase 3 features in a single run
3. Phase 3 changes are low-risk: removed code (RD-12), additive features (RD-05, FW-02, ENH-15, ENH-13), and isolated logic (ENH-02)
4. Running two dogfood tests back-to-back gives diminishing returns

---

## Test Coverage

| Item | New Tests | Test Files |
|------|-----------|------------|
| RD-12 | Updated spawner tests (no fallback assertions) | `agents/spawner.test.ts` |
| RD-05 | 8 tests (accumulation, budget, summary) | `utils/cost-tracker.test.ts` |
| FW-02 | 5 tests (pass, build-fail, test-fail, custom) | `stages/baseline-check.test.ts` |
| ENH-15 | 9 tests (static, dynamic, preservation, empty) | `manifest/generator.test.ts` |
| ENH-13 | 2 tests (BEL write, silent suppression) | `utils/notify.test.ts` |
| ENH-02 | 10 tests (DAG, chains, blocks, cycles) | `state/dependency-scheduling.test.ts` |

Total: 207 tests across 36 files (up from 169 tests / 31 files in Phase 2).

---

## Recommendations for Next Phase

1. **Phase 4 Tier 3 is the real validation** — it will test RD-12's strict output contract, cost tracking accuracy, baseline check, and manifest generation in a live pipeline run.
2. **Parallel story execution (Phase 5)** — `getReadyStories()` already returns all independent stories. Phase 5 ENH-03 can use this directly with a worker pool.
3. **Manifest content quality** — the static section template is useful but generic. After a few pipeline runs, consider whether the template needs updating based on what information agents actually reference.

---

## Key Takeaway

Phase 3 was primarily about removing a bad pattern (fallback write) and adding observability layers (cost tracking, baseline check, manifest, notifications). The dependency scheduling (ENH-02) is the most architecturally significant addition — it unlocks Phase 5's parallel execution. All 6 items are additive or subtractive; none change existing core behavior, which keeps regression risk low.
