# Phase 6: Post-MVP Multi-Repo Enhancement — Implementation Plan

## Inputs Consulted

- Memory (memory.md): Config threading via params (P32), Kahn's algorithm for dependency validation (ENH-02), wave executor architecture (ENH-03), all spawns on Windows need `shell: true` (Phase 2 Tier 3)
- Knowledge base (01-proven-patterns.md): P32 (config threading), P34 (strict output contract), P37 (multi-agent pipeline), P39 (non-fatal enrichment), P44 (loud failure), P48 (test gate conditions against upstream)
- Knowledge base (02-anti-patterns.md): F13 (duplication), F30 (in-memory without disk flush), F31 (return-type caller audit), F33 (ambiguous locations), F49 (dual-level enforcement)
- Previous phase learnings (phase-5-learnings.md): Parameter threading is tedious (~20min), CWD threading follows same pattern as config threading, compliance as separate stage works, SIZE-BOUND gate was dead code (P48)
- mvp-plan.md: ENH-11 + FW-14 + Item 22 scope, Phase 6 smoke test criteria, backward compatibility requirement
- Multi-repo design doc (design/multi-repo-enhancements.md): 7 design components across 5 implementation waves, Module/Story/ExecutionPlan type extensions, CWD threading through spawner and stages

## Key Observations

1. **`spawnClaude()` and `runShell()` already accept optional `cwd` parameters** — the infrastructure is ready, just not threaded through from spawner/stages
2. **All file paths are already absolute** (`join(hiveMindDir, ...)`) — agent CWD only affects where code is written/executed, not where reports go
3. **Reports stay centralized** in `hiveMindDir/reports/` — they're orchestrator artifacts, not module-scoped
4. **Single-repo backward compat is trivial** — when `modules` is empty, all `moduleCwd` resolves to `undefined`, falling back to `process.cwd()`

---

## Items

### ENH-11: Multi-Repo Module Config + CWD Threading

**Goal:** Parse module declarations from PRD metadata, thread CWD through spawner and execute stages so each story's agents run in the correct module directory.

**Files to create:**

| File | Purpose |
|------|---------|
| `src/types/module.ts` | `Module` interface: `{ id, path, role, dependencies }` |

**Files to modify:**

| File | What Changes |
|------|-------------|
| `src/types/execution-plan.ts` | Add `moduleId?: string` to Story (default `"default"`). Add `modules?: Module[]` to ExecutionPlan. |
| `src/types/agents.ts` | Add `cwd?: string` to AgentConfig interface (line ~25) |
| `src/agents/spawner.ts` | Pass `config.cwd` to `spawnClaude()` options in `spawnAgent()` (line ~18) |
| `src/stages/execute-build.ts` | Add optional `moduleCwd?: string` parameter to `runBuild()`. Pass to `spawnAgentWithRetry()` via AgentConfig. |
| `src/stages/execute-verify.ts` | Add optional `moduleCwd?: string` parameter to `runVerify()`. Pass to `spawnAgentWithRetry()` via AgentConfig. |
| `src/stages/execute-commit.ts` | Add optional `moduleCwd?: string` parameter to `runCommit()`. Pass `{ cwd: moduleCwd }` to `runShell()` git commands. |
| `src/orchestrator.ts` | In `executeOneStory()`: resolve `moduleCwd` from plan and thread to runBuild/runVerify. In wave executor: thread to runCommit. |
| `src/state/execution-plan.ts` | Add `getModuleCwd(plan, moduleId): string | undefined` helper. Auto-upgrade schema 2.0.0 plans: add `modules: []`, set `moduleId: "default"` on stories missing it. |
| `src/stages/plan-stage.ts` | Planner prompt schema gains `moduleId` field in story JSON. When modules exist, planner instructed to assign each story to a module. |
| `src/stages/spec-stage.ts` | Parse `## Modules` table from PRD/SPEC. Pass module list to downstream stages. |
| `src/index.ts` | Resolve relative module paths against PRD location at parse time. |

