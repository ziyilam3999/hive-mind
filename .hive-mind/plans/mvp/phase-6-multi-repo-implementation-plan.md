# Phase 6: Post-MVP Multi-Repo Enhancement — Implementation Plan

## Inputs Consulted

- Memory (memory.md): Config threading via params (P32), Kahn's algorithm for dependency validation (ENH-02), wave executor architecture (ENH-03), all spawns on Windows need `shell: true` (Phase 2 Tier 3)
- Knowledge base (01-proven-patterns.md): P32 (config threading), P34 (strict output contract), P37 (multi-agent pipeline), P39 (non-fatal enrichment), P42 (tool permission must match output contract), P44 (loud failure), P45 (warn on missing data defaults), P48 (test gate conditions against upstream)
- Knowledge base (02-anti-patterns.md): F13 (duplication), F30 (in-memory without disk flush), F31 (return-type caller audit), F33 (ambiguous locations), F43 (tool permission vs. output contract mismatch), F49 (dual-level enforcement)
- Previous phase learnings (phase-5-learnings.md): Parameter threading is tedious (~20min), CWD threading follows same pattern as config threading, compliance as separate stage works, SIZE-BOUND gate was dead code (P48)
- mvp-plan.md: ENH-11 + FW-14 + Item 22 scope, Phase 6 smoke test criteria, backward compatibility requirement
- Multi-repo design doc (design/multi-repo-enhancements.md): 7 design components across 5 implementation waves, Module/Story/ExecutionPlan type extensions, CWD threading through spawner and stages

## Key Observations

1. **`spawnClaude()` and `runShell()` already accept optional `cwd` parameters** — the infrastructure is ready, just not threaded through from spawner/stages
2. **All orchestrator file paths (inputFiles, outputFile, reports) are already absolute** (`join(hiveMindDir, ...)`). Agent CWD affects the agent's file I/O context — this is intentional for multi-repo, as agents should read/write in the module directory. No orchestrator paths need to change.
3. **Reports stay centralized** in `hiveMindDir/reports/` — they're orchestrator artifacts, not module-scoped. Story IDs are globally unique across modules (the planner assigns IDs from a single sequence: US-01, US-02, ... regardless of module), so report paths do not collide.
4. **Single-repo backward compat is trivial** — when `modules` is empty, all `moduleCwd` resolves to `undefined`, falling back to `process.cwd()`
5. **Module completion is derived from story statuses** in execution-plan.json, which is already written atomically (C-ATOMIC-1). No separate module-progress tracker is needed — a module's dependencies are satisfied when all stories with matching `moduleId` in the dependency module have `status: 'done'`. **Edge case: a module with zero stories is treated as vacuously satisfied and logs a warning** ("Module {id} has no stories assigned — dependency is vacuously satisfied"). This prevents deadlock from planner errors while making the condition visible.
6. **`sourceFiles` are module-relative in multi-repo context** — In a multi-repo plan, `sourceFiles` on a story are relative to that story's `moduleCwd`. In single-repo plans, they remain relative to `hiveMindDir` (which equals `process.cwd()`). This distinction must be respected consistently across all consumers: `runBuild()`, `filterNonOverlapping()`, `computeModifiedFiles()`, and `git add`.

---

## Items

### ENH-11: Multi-Repo Module Config + CWD Threading

**Goal:** Parse module declarations from PRD metadata, thread CWD through spawner and execute stages so each story's agents run in the correct module directory.

**Files to create:**

| File | Purpose |
|------|---------|
| `src/types/module.ts` | `Module` interface: `{ id, path, role, dependencies }` |
| `src/utils/module-parser.ts` | `parseModules(content: string): Module[]` — parses `## Modules` table from SPEC/PRD content |

**Files to modify:**

