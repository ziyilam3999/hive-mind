# Phase 4: Pipeline Quality — Implementation Plan

## Inputs Consulted

- [x] **Memory (`memory.md`):** P6 (mechanical detection), P16 (self-contained step files), P27 (tight scope), P28 (spec quality drives code quality), P31 (verdict placement). Synthesizer split pattern noted 2026-03-06: "planner → parallel step writers → consolidator."
- [x] **Knowledge base (`knowledge-base/`):**
  - P20 (manager+subagent loop) — synthesizer split follows same pattern
  - C-CONTRACT-1 (output contracts mandatory) — AC/EC generators must produce files via Write tool, no fallback
  - C-ATOMIC-1 (atomic tracking writes) — enricher must not corrupt step files
  - F27 (output contract = suggestion → fail) — all new agents must use strict output contract (RD-12 from Phase 3)
  - F29 (inconsistent verification depth) — code-reviewer agent addresses this gap
- [x] **Phase 3 learnings:** Strict output contract works (fail explicitly, no fallback). Config threading continues to work. `getReadyStories()` ready for Phase 5. `safeUpdateManifest` pattern for non-fatal writes.
- [x] **mvp-plan.md:** 4 items (ENH-07, PRD-05, PRD-06, ENH-16). Tier 3 = at least 1 dogfood run (mandatory-ish). Cost ~$30-50.

---

## Items

### 12. ENH-07: Synthesizer Split

- **Goal:** Replace single synthesizer (Opus, monolithic) with 3 focused agents for better quality and parallelism
- **Current code:** `src/stages/plan-stage.ts:128-165` — single synthesizer call with `EXECUTION_PLAN_SCHEMA`
- **New pipeline:**
  1. Spawn `planner` (Opus): spec + role-reports → `execution-plan.json` with story skeletons (stepContent has GOAL, SPEC REFS, INPUT, OUTPUT — no ACs/ECs)
  2. Spawn `ac-generator` per story (Sonnet, parallel): skeleton + spec sections → `US-NN-acs.md`
  3. Spawn `ec-generator` per story (Sonnet, parallel): skeleton + ACs → `US-NN-ecs.md`
  4. Assemble final step files: skeleton + ACs + ECs → `US-NN.md`
  5. AC consolidator unchanged (reads final step files)
- **Files to modify:**
  - `src/stages/plan-stage.ts:128-186` — rewrite synthesizer section into 3-agent pipeline + assembly
  - `src/types/execution-plan.ts:3,5-21` — add `securityRisk`, `complexityJustification`, `dependencyImpact` fields to story skeleton
- **Key decision:** Planner still uses structured JSON output (`EXECUTION_PLAN_SCHEMA` minus AC/EC in stepContent). AC/EC generators output markdown. This keeps the planner's structured output reliable while allowing richer freeform content for ACs/ECs.

### 13. PRD-05: Code-Reviewer Agent

- **Goal:** Automated code quality review during REPORT stage
- **Current code:** `src/stages/report-stage.ts:39-56` — reporter + retrospective in parallel
- **Change:** Add first parallel batch (code-reviewer + log-summarizer), then second batch (reporter + retrospective). Reporter gains `code-review-report.md` as input.
- **Files to modify:**
  - `src/stages/report-stage.ts:24-56` — restructure into 2 parallel batches
- **Agent definition:**
  - type: `code-reviewer`
  - model: Sonnet
  - input: impl-reports + source files changed in this pipeline run
  - output: `.hive-mind/code-review-report.md`
- **Key decision:** Code-reviewer runs BEFORE reporter so its output can inform the final report. Two-batch structure: batch 1 (code-reviewer + log-summarizer, independent inputs), batch 2 (reporter + retrospective, uses batch 1 outputs).

### 14. PRD-06: Log-Summarizer Agent

- **Goal:** Analyze `manager-log.jsonl` for pipeline health patterns (retry rates, cost outliers, slow agents)
- **Agent definition:**
  - type: `log-summarizer`
  - model: Haiku
  - input: `manager-log.jsonl`
  - output: `.hive-mind/log-analysis.md`
- **Key decision:** Runs in parallel with code-reviewer (independent inputs). Haiku is sufficient — this is pattern extraction from structured logs, not reasoning.

### 15. ENH-16: Role-Report Feedback Loop

- **Goal:** Inject role-report knowledge into planning (enricher) and execution (prompt injection)
- **Part A — Planning enrichment:**
  - After step file assembly (ENH-07 step 4), spawn `enricher` (Sonnet) per story with step file + matching role-reports (filtered by `story.rolesUsed`)
  - Enricher appends `## Implementation Guidance`, `## Security Requirements`, `## Edge Cases` sections
  - Failure is non-fatal: original step file preserved on error, step file validated after enrichment
  - **Files to modify:** `src/stages/plan-stage.ts` (after assembly), `src/types/execution-plan.ts` (rolesUsed field)
