# Phase 4: Pipeline Quality — Learnings

**Completed:** 2026-03-12 | **Items:** ENH-07 (Synthesizer Split), PRD-05 (Code-Reviewer Agent), PRD-06 (Log-Summarizer Agent), ENH-16 (Role-Report Feedback Loop)

---

## Design Decisions & Rationale

### ENH-07: Synthesizer split — planner → AC-gen → EC-gen pipeline
Replaced the single monolithic synthesizer with 3 focused agents. The planner (Opus) produces story skeletons with metadata (id, title, specSections, dependencies, sourceFiles, complexity). AC-generators and EC-generators (Sonnet) run in parallel per story via `spawnAgentsParallel()`. Final step files are assembled from skeleton + ACs + ECs.

**Key change:** Planner no longer produces `stepContent`. Instead it produces skeletons, and AC/EC generators fill in the criteria sections independently. This separation means each generator can focus on its specific concern without context interference.

**Tradeoff:** 3 agents instead of 1 means more API calls, but each call is focused and uses the appropriate model tier (Opus for decomposition, Sonnet for criteria generation).

### ENH-07: Story type gains optional metadata fields
Added `securityRisk`, `complexityJustification`, and `dependencyImpact` as optional fields on `Story`. These are populated by the planner and flow through to enricher and execution agents. Optional fields maintain backward compatibility — existing execution-plan.json files without these fields still parse correctly.

### PRD-05 + PRD-06: Two-batch report stage structure
Report stage now has 2 batches instead of 1:
- **Batch 1:** code-reviewer + log-summarizer run in parallel (independent inputs)
- **Batch 2:** reporter + retrospective run in parallel (consume batch 1 outputs)

This ensures the reporter sees code review findings and log analysis before generating the consolidated report. The log-summarizer only spawns if `manager-log.jsonl` exists (skip on empty runs).

### PRD-05: Code-reviewer collects impl + refactor reports + source files
`collectImplAndRefactorReports()` scans report directories for `impl-report.md` and `refactor-report.md`. `collectChangedSourceFiles()` extracts unique `sourceFiles` from execution-plan.json. Both are passed as inputs to the code-reviewer agent.

### ENH-16: Role-report feedback — `buildRoleReportContents()` helper
New function reads role-report files, filters by the agent type's mapping (via `getRoleReportsForAgent()`), truncates each to 2000 words, and returns concatenated content. Injected via `roleReportContents` field in `AgentConfig`. Every execution agent (implementer, refactorer, tester-exec, evaluator, fixer, diagnostician, learner) now receives relevant role-report context.

### ENH-16: Enricher as non-fatal post-processing
The enricher runs after step file assembly and adds Implementation Guidance, Security Requirements, and Edge Cases sections. It's wrapped in try/catch — if enricher fails, the original step file is preserved. If enricher corrupts the step file (missing AC/EC sections), the file is reassembled from cached AC/EC outputs.

**Pattern:** Non-fatal enrichment with corruption detection and automatic recovery.

### RoleName fix: "tester" → "tester-role"
Fixed `RoleName` type to use `"tester-role"` instead of `"tester"` to avoid collision with the `"tester-exec"` agent type. Role names and agent types are different concepts — roles are planning-phase personas, agents are execution-phase workers.

---

## Technical Challenges

### Planner schema change — no more `stepContent` (cost: ~15min)
**Problem:** The original synthesizer produced `stepContent` as a single markdown blob per story. The split pipeline needs structured AC/EC content, not a monolithic blob.

**Fix:** Planner schema explicitly says "Do NOT include stepContent or ACs/ECs — produce skeletons only." Skeleton + AC + EC are assembled in `assembleStepFile()`. The `extractStepFiles()` function (which read `stepContent` from JSON) was replaced entirely.