| File | What Changes |
|------|-------------|
| `src/types/execution-plan.ts` | Add `moduleId?: string` to Story (default `"default"`). Add `modules?: Module[]` to ExecutionPlan. |
| `src/types/agents.ts` | Add `cwd?: string` to AgentConfig interface (line ~25) |
| `src/agents/spawner.ts` | Add `cwd: config.cwd` to the `spawnClaude()` options object in `spawnAgent()` (line ~18). `spawnAgent()` enumerates options explicitly — this is a new named field, not an automatic pass-through. |
| `src/stages/execute-build.ts` | Add optional `moduleCwd?: string` parameter to `runBuild()`. Pass to `spawnAgentWithRetry()` via AgentConfig. Change `sourceFiles` resolution: use `join(moduleCwd ?? hiveMindDir, f)` instead of hardcoded `join(hiveMindDir, f)`. |
| `src/stages/execute-verify.ts` | Add optional `moduleCwd?: string` parameter to `runVerify()`. Pass to `spawnAgentWithRetry()` via AgentConfig. |
| `src/stages/execute-commit.ts` | Add optional `moduleCwd?: string` parameter to `runCommit()`. Pass `{ cwd: moduleCwd }` to `runShell()` git commands. Update `computeModifiedFiles()` to resolve `sourceFiles` against `moduleCwd` when present. |
| `src/orchestrator.ts` | In `executeOneStory()`: resolve `moduleCwd` from plan and thread to runBuild/runVerify. In wave executor: thread to runCommit. |
| `src/state/execution-plan.ts` | Add `getModuleCwd(plan, moduleId): string | undefined` helper. Auto-upgrade plans: add `modules: []`, set `moduleId: "default"` on stories missing it. **Log at `debug` level when auto-upgrade occurs for plans with no `## Modules` section** (these are intentional single-repo plans, not misconfiguration). Log at `warn` level only when a plan has a `## Modules` section but stories are missing `moduleId` (genuine misconfiguration, per P45). Update `validateExecutionPlan()` to accept the new optional fields. Update `filterNonOverlapping()` to compare resolved absolute paths (using `moduleCwd` per story) instead of raw relative `sourceFiles` strings. |
| `src/stages/plan-stage.ts` | Planner prompt schema gains `moduleId` field in story JSON. When modules exist, planner instructed to assign each story to a module. |
| `src/stages/spec-stage.ts` | Pass module list parsed by `parseModules()` to downstream stages. |
| `src/index.ts` | Resolve relative module paths against PRD location at parse time. Validate resolved paths: (a) each must exist as a directory, (b) no duplicate paths across modules, (c) no two modules share the same git repository root, (d) fail fast with error naming the invalid path and its declaring module. |

**Expected `## Modules` table format:**

The SPEC/PRD declares modules using a markdown table under a `## Modules` heading:

```markdown
## Modules

| id | path | role | dependencies |
|----|------|------|-------------|
| shared-lib | ../shared-lib | producer | |
| web-app | ../web-app | consumer | shared-lib |
| api-server | ../api-server | consumer | shared-lib |
```

- `id`: unique module identifier (used as `moduleId` on stories)
- `path`: relative to the PRD file location (resolved to absolute at parse time)
- `role`: `producer`, `consumer`, or `standalone`
- `dependencies`: comma-separated list of module `id` values (empty = no dependencies)

**Key Design Decisions:**