**Key Design Decisions:**

1. **moduleId is optional with default** — Stories without `moduleId` default to `"default"`. Existing plans auto-upgrade without migration.
2. **CWD threading via AgentConfig** — One field addition (`cwd?: string`) on AgentConfig, one line change in `spawnAgent()`. All stages already receive config objects — add cwd alongside existing parameters (P32 pattern).
3. **Module path resolution at PRD parse time** — Relative paths in `## Modules` table resolved to absolute paths once at startup. All downstream code receives absolute paths.
4. **Reports stay in hiveMindDir** — Module CWD only affects agent working directory, not report file locations. Reports are orchestrator artifacts.

---

### FW-14: Integration Verification Stage

**Goal:** After all stories are executed and committed, verify that modules work together by cross-checking implementations against spec contracts.

**Files to create:**

| File | Purpose |
|------|---------|
| `src/stages/integrate-verify.ts` | `runIntegrateVerify(plan, hiveMindDir, config)` — spawns integration-verifier agent per module boundary |

**Files to modify:**

| File | What Changes |
|------|-------------|
| `src/types/agents.ts` | Add `"integration-verifier"` to AgentType union |
| `src/agents/prompts.ts` | Add integration-verifier job description and rules |
| `src/agents/tool-permissions.ts` | Add `"integration-verifier": READ_ONLY_TOOLS` |
| `src/agents/model-map.ts` | Add `"integration-verifier": "opus"` |
| `src/config/schema.ts` | Add `"integration-verifier": "opus"` to DEFAULT_MODEL_ASSIGNMENTS |
| `src/orchestrator.ts` | Wire `runIntegrateVerify()` between EXECUTE and REPORT stages. Add `approve-integration` checkpoint. |
| `src/types/checkpoint.ts` | Add `"approve-integration"` to checkpoint awaiting types |

**Key Design Decisions:**

1. **Skipped in single-repo mode** — When `plan.modules` is empty/undefined, returns `{ passed: true, skipped: true }`. Zero overhead for single-repo.
2. **Non-fatal (P39)** — Integration verification failure produces a report but doesn't block the REPORT stage. The human reviews at the `approve-integration` checkpoint.
3. **One agent per boundary** — For N modules, spawn agents for each producer→consumer edge. Each agent reads the SPEC's `## Inter-Module Contracts` section and the relevant impl-reports.
4. **READ_ONLY_TOOLS** — Integration verifier only reads and analyzes, it doesn't modify code. Output is a report file.

---

### Item 22: Module-Aware Story Ordering + Contracts

**Goal:** Extend the dependency scheduler and wave executor to respect module dependency order. Stories in dependency modules execute before consumer module stories.

**Files to modify:**

| File | What Changes |
|------|-------------|
| `src/state/execution-plan.ts` | Add `getReadyStoriesMultiModule(plan)` that respects module order. Extend `filterNonOverlapping()` to consider cross-module constraints. |
| `src/types/execution-plan.ts` | Add optional `exports?: string[]` and `imports?: string[]` to Story for contract declarations. |
| `src/stages/plan-stage.ts` | Planner prompt gains module-awareness: group stories by module, add inter-module contract instructions when modules exist. |
| `src/agents/prompts.ts` | Add conditional MULTI-MODULE rule to spec-drafter: "Include ## Inter-Module Contracts section" |

**Key Design Decisions:**

1. **Module topo sort reuses Kahn's algorithm** — `validateDependencies()` already does Kahn's for stories. Extract the sort into a reusable `topologicalSort()` and apply it to module order too.
2. **Two-level ordering** — First sort modules topologically, then within each module sort stories by inter-story dependencies. Cross-module edges are inferred from module `dependencies` array.
3. **Wave executor unchanged** — The existing `getReadyStories()` + `filterNonOverlapping()` pattern works. `getReadyStories()` just needs to also check that the story's module's dependencies are satisfied (all stories in dependency modules are done).
4. **Contracts are advisory** — `exports`/`imports` on Story help the implementer agent understand boundaries but aren't enforced at runtime. The integration-verifier checks them post-execution.