- **Part B — Execution injection:**
  - Add `ROLE_REPORT_MAPPING` constant + `getRoleReportsForAgent()` to `src/agents/prompts.ts`
  - Thread `roleReportsDir` from orchestrator to `runBuild()`, `runVerify()`, `runLearn()`
  - Inject role-report content into agent prompts via `config.roleReportContents`
  - **Files to modify:** `src/agents/prompts.ts`, `src/stages/execute-build.ts:11,33-55`, `src/stages/execute-verify.ts:24,64-196`, `src/stages/execute-learn.ts:18,30-62`, `src/orchestrator.ts:228,248,255,310`, `src/types/agents.ts` (+roleReportContents on AgentConfig)
- **Mapping:**
  | Agent Type | Role Reports |
  |-----------|-------------|
  | implementer | architect, security, analyst |
  | tester-exec | tester-role, analyst, security |
  | diagnostician | architect, security, tester-role |
  | refactorer | architect, reviewer |
  | learner | all 5 |
  | evaluator | none |
- **Key decision:** `getRoleReportsForAgent()` only includes roles in `rolesUsed` to avoid prompt bloat. Truncate to ~2000 words per report (P27 tight scope). `roleReportsDir` parameter is optional (`?: string`) to avoid breaking existing callers (Phase 2 learning: caller audit).

---

## Execution Order

### Step 1: Agent Type Registration (all 6 new types)

1. Add 6 agent types to `src/types/agents.ts:3-24` AgentType union: `planner`, `ac-generator`, `ec-generator`, `code-reviewer`, `log-summarizer`, `enricher`
2. Add `roleReportContents?: string` to AgentConfig in `src/types/agents.ts:26-33`
3. Add 6 entries to `AGENT_MODEL_MAP` in `src/agents/model-map.ts:3-25` (planner=Opus, ac-generator=Sonnet, ec-generator=Sonnet, code-reviewer=Sonnet, log-summarizer=Haiku, enricher=Sonnet)
4. Add 6 `AGENT_JOBS` + 6 `AGENT_RULES` entries in `src/agents/prompts.ts:3-151`
5. Add 6 `DEFAULT_MODEL_ASSIGNMENTS` in `src/config/schema.ts:22-44`
6. Add `ROLE_REPORT_MAPPING` constant + `getRoleReportsForAgent(agentType, rolesUsed)` to `src/agents/prompts.ts`
7. Update `buildPrompt()` in `src/agents/prompts.ts` to include `## ROLE REPORTS` section when `config.roleReportContents` is present
8. Write tests: all 6 types in AgentType, model map, jobs, rules, default assignments, role-report mapping
9. Run `npm run build && npm test`

### Step 2: ENH-07 — Synthesizer Split

**Depends on: Step 1**

1. Modify `src/types/execution-plan.ts:3,5-21`: add `securityRisk`, `complexityJustification`, `dependencyImpact` fields to story type
2. Rewrite `src/stages/plan-stage.ts:128-186`:
   - Replace single synthesizer call with `planner` spawn (Opus) → `execution-plan.json`
   - Parse planner output, extract story skeletons
   - Spawn `ac-generator` per story in parallel (Sonnet) → `US-NN-acs.md`
   - Spawn `ec-generator` per story in parallel (Sonnet), passing ACs as input → `US-NN-ecs.md`
   - Assemble final step files: skeleton + ACs + ECs → `US-NN.md`
   - AC consolidator unchanged (reads final step files)
3. Write unit tests: planner spawned with correct schema, ac-gen/ec-gen spawn count matches story count, assembly produces valid step files
4. Write integration test: planner → ac-gen → ec-gen spawn order + count
5. Run `npm run build && npm test`

### Step 3: PRD-05 + PRD-06 — Report Stage Reviewers

**Depends on: Step 1**

1. Restructure `src/stages/report-stage.ts:24-56` into 2 parallel batches:
   - Batch 1: spawn `code-reviewer` + `log-summarizer` in parallel
   - Wait for batch 1 to complete
   - Batch 2: spawn `reporter` + `retrospective` in parallel (reporter receives `code-review-report.md` as input)
2. Code-reviewer: input = impl-reports + changed source files, output = `.hive-mind/code-review-report.md`
3. Log-summarizer: input = `manager-log.jsonl`, output = `.hive-mind/log-analysis.md`
4. Reporter prompt updated to reference code-review-report.md
5. Write unit tests: code-reviewer receives correct inputs, log-summarizer receives correct inputs, batch ordering (batch 1 before batch 2)
6. Write integration test: code-reviewer + log-summarizer complete before reporter starts
7. Run `npm run build && npm test`