1. **moduleId is optional with default** — Stories without `moduleId` default to `"default"`. Existing plans auto-upgrade without migration. The auto-upgrade logs at debug level for single-repo plans and warn level for plans with modules but missing moduleId (P45).
2. **CWD threading via AgentConfig** — One field addition (`cwd?: string`) on AgentConfig, one explicit field in `spawnAgent()`'s `spawnClaude()` call. All stages already receive config objects — add cwd alongside existing parameters (P32 pattern).
3. **Module path resolution and validation at PRD parse time** — Relative paths in `## Modules` table resolved to absolute paths once at startup. After resolution, each path is validated: must exist as a directory, no duplicates, no shared git repository roots. Fail fast with a clear error on invalid paths (P44).
4. **Reports stay in hiveMindDir** — Module CWD only affects agent working directory, not report file locations. Reports are orchestrator artifacts. Story IDs are globally unique (single planner sequence) so paths do not collide.
5. **sourceFiles are module-relative** — In multi-repo plans, `sourceFiles` on a story are relative to that story's `moduleCwd`. Resolution rule: `join(moduleCwd ?? hiveMindDir, f)`. This applies uniformly in three places: (a) `runBuild()` for agent input files, (b) `computeModifiedFiles()` in `runCommit()` for git operations, (c) `filterNonOverlapping()` for overlap detection (compares resolved absolute paths). One resolution rule, applied consistently.
6. **Pre-execution git state validation for external repos** — Before executing any story with a non-default `moduleCwd`, validate that: (a) the directory is within a git repository (`.git` exists or `git rev-parse --git-dir` succeeds), (b) log a warning if there are uncommitted changes (`git status --porcelain`), (c) record the current branch name in the manager log. This prevents silent commits to unexpected branches or non-git directories.
7. **Schema version stays `2.0.0`** — The `modules` and `moduleId` fields are additive optional extensions, not a breaking change. `validateExecutionPlan()` is updated to accept these new optional fields without requiring a version bump.
8. **Shared git repo detection** — During module path validation (Step 5), detect modules that resolve to the same git repository root (same `.git` directory via `git rev-parse --show-toplevel`). If found, error with: "Modules {X} and {Y} share git repo {path} — use inter-story dependencies within a single module instead." Parallel `git add`/`git commit` on the same `.git/index` would race.

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
| `src/agents/tool-permissions.ts` | Add `"integration-verifier": OUTPUT_TOOLS` |
| `src/agents/model-map.ts` | Add `"integration-verifier": "opus"` |
| `src/config/schema.ts` | Add `"integration-verifier": "opus"` to DEFAULT_MODEL_ASSIGNMENTS |
| `src/orchestrator.ts` | Wire `runIntegrateVerify()` between EXECUTE and REPORT stages. Add `approve-integration` checkpoint. |
| `src/types/checkpoint.ts` | Add `"approve-integration"` to checkpoint awaiting types |

**Key Design Decisions:**

1. **Skipped in single-repo mode** — When `plan.modules` is empty/undefined, returns `{ passed: true, skipped: true }`. Zero overhead for single-repo.
2. **Non-fatal (P39)** — Integration verification failure produces a report but doesn't block the REPORT stage. Explicit failure handling: if the verifier agent crashes or produces malformed output, log a warning with the error, skip integration results in the final report, and continue to REPORT. The human reviews at the `approve-integration` checkpoint.
3. **One agent per dependency edge** — For each pair `(depModule, consumerModule)` where `consumerModule.dependencies` includes `depModule.id`, spawn one integration-verifier agent. Example: if modules A, B, C exist and A depends on B and C, there are 2 edges (B->A and C->A), producing 2 verifier agents. Each agent reads the SPEC's `## Inter-Module Contracts` section and the relevant impl-reports for both modules in the pair.
4. **OUTPUT_TOOLS (not READ_ONLY_TOOLS)** — Integration verifier reads source and reports, then writes its integration report file. This requires `OUTPUT_TOOLS` (`[...READ_ONLY_TOOLS, "Write"]`). Using `READ_ONLY_TOOLS` would be a direct repeat of Phase 4 Bug 17 (F43/P42): the agent completes (exit 0) but never creates the output file because Write is not in its allowed tools.
5. **Uses `spawnAgentWithRetry()`** — Integration verifier uses the standard spawn path, which inherits stdin prompt passing from the Phase 4 fix (P41). No special-case spawn path.
6. **`approve-integration` checkpoint content** — The integration report presented at the checkpoint includes: (a) which module boundaries were checked, (b) PASS/FAIL per boundary, (c) plain-language summary of any contract mismatches. This gives the human enough context to make a real decision rather than rubber-stamping (P11, P12).
7. **Missing `## Inter-Module Contracts` handling** — If the SPEC has modules declared but no `## Inter-Module Contracts` section, the integration verifier reports "No contracts defined — cannot verify" as a WARNING (not PASS). This is surfaced at the `approve-integration` checkpoint so the human is aware the SPEC is incomplete. This guards against LLM non-determinism in the spec-drafter.

---

### Item 22: Module-Aware Story Ordering + Contracts

**Goal:** Extend the dependency scheduler and wave executor to respect module dependency order. Stories in dependency modules execute before consumer module stories.