---

## Execution Order

### Step 1: Module types + schema upgrade (no behavior change)
- Create `src/types/module.ts` with `Module` interface
- Add `moduleId?: string` to Story, `modules?: Module[]` to ExecutionPlan
- Add schema auto-upgrade in `loadExecutionPlan()`: if no `modules` field, add `modules: []` and set `moduleId: "default"` on each story
- Write tests: module type validation, schema upgrade, backward compat
- Run `npm test` — verify no regressions

### Step 2: CWD threading through spawner (infrastructure, no behavior change)
- Add `cwd?: string` to AgentConfig in `src/types/agents.ts`
- In `spawnAgent()`: pass `config.cwd` to `spawnClaude()` options
- Write tests: verify CWD passed through to spawnClaude, undefined CWD = no change
- Run `npm test` — verify no regressions

### Step 3: CWD threading through execute stages (infrastructure, no behavior change)
- Add `moduleCwd?: string` parameter to `runBuild()`, `runVerify()`, `runCommit()`
- Thread CWD into `AgentConfig.cwd` for agent spawns
- Thread CWD into `runShell()` for git operations in `runCommit()`
- Update existing execute-stage tests to verify CWD parameter forwarding
- Run `npm test` — verify no regressions

### Step 4: Orchestrator CWD resolution + wave executor update
- Add `getModuleCwd(plan, moduleId)` to `state/execution-plan.ts`
- In `executeOneStory()`: resolve `moduleCwd = getModuleCwd(plan, story.moduleId)`, pass to runBuild/runVerify
- In wave executor post-wave: pass `moduleCwd` to `runCommit()`
- Write tests: CWD resolved per story, undefined for single-repo
- Run `npm test` — verify no regressions

### Step 5: Module parsing from PRD/SPEC
- Add `parseModules(content: string): Module[]` in spec-stage.ts or a utility
- Parse `## Modules` markdown table from SPEC
- Resolve relative paths against PRD location
- Store modules in ExecutionPlan during plan stage
- Write tests: table parsing, path resolution, empty modules = single-repo
- Run `npm test` — verify no regressions

### Step 6: Module-aware story ordering
- Extract `topologicalSort()` from `validateDependencies()` into reusable utility
- Extend `getReadyStories()` to check module dependency satisfaction
- Update planner prompt to include `moduleId` in story schema when modules exist
- Write tests: module topo sort, cross-module blocking, single-repo unchanged
- Run `npm test` — verify no regressions

### Step 7: Integration verification stage (new stage)
- Create `src/stages/integrate-verify.ts`
- Add `"integration-verifier"` to AgentType, prompts, tool-permissions, model-map, schema
- Wire into orchestrator between EXECUTE and REPORT
- Add `approve-integration` checkpoint
- Single-repo: skip entirely
- Write tests: stage skipped for single-repo, agent spawned for multi-repo, report produced
- Run `npm test` — verify no regressions

### Step 8: Planner + spec module-awareness
- Add MULTI-MODULE conditional rule to spec-drafter prompts
- Update planner prompt schema to include `moduleId` per story
- Add AC/EC generator module context injection
- Write tests: module-aware planner output, contract instructions present
- Run `npm test` — verify no regressions

→ `npx tsc --noEmit` — 0 errors
→ `npm test` — all tests pass
→ Commit
→ Tier 3 dogfood (2-module PRD)
→ Capture learnings, update progress.md, knowledge-base

---

## Tests to Write (Phase 6)

**Test File: `__tests__/types/module.test.ts` (NEW)**
Tests: ~4
Coverage: Module interface validation, empty modules array, role types

**Test File: `__tests__/state/module-helpers.test.ts` (NEW)**
Tests: ~8
Coverage: getModuleCwd resolution, schema auto-upgrade, module topo sort, cross-module ready check, single-repo backward compat