### Step 4: ENH-16 Part A — Enricher in Plan Stage

**Depends on: Step 2**

1. After step file assembly in `src/stages/plan-stage.ts`, add enricher loop:
   - For each story, spawn `enricher` (Sonnet) with step file + role-reports filtered by `story.rolesUsed`
   - Enricher appends `## Implementation Guidance`, `## Security Requirements`, `## Edge Cases`
   - Wrap in try/catch: on failure, keep original step file (Phase 3 `safeUpdateManifest` pattern)
   - Validate step file after enrichment (existing sections intact)
2. Add `rolesUsed` field to story type in `src/types/execution-plan.ts`
3. Write unit tests: enricher appends without modifying existing content, enricher failure preserves original, validation catches corruption
4. Run `npm run build && npm test`

### Step 5: ENH-16 Part B — Role-Report Injection in Execution

**Depends on: Step 1**

1. Thread `roleReportsDir` through orchestrator to execution stages:
   - `src/orchestrator.ts:228,248,255,310` — pass `roleReportsDir` to `runBuild()`, `runVerify()`, `runLearn()`
   - `src/stages/execute-build.ts:11,33-55` — accept `roleReportsDir` param, call `getRoleReportsForAgent()`, set `config.roleReportContents`
   - `src/stages/execute-verify.ts:24,64-196` — same pattern
   - `src/stages/execute-learn.ts:18,30-62` — same pattern
2. `roleReportsDir` is optional (`?: string`) — grep all call sites before changing signatures (Phase 2 learning: caller audit)
3. Write unit tests: `roleReportsDir` parameter threaded correctly, role-report content appears in agent prompt, missing `roleReportsDir` → no `## ROLE REPORTS` section
4. Run `npm run build && npm test`

### Step 6: Final Verification

**Depends on: Steps 1-5**

1. Run full test suite: `npm run build && npm test`
2. Verify all Tier 1 smoke tests pass
3. Run Tier 2 integration tests
4. Run Tier 3 dogfood: at least 1 full pipeline run (~$30-50)
5. Document results in learnings

---

## Tests to Write

### New Test Files

**`src/__tests__/agents/agent-type-registry.test.ts`**
- All 6 new types exist in AgentType union (planner, ac-generator, ec-generator, code-reviewer, log-summarizer, enricher)
- All 6 present in `AGENT_MODEL_MAP` with correct models
- All 6 have `AGENT_JOBS` entries (non-empty strings)
- All 6 have `AGENT_RULES` entries
- All 6 have `DEFAULT_MODEL_ASSIGNMENTS`

**`src/__tests__/agents/role-report-mapping.test.ts`**
- `getRoleReportsForAgent('implementer', [...])` returns [architect, security, analyst]
- `getRoleReportsForAgent('tester-exec', [...])` returns [tester-role, analyst, security]
- `getRoleReportsForAgent('evaluator', [...])` returns []
- `getRoleReportsForAgent('learner', [...])` returns all 5
- `buildPrompt()` includes `## ROLE REPORTS` section when `config.roleReportContents` is set
- `buildPrompt()` omits `## ROLE REPORTS` section when `config.roleReportContents` is undefined

**`src/__tests__/integration/synthesizer-split.test.ts`**
- Planner spawned first (Opus model)
- AC-generators spawned after planner completes (count matches story count)
- EC-generators spawned after AC-generators complete (count matches story count)
- Final step files contain skeleton + ACs + ECs sections
- AC consolidator runs after assembly

**`src/__tests__/integration/report-stage-reviewers.test.ts`**
- Code-reviewer + log-summarizer spawned in batch 1
- Reporter + retrospective spawned in batch 2 (after batch 1 completes)
- Reporter receives `code-review-report.md` as input
- Log-summarizer receives `manager-log.jsonl` as input

### Updated Test Files

**`src/__tests__/stages/plan-stage.test.ts`**
- Synthesizer split: planner → ac-gen → ec-gen pipeline replaces single synthesizer
- Enricher spawned per story after assembly
- Enricher failure doesn't crash plan stage (non-fatal)
- Step file validated after enrichment

**`src/__tests__/stages/report-stage.test.ts`**
- Two-batch structure: batch 1 (reviewers) completes before batch 2 (reporter + retro)
- Code-reviewer output available to reporter

**`src/__tests__/stages/execute-build.test.ts`**
- `roleReportsDir` parameter accepted and threaded
- Role-report content injected into agent config
- Missing `roleReportsDir` → no injection (backward compatible)