**Files to modify:**

| File | What Changes |
|------|-------------|
| `src/state/execution-plan.ts` | Extend `getReadyStories()` to also check module dependency satisfaction. Extend `filterNonOverlapping()` to compare resolved absolute paths for cross-module correctness. |
| `src/stages/plan-stage.ts` | Planner prompt gains module-awareness: group stories by module, add inter-module contract instructions when modules exist. |
| `src/agents/prompts.ts` | Add conditional MULTI-MODULE rule to spec-drafter: "Include ## Inter-Module Contracts section" |

**Key Design Decisions:**

1. **Module topo sort reuses Kahn's algorithm** — `validateDependencies()` already does Kahn's for stories. Extract the sort into a reusable `topologicalSort()` and apply it to module order too. Cycle detection error message includes the full cycle path: "Circular dependency: module-A -> module-B -> module-C -> module-A" (P44 requires diagnostic context).
2. **Two-level ordering** — First sort modules topologically, then within each module sort stories by inter-story dependencies. Cross-module edges are inferred from module `dependencies` array.
3. **Wave executor unchanged** — The existing `getReadyStories()` + `filterNonOverlapping()` pattern works. `getReadyStories()` just needs to also check that the story's module's dependencies are satisfied (all stories in dependency modules are done). No new function needed — extend in-place.
4. **Inter-module contracts live in the SPEC only** — The `## Inter-Module Contracts` section in the SPEC is the single source of truth for contract definitions. The integration verifier (FW-14) reads this section for post-execution verification. No Story-level `exports`/`imports` fields are added in this phase — the SPEC-level contracts are sufficient and avoid dead schema. If per-story contract tracking proves necessary, it can be added in a future phase as a backlog item.
5. **Module assignment is prompt-guided only** — Step 8 adds prompt instructions for moduleId assignment. Do not add a code-level gate that rejects plans missing moduleId — that would create F49 dual-level enforcement.

---

## Execution Order

### Step 1: Module types + schema upgrade (no behavior change)
- Create `src/types/module.ts` with `Module` interface
- Add `moduleId?: string` to Story, `modules?: Module[]` to ExecutionPlan
- Update `validateExecutionPlan()` to accept the new optional fields (`modules` on plan, `moduleId` on stories). Schema version stays `2.0.0` — these are additive optional fields.
- Add schema auto-upgrade in `loadExecutionPlan()`: if no `modules` field, add `modules: []` and set `moduleId: "default"` on each story. Log at `debug` level for single-repo plans (intentional absence). Log at `warn` level only when a `## Modules` section exists but stories lack `moduleId` (genuine misconfiguration).
- Write tests: module type validation, schema upgrade, backward compat, upgrade log levels, validation accepts module fields
- Run `npm test` — verify no regressions

### Step 2: CWD threading through spawner (infrastructure, no behavior change)
- Add `cwd?: string` to AgentConfig in `src/types/agents.ts`
- In `spawnAgent()`: add `cwd: config.cwd` to the `spawnClaude()` options object (explicit named field, not a spread)
- Write tests: verify CWD passed through to spawnClaude, undefined CWD = no change
- Run `npm test` — verify no regressions

### Step 3: CWD threading through execute stages (infrastructure, no behavior change)
- Add `moduleCwd?: string` parameter to `runBuild()`, `runVerify()`, `runCommit()`
- Thread CWD into `AgentConfig.cwd` for agent spawns
- Thread CWD into `runShell()` for git operations in `runCommit()`
- In `runBuild()`: change `sourceFiles` join from `join(hiveMindDir, f)` to `join(moduleCwd ?? hiveMindDir, f)`
- In `runCommit()`: update `computeModifiedFiles()` to resolve `sourceFiles` against `moduleCwd ?? hiveMindDir`
- Shell behavior note: `runShell()` is platform-aware (`bash` on Windows, `true` elsewhere) and does not need changes for multi-repo CWD
- Update existing execute-stage tests to verify CWD parameter forwarding and sourceFiles resolution
- Run `npm test` — verify no regressions