**Test File: `__tests__/agents/spawner-cwd.test.ts` (NEW or EXTEND spawner.test.ts)**
Tests: ~4
Coverage: CWD passed to spawnClaude, undefined CWD = no change, parallel spawn with mixed CWDs

**Test File: `__tests__/stages/execute-build.test.ts` (EXTEND)**
Tests: ~2
Coverage: moduleCwd forwarded to agent config, undefined moduleCwd = no CWD in config

**Test File: `__tests__/stages/execute-verify.test.ts` (EXTEND)**
Tests: ~2
Coverage: moduleCwd forwarded to agent config

**Test File: `__tests__/stages/execute-commit.test.ts` (EXTEND)**
Tests: ~2
Coverage: git commands use moduleCwd, undefined moduleCwd = no CWD option

**Test File: `__tests__/orchestrator/module-execution.test.ts` (NEW)**
Tests: ~8
Coverage: CWD resolved per story, cross-module wave blocking, single-repo unchanged, integration stage skipped for single-repo

**Test File: `__tests__/stages/integrate-verify.test.ts` (NEW)**
Tests: ~6
Coverage: Skipped for single-repo, agent spawned per boundary, report produced, non-fatal on failure

**Test File: `__tests__/stages/module-parsing.test.ts` (NEW)**
Tests: ~6
Coverage: Parse modules table, path resolution, empty table = empty array, malformed table warning

Target: ~371 tests (329 current + ~42 new)

---

## Smoke Test Gate (from mvp-plan.md)

**Tier 1 (Unit):**
- Module parsing: PRD with `modules` array produces correct module config objects
- CWD resolution: relative module paths resolved correctly against PRD location
- Backward compat: PRD without `modules` field produces single-module default
- Topo sort: dependency-module stories sort before consumer-module stories
- Schema version: `modules` present uses extended schema; absent = current behavior
- Contract validation: import without matching export throws clear error

**Tier 2 (Integration):**
- Multi-module execution with mocked spawner: verify `cwd` parameter passed correctly to each agent spawn
- Story ordering: 4 stories across 2 modules → dep stories execute in earlier waves
- Integration verifier spawned after all module stories committed (mocked spawner captures call)
- Single-repo regression: existing test suite passes unchanged

**Tier 3 (Dogfood — recommended):**
- Run a 2-module PRD (e.g., shared-lib exporting a utility + consumer importing it)
- Estimated cost: ~$20-35
- Verify: pipeline completes, CWD correct per module, integration verify runs, stories in correct order

---

## Risk Mitigations (informed by Phase 5 learnings + knowledge base)

| Risk | Mitigation |
|------|-----------|
| Parameter threading tedium (~20min per stage) | Steps 2-4 are mechanical — add `cwd?: string` to each signature. Follow P32 pattern exactly. Batch all stage changes in one step. |
| Agent file paths break when CWD changes | All `inputFiles`/`outputFile` paths are already absolute (`join(hiveMindDir, ...)`). Agent CWD only affects where code is written, not where reports go. |
| sourceFiles relative path confusion | Resolve against `moduleCwd` when present, fall back to `hiveMindDir`. Document the resolution rule. |
| Reports scattered across repos | Reports stay centralized in `hiveMindDir/reports/`. Module CWD is for code, not orchestrator artifacts. |
| Circular module dependencies | `topologicalSort()` throws on cycles with clear error message — reuse proven Kahn's algorithm from ENH-02. |
| Integration verify blocks pipeline | Non-fatal (P39) — produces report but doesn't block REPORT stage. Human reviews at checkpoint. |
| Single-repo regression | Every step runs full test suite. Schema auto-upgrade is backward compatible. All new parameters are optional. |
| Dual-level enforcement (F49) | Module-aware ordering uses code-level gates only. No duplicate prompt rules for the same constraint. |
| Gate conditions unreachable (P48) | Test module parsing against real multi-repo PRDs in dogfood, not assumed shapes. |