### Role-report threading through 5 execute functions (cost: ~20min)
**Problem:** Adding `roleReportsDir` parameter to `runBuild`, `runVerify`, `runLearn` + the internal `runFixPipeline` required updates to 5 function signatures and all their call sites in `orchestrator.ts`.

**Fix:** Made `roleReportsDir` optional (`?`) on all functions for backward compatibility. The orchestrator resolves the path once (`join(hiveMindDir, "plans", "role-reports")`) and threads it through. Each function calls `buildRoleReportContents()` with its specific agent type.

### Enricher corruption guard (cost: ~10min)
**Problem:** The enricher rewrites the step file in-place. If it produces malformed output (missing required sections), downstream agents would fail.

**Fix:** After enricher runs, validate that `## ACCEPTANCE CRITERIA` and `## EXIT CRITERIA` sections still exist. If either is missing, log a warning and reassemble from the cached AC/EC generator outputs. This makes enrichment idempotent-safe.

---

## Patterns Established

| Pattern | Where | Reuse in Phase 5+ |
|---------|-------|-------------------|
| Multi-agent pipeline (planner → gen → gen) | `stages/plan-stage.ts` | Sub-task decomposition (FW-01) |
| Two-batch stage with dependency ordering | `stages/report-stage.ts` | Any stage with producer→consumer agents |
| Non-fatal enrichment with corruption detection | `stages/plan-stage.ts` | Any post-processing that modifies existing artifacts |
| `buildRoleReportContents()` context injection | `agents/prompts.ts` | Any agent needing cross-phase context |
| Word-count truncation for context budgeting | `agents/prompts.ts` | Large context injection with token limits |
| Optional metadata fields on Story type | `types/execution-plan.ts` | Future schema extensions |
| `collectImplAndRefactorReports()` file discovery | `stages/report-stage.ts` | Any cross-story report aggregation |

---

## Test Coverage

| Item | New Tests | Test Files |
|------|-----------|------------|
| ENH-07 | Plan-stage tests updated (3-agent pipeline) + synthesizer-split integration | `stages/plan-stage.test.ts`, `integration/synthesizer-split.test.ts` |
| PRD-05 | Report-stage tests updated (two-batch) + reviewer integration | `stages/report-stage.test.ts`, `integration/report-stage-reviewers.test.ts` |
| PRD-06 | Log-summarizer spawn in report-stage tests | `stages/report-stage.test.ts` |
| ENH-16 | Role-report mapping tests, checkpoint-write with roleReportsDir, execute-build/learn role injection | `agents/role-report-mapping.test.ts`, `orchestrator/checkpoint-write.test.ts`, `stages/execute-build.test.ts`, `stages/execute-learn.test.ts` |

Total: 239 tests across 40 files (up from 207 tests / 36 files in Phase 3).

---

## Tier 3 Status

Phase 4 Tier 3 dogfood has NOT been run yet. The plan requires at least 1 dogfood run before starting Phase 5. Recommended candidates:
- PRD-05 (code-reviewer) — natural self-test: the generated reviewer reviews its own generated code
- ENH-07 (synthesizer split) — validates the new 3-agent planning pipeline
- Estimated cost: ~$30-50 total

**Important:** This will be the first live pipeline run since Phase 2's hello-world test. Phases 3-4 changed agent spawning (output mode fix), report parsing (structured output), plan-stage pipeline (synthesizer split), and report-stage structure (two-batch). All need live validation.

---

## Key Takeaway

Phase 4 is the most architecturally significant phase since the initial build. The synthesizer split changes how plans are generated (1 agent → 3 agents), the two-batch report stage changes how reports are produced (1 batch → 2 batches with dependencies), and the role-report feedback loop threads cross-phase context through every execution agent. Despite the scope, all changes are additive or replacements of isolated pipeline steps — the orchestrator's core loop is unchanged (only 3 lines added for `roleReportsDir` threading). The 239 tests provide regression coverage, but the Tier 3 dogfood run is critical to validate these changes work end-to-end with real Claude API calls.