### Step 4: Orchestrator CWD resolution + wave executor update
- Add `getModuleCwd(plan, moduleId)` to `state/execution-plan.ts`
- In `executeOneStory()`: resolve `moduleCwd = getModuleCwd(plan, story.moduleId)`, pass to runBuild/runVerify
- In wave executor post-wave: pass `moduleCwd` to `runCommit()`
- Update `filterNonOverlapping()` to resolve `sourceFiles` to absolute paths using each story's `moduleCwd` before comparison, so stories in different modules with the same relative paths (e.g., both have `src/index.ts`) are not falsely treated as overlapping
- Add pre-execution git state validation for non-default `moduleCwd`: verify git repo exists, warn on uncommitted changes, record current branch in manager log
- Note: this step involves conditional resolution logic beyond mechanical threading — expect it to take longer than a single stage threading pass
- Write tests: CWD resolved per story, undefined for single-repo, filterNonOverlapping with cross-module same-name files, git validation for external repos
- Run `npm test` — verify no regressions

### Step 5: Module parsing from PRD/SPEC
- Create `src/utils/module-parser.ts` with `parseModules(content: string): Module[]`
- Parse `## Modules` markdown table from SPEC (see expected table format in ENH-11)
- Resolve relative paths against PRD location
- Validate resolved paths: must exist as directories, no duplicates, no shared git repository roots. Fail fast with clear error (P44).
- Store modules in ExecutionPlan during plan stage
- Write tests: table parsing, path resolution, empty modules = single-repo, invalid path fails fast, duplicate path detection, shared git repo detection
- Run `npm test` — verify no regressions

### Step 6: Module-aware story ordering
- Extract `topologicalSort()` from `validateDependencies()` into reusable utility
- Extend `getReadyStories()` in-place to check module dependency satisfaction (no new function — avoids changing orchestrator call site)
- Handle zero-stories-in-module edge case: treat as vacuously satisfied, log warning
- Cycle detection error includes full cycle path (P44)
- Note: integration tests in this step use hand-crafted fixtures with explicit `moduleId` values. End-to-end validation with planner-generated moduleId happens after Step 8.
- Write tests: module topo sort, cross-module blocking, single-repo unchanged, cycle error message format, zero-stories-in-module warning
- Run `npm test` — verify no regressions

### Step 7: Integration verification stage (new stage)
- Create `src/stages/integrate-verify.ts`
- Add `"integration-verifier"` to AgentType, prompts, tool-permissions (`OUTPUT_TOOLS`), model-map, schema
- Wire into orchestrator between EXECUTE and REPORT
- Enumerate edges from `Module.dependencies`: for each `(depModule, consumerModule)` where `consumerModule.dependencies` includes `depModule.id`, spawn one verifier agent
- Add `approve-integration` checkpoint with boundary-level PASS/FAIL and plain-language mismatch summary
- Handle missing `## Inter-Module Contracts` section: report WARNING "No contracts defined — cannot verify" at checkpoint
- Single-repo: skip entirely
- Crash/malformed output handling: log warning, skip integration results, continue to REPORT (P39)
- Integration verifier uses `spawnAgentWithRetry()` (inherits P41 stdin fix)
- Write tests: stage skipped for single-repo, agent spawned per boundary, report produced, non-fatal on failure, crash handling logs warning, OUTPUT_TOOLS assigned, missing contracts produces WARNING
- Run `npm test` — verify no regressions

### Step 8: Planner + spec module-awareness
- Add MULTI-MODULE conditional rule to spec-drafter prompts
- Update planner prompt schema to include `moduleId` per story
- Add AC/EC generator module context injection
- Note: module assignment is prompt-guided only — do not add code-level gates for moduleId enforcement (F49)
- Write tests: module-aware planner output, contract instructions present
- Run `npm test` — verify no regressions

> `npx tsc --noEmit` — 0 errors
> `npm test` — all tests pass
> Commit
> Tier 3 dogfood (2-module PRD + single-repo regression PRD)
> Capture learnings, update progress.md, knowledge-base

---

## Tests to Write (Phase 6)

**Test File: `__tests__/types/module.test.ts` (NEW)**
Tests: ~4
Coverage: Module interface validation, empty modules array, role types