**`src/__tests__/stages/execute-verify.test.ts`**
- `roleReportsDir` parameter accepted and threaded
- Role-report content injected into agent config

**`src/__tests__/stages/execute-learn.test.ts`**
- `roleReportsDir` parameter accepted and threaded
- Role-report content injected into agent config

---

## Smoke Test Gate (from mvp-plan.md)

**Tier 1 (Unit):**
- New agent types registered: all 6 in AgentType, AGENT_MODEL_MAP, AGENT_JOBS, DEFAULT_MODEL_ASSIGNMENTS
- Synthesizer split spawns 3 agents (planner, ac-generator, ec-generator) instead of 1 synthesizer
- Code-reviewer receives impl-reports + source files as input
- Log-summarizer receives `manager-log.jsonl` as input
- `getRoleReportsForAgent()` mapping correct for all agent types
- Enricher appends sections without modifying existing step file content
- Enricher failure preserves original step file

**Tier 2 (Integration):**
- Plan stage spawns planner → ac-gen → ec-gen in order (not parallel across phases)
- Report stage batch 1 (code-reviewer + log-summarizer) completes before batch 2 (reporter + retrospective)
- Role-report content appears in execution agent prompts when `roleReportsDir` is set
- Role-report content absent from prompts when `roleReportsDir` is not set

**Tier 3 (Dogfood — mandatory):**
- At least 1 full pipeline run with all Phase 4 changes active
- Estimated cost: ~$30-50
- Goal: validate synthesizer split quality matches monolithic synthesizer
- Pass criteria: pipeline completes without crash, step files contain valid ACs/ECs

---

## Risk Mitigations

| Risk | Mitigation | Source |
|------|-----------|--------|
| Planner quality ≠ monolithic synthesizer | Same `EXECUTION_PLAN_SCHEMA` (minus AC/EC). Compare output with existing test PRDs during Tier 3 dogfood. | P28 (spec quality drives code quality) |
| Per-story AC/EC spawns increase cost | Sonnet (cheaper than Opus), parallel execution. Memory note: "split estimated 7-8 min vs 25+ min." Net cost similar, latency much lower. | memory.md 2026-03-06 |
| Enricher corrupts step files | Non-fatal: original preserved on error (Phase 3 `safeUpdateManifest` pattern). Step file validated after enrichment — revert if existing sections missing. | Phase 3 learning |
| Role-report content bloats prompts | `getRoleReportsForAgent()` only includes roles in `rolesUsed`. Truncate to ~2000 words per report. | P27 (tight scope) |
| Signature changes break callers | `roleReportsDir` is optional (`?: string`). Grep all call sites before changing any function signatures. | Phase 2 learning (caller audit), F31 |
| New agents fail to create output | RD-12 strict output contract (Phase 3) detects missing files. Reporter/enricher check `fileExists()` before consuming optional inputs. | Phase 3 RD-12 |
| Two-batch report stage increases latency | Batch 1 agents (code-reviewer=Sonnet, log-summarizer=Haiku) are fast. Total report stage time increase estimated <2 min. | First principles |

---

## Critical Files

| File | Lines | Change |
|------|-------|--------|
| `src/types/agents.ts` | 3-24, 26-33 | +6 agent types to union, +`roleReportContents` on AgentConfig |
| `src/agents/prompts.ts` | 3-151 | +6 AGENT_JOBS, +6 AGENT_RULES, +ROLE_REPORT_MAPPING, +`getRoleReportsForAgent()`, `buildPrompt()` update for `## ROLE REPORTS` |
| `src/agents/model-map.ts` | 3-25 | +6 model assignments (planner=Opus, others=Sonnet/Haiku) |
| `src/config/schema.ts` | 22-44 | +6 DEFAULT_MODEL_ASSIGNMENTS |
| `src/stages/plan-stage.ts` | 128-186 | Rewrite: 3-agent pipeline + enricher + step file assembly |
| `src/stages/report-stage.ts` | 24-56 | Restructure: 2 parallel batches (reviewers → reporter+retro) |
| `src/stages/execute-build.ts` | 11, 33-55 | +`roleReportsDir` param, inject role-report content |
| `src/stages/execute-verify.ts` | 24, 64-196 | +`roleReportsDir` param, inject role-report content |
| `src/stages/execute-learn.ts` | 18, 30-62 | +`roleReportsDir` param, inject role-report content |
| `src/orchestrator.ts` | 228, 248, 255, 310 | Thread `roleReportsDir` to all execution stages |
| `src/types/execution-plan.ts` | 3, 5-21 | +`securityRisk`, `complexityJustification`, `dependencyImpact`, `rolesUsed` on story type |