**Test File: `__tests__/state/module-helpers.test.ts` (NEW)**
Tests: ~11
Coverage: getModuleCwd resolution, schema auto-upgrade, auto-upgrade log levels, module topo sort, cross-module ready check, single-repo backward compat, zero-stories-in-module warning, validateExecutionPlan with module fields, filterNonOverlapping with cross-module paths

**Test File: `__tests__/agents/spawner-cwd.test.ts` (NEW or EXTEND spawner.test.ts)**
Tests: ~4
Coverage: CWD passed to spawnClaude, undefined CWD = no change, parallel spawn with mixed CWDs

**Test File: `__tests__/stages/execute-build.test.ts` (EXTEND)**
Tests: ~3
Coverage: moduleCwd forwarded to agent config, undefined moduleCwd = no CWD in config, sourceFiles resolved against moduleCwd

**Test File: `__tests__/stages/execute-verify.test.ts` (EXTEND)**
Tests: ~2
Coverage: moduleCwd forwarded to agent config

**Test File: `__tests__/stages/execute-commit.test.ts` (EXTEND)**
Tests: ~3
Coverage: git commands use moduleCwd, undefined moduleCwd = no CWD option, computeModifiedFiles resolves against moduleCwd

**Test File: `__tests__/orchestrator/module-execution.test.ts` (NEW)**
Tests: ~11
Coverage: CWD resolved per story, cross-module wave blocking, single-repo unchanged, integration stage skipped for single-repo, filterNonOverlapping cross-module same-name files, git state validation for external repos

**Test File: `__tests__/stages/integrate-verify.test.ts` (NEW)**
Tests: ~8
Coverage: Skipped for single-repo, agent spawned per boundary, report produced, non-fatal on failure, crash handling logs warning, OUTPUT_TOOLS assigned, missing contracts produces WARNING

**Test File: `__tests__/utils/module-parser.test.ts` (NEW)**
Tests: ~10
Coverage: Column parsing, dependency comma-split, empty dependencies, missing columns error, path resolution, empty table = empty array, malformed table warning, invalid path fails fast, duplicate path detection, shared git repo detection

Target: ~56 new tests. Verify baseline count at Phase 6 start and record it.

---

## Smoke Test Gate (from mvp-plan.md)

**Tier 1 (Unit):**
- Module parsing: PRD with `modules` array produces correct module config objects
- CWD resolution: relative module paths resolved correctly against PRD location
- Backward compat: PRD without `modules` field produces single-module default
- Topo sort: dependency-module stories sort before consumer-module stories
- Schema version: `modules` present uses extended schema; absent = current behavior
- Module path validation: nonexistent path fails fast with clear error naming the path and module
- sourceFiles resolution: `join(moduleCwd, f)` in runBuild, computeModifiedFiles, and filterNonOverlapping

**Tier 2 (Integration):**
- Multi-module execution with mocked spawner: verify `cwd` parameter passed correctly to each agent spawn
- Story ordering: 4 stories across 2 modules -> dep stories execute in earlier waves
- Integration verifier spawned after all module stories committed (mocked spawner captures call)
- Integration verifier has OUTPUT_TOOLS (not READ_ONLY_TOOLS)
- filterNonOverlapping: two stories with `sourceFiles: ["src/index.ts"]` in different modules are NOT treated as overlapping
- Single-repo regression: existing test suite passes unchanged

**Tier 3 (Dogfood — recommended):**
- Run a 2-module PRD (e.g., shared-lib exporting a utility + consumer importing it)
- Run an existing single-repo PRD to verify backward compatibility end-to-end
- After SPEC stage, assert `plan.modules.length > 0` for the multi-module PRD (prevents silent single-repo fallback per P48)
- Estimated cost: ~$25-40 (based on ~4-6 stories at ~$5-7/story from Phase 5 dogfood data)
- Verify: pipeline completes, CWD correct per module, integration verify runs, stories in correct order

---

## Risk Mitigations (informed by Phase 5 learnings + knowledge base)

| Risk | Mitigation |
|------|-----------|
| Parameter threading tedium (~20min per stage, ~60-100min total) | Steps 2-4 are mechanical — add `cwd?: string` to each signature. Follow P32 pattern exactly. Batch all stage changes in one step. |
| Agent file paths break when CWD changes | All orchestrator file paths (inputFiles, outputFile, reports) are already absolute (`join(hiveMindDir, ...)`). Agent CWD affects agent file I/O context — this is intentional. No orchestrator paths need to change. |
| sourceFiles resolution inconsistency | One resolution rule applied in all three consumers: `join(moduleCwd ?? hiveMindDir, f)` in `runBuild()`, `computeModifiedFiles()`, and `filterNonOverlapping()`. Defined as Key Design Decision 5 in ENH-11. |
| filterNonOverlapping false positives across modules | Resolve sourceFiles to absolute paths before comparison. Stories in different modules with the same relative path (e.g., `src/index.ts`) are correctly treated as non-overlapping. |
| Reports scattered across repos | Reports stay centralized in `hiveMindDir/reports/`. Module CWD is for code, not orchestrator artifacts. Story IDs are globally unique (single planner sequence). |
| Circular module dependencies | `topologicalSort()` throws on cycles with full cycle path in error: "Circular dependency: A -> B -> C -> A" (P44). Reuse proven Kahn's algorithm from ENH-02. |
| Integration verify blocks pipeline | Non-fatal (P39) — produces report but doesn't block REPORT stage. On crash/malformed output: log warning, skip integration results, continue. Human reviews at checkpoint. |
| Integration verifier produces no output | Use OUTPUT_TOOLS (not READ_ONLY_TOOLS) so the verifier can write its report file. READ_ONLY_TOOLS would repeat Phase 4 Bug 17 (F43/P42). |
| Missing inter-module contracts in SPEC | Integration verifier reports WARNING "No contracts defined — cannot verify" at checkpoint. Guards against spec-drafter LLM non-determinism. |
| Single-repo regression | Every step runs full test suite. Schema auto-upgrade is backward compatible. All new parameters are optional. Tier 3 includes a single-repo dogfood run. |
| Dual-level enforcement (F49) | Module-aware ordering uses code-level gates only. Module assignment in prompts (Step 8) is prompt-guided only — no code-level gate duplicating the same constraint. |
| Gate conditions unreachable (P48) | Tier 3 dogfood includes explicit assertion: `plan.modules.length > 0` after SPEC stage for multi-module PRD. Silent fallback to single-repo would hide the bug. |
| Schema auto-upgrade hides misconfiguration | Auto-upgrade logs at `debug` for single-repo (intentional absence) and `warn` when modules exist but stories lack moduleId (genuine misconfiguration). |
| Module execution state tracking (F30) | Module completion is derived from story statuses in execution-plan.json (already atomic). No separate in-memory tracker needed. Zero-stories-in-module treated as vacuously satisfied with warning. |
| Module path typo propagates silently | Path validation at parse time: each resolved path must exist as a directory, no duplicates allowed. Fail fast with error naming the invalid path and declaring module (P44). |
| Git operations in uninitialized/dirty external repos | Pre-execution validation for non-default `moduleCwd`: verify git repo exists, warn on uncommitted changes, record current branch in manager log. Prevents silent commits to wrong branches. |
| Parallel git conflicts in shared repos | During module path validation (Step 5), detect modules sharing the same git repository root. Error with clear message naming both modules and the shared repo path. Prevents `.git/index` lock races. |
| Shell behavior on Windows | `runShell()` is platform-aware (`bash` on Windows, `true` elsewhere) and does not need changes for multi-repo CWD. |

---

## Critique Log

**Pipeline:** Double-critique (P5), 2 rounds, 2026-03-14

### Round 1 (Critic-1)
**Findings:** 1 CRITICAL, 5 MAJOR, 6 MINOR (12 total)

| # | Severity | Topic | Disposition |
|---|----------|-------|-------------|
| 1 | MAJOR | Zero-stories-in-module edge case | **Applied** — added explicit rule: vacuously satisfied + warning log |
| 2 | MAJOR | Integration verifier boundary enumeration undefined | **Applied** — specified edge derivation from Module.dependencies with example |
| 3 | MAJOR | exports/imports fields are dead schema | **Applied** — removed from Story type, SPEC contracts are single source of truth |
| 4 | MINOR | Tier 1 test for contract validation has no implementation | **Applied** — replaced with module path validation test |
| 5 | MAJOR | No module path validation after resolution | **Applied** — added directory existence, duplicate, and shared-repo checks with fail-fast |
| 6 | MINOR | CWD threading time estimate optimistic | **Applied** — acknowledged non-mechanical orchestrator logic in Step 4 |
| 7 | CRITICAL | Git operations in external repos with no state validation | **Applied** — added pre-execution git state validation (repo exists, warn dirty, record branch) |
| 8 | MINOR | Centralized reports may collide across modules | **Applied** — confirmed story IDs are globally unique (single planner sequence) |
| 9 | MINOR | Auto-upgrade warning noise for single-repo | **Applied** — debug for single-repo, warn only for genuine misconfiguration |
| 10 | MINOR | Test count target falsely precise | **Applied** — changed to "baseline + ~N new tests, verify baseline at start" |
| 11 | MAJOR | Modules table format never defined | **Applied** — added full example table with column definitions |
| 12 | MINOR | File location for parseModules ambiguous | **Applied** — committed to src/utils/module-parser.ts |

**Application rate:** 12/12 (100%)

### Round 2 (Critic-2)
**Findings:** 3 CRITICAL, 6 MAJOR, 5 MINOR (14 total)

| # | Severity | Topic | Disposition |
|---|----------|-------|-------------|
| C1 | CRITICAL | spawner CWD threading language ambiguous | **Applied** — clarified "explicit named field, not automatic pass-through" |
| C2 | CRITICAL | sourceFiles resolution inconsistent across runBuild and filterNonOverlapping | **Applied** — defined one resolution rule applied in 3 places; updated filterNonOverlapping to use absolute paths |
| C3 | CRITICAL | runCommit will stage wrong files (frame of reference) | **Applied** — sourceFiles defined as module-relative; computeModifiedFiles resolves against moduleCwd |
| M1 | MAJOR | Step 6 before Step 8 untestable | **Applied** — added note: hand-crafted fixtures for unit tests, E2E after Step 8 |
| M2 | MAJOR | getReadyStories new function vs in-place edit contradiction | **Applied** — aligned to extend in-place (no new function) |
| M3 | MAJOR | validateExecutionPlan not updated for new fields | **Applied** — added to Step 1; schema stays 2.0.0 (additive optional fields) |
| M4 | MAJOR | Missing ## Inter-Module Contracts handling | **Applied** — added WARNING at checkpoint when contracts section absent |
| M5 | MAJOR | Parallel git conflicts in shared repos | **Applied** — added shared git repo detection at module validation time |
| M6 | MAJOR | CWD framing misleading (affects reads too) | **Applied** — rewrote Key Observation 2 accurately |
| m1 | MINOR | Test file organization duplication | **Applied** — merged into single test file per module |
| m2 | MINOR | Test count arithmetic fragile | **Applied** — simplified to "~56 new tests, verify baseline" |
| m3 | MINOR | Shell behavior on Windows not confirmed | **Applied** — added confirmation note |
| m4 | MINOR | Schema version never specified | **Applied** — added Decision 7: stays 2.0.0 |
| m5 | MINOR | Cost estimate without basis | **Applied** — added Phase 5 dogfood data rationale |

**Application rate:** 14/14 (100%)

### Summary
- **Total findings:** 26 (4 CRITICAL, 11 MAJOR, 11 MINOR)
- **All 26 applied** — 100% application rate
- **Most impactful finding:** C2 (sourceFiles resolution inconsistency) — affected 3 files, added Key Observation 6 and Key Design Decision 5, plus new test coverage and smoke test items
- **Recurring theme:** Path resolution frame-of-reference (C2, C3, #5) — three separate findings about the same class of bug (relative vs absolute paths in multi-repo context)
- **Highest-value round:** Round 2 found the sourceFiles resolution issues (3 CRITICALs) that Round 1 missed entirely
