# Hive Mind — Project Manifest

> AI-first navigation map. Static sections are manually maintained.
> Artifact Inventory is auto-generated at pipeline stage boundaries.

## Project Identity

Hive Mind v3 — AI-orchestrated development pipeline with human checkpoints.
Stack: Node 18+, TypeScript (strict), Claude CLI. Test runner: Vitest.

## Architecture

4-stage pipeline: **SPEC** → **PLAN** → **EXECUTE** (build/verify/commit/learn) → **REPORT**
21 agent types across 4 groups: research, architecture, execution, learning.
Entry points: `src/index.ts` (CLI), `src/orchestrator.ts` (pipeline controller).

## Source Map

| Directory | Purpose | Key files |
|-----------|---------|-----------|
| `src/agents/` | Agent spawning, prompts, model assignments | `spawner.ts`, `prompts.ts`, `model-map.ts` |
| `src/stages/` | Pipeline stage implementations | `spec-stage.ts`, `plan-stage.ts`, `execute-build.ts`, `execute-verify.ts`, `execute-commit.ts`, `execute-learn.ts`, `report-stage.ts`, `baseline-check.ts` |
| `src/types/` | TypeScript interfaces | `agents.ts`, `checkpoint.ts`, `execution-plan.ts`, `manager-log.ts`, `reports.ts` |
| `src/state/` | Checkpoint & plan state management | `checkpoint.ts`, `execution-plan.ts`, `manager-log.ts` |
| `src/memory/` | Persistent learning & KB graduation | `memory-manager.ts`, `graduation.ts` |
| `src/reports/` | Report parsing & templates | `parser.ts`, `templates.ts` |
| `src/utils/` | File I/O, shell, tokens, timestamps, cost tracking | `file-io.ts`, `shell.ts`, `cost-tracker.ts`, `notify.ts` |
| `src/tooling/` | Tool dependency detection & setup | `detect.ts`, `setup.ts` |
| `src/manifest/` | Manifest generation (this file) | `generator.ts` |

## Navigation Hints

- **Pipeline flow** → `src/orchestrator.ts`
- **Agent behavior & rules** → `src/agents/prompts.ts` (AGENT_JOBS + AGENT_RULES)
- **Add a new agent type** → `src/types/agents.ts` + `src/agents/prompts.ts` + `src/agents/model-map.ts`
- **Memory & learnings** → `.hive-mind/memory.md` then `.hive-mind/knowledge-base/`
- **Roadmap & backlog** → `docs/BACKLOG.md`
- **Current pipeline state** → `.hive-mind/.checkpoint`

## Conventions

- All file I/O through `src/utils/file-io.ts` (`writeFileAtomic` for atomicity)
- Agents spawned via `claude --print --dangerously-skip-permissions`
- ELI5 requirement for 6 agent types (reporter, retrospective, diagnostician, spec-drafter, spec-corrector, critic)
- Max 5 Tier-1 rules per agent type

---

## Artifact Inventory

> Auto-generated at 2026-03-12T17:00:48.024Z — do not edit below this line

### Spec Artifacts (7 files)

| File | Size | Modified |
|------|------|----------|
| `spec/critique-1.md` | 10.7 KB | 2026-03-12 |
| `spec/critique-2.md` | 8.7 KB | 2026-03-12 |
| `spec/justification.md` | 5.8 KB | 2026-03-12 |
| `spec/research-report.md` | 6.4 KB | 2026-03-12 |
| `spec/SPEC-draft.md` | 14.4 KB | 2026-03-12 |
| `spec/SPEC-v0.2.md` | 20.3 KB | 2026-03-12 |
| `spec/SPEC-v1.0.md` | 21.9 KB | 2026-03-12 |

### Plan Artifacts (37 files)

| File | Size | Modified |
|------|------|----------|
| `plans/acceptance-criteria.md` | 14.1 KB | 2026-03-12 |
| `plans/execution-plan.json` | 3.7 KB | 2026-03-12 |
| `plans/manifest-plan.md` | 8.6 KB | 2026-03-11 |
| `plans/mvp/learnings/phase-1-learnings.md` | 4.2 KB | 2026-03-12 |
| `plans/mvp/learnings/phase-2-learnings.md` | 8.4 KB | 2026-03-12 |
| `plans/mvp/learnings/phase-3-learnings.md` | 6.8 KB | 2026-03-12 |
| `plans/mvp/learnings/phase-4-learnings.md` | 7.9 KB | 2026-03-12 |
| `plans/mvp/phase-1-foundation.md` | 14.1 KB | 2026-03-12 |
| `plans/mvp/phase-2-reliability.md` | 16.4 KB | 2026-03-12 |
| `plans/mvp/phase-3-visibility-dx.md` | 13.8 KB | 2026-03-12 |
| `plans/mvp/phase-4-pipeline-quality.md` | 16.6 KB | 2026-03-12 |
| `plans/mvp/progress.md` | 4.8 KB | 2026-03-12 |
| `plans/mvp/workflow.md` | 8.4 KB | 2026-03-12 |
| `plans/mvp-plan.md` | 42 KB | 2026-03-12 |
| `plans/role-report-feedback-loop-plan.md` | 7.9 KB | 2026-03-12 |
| `plans/role-reports/analyst-report.md` | 4.1 KB | 2026-03-12 |
| `plans/role-reports/architect-report.md` | 3.6 KB | 2026-03-12 |
| `plans/role-reports/reviewer-report.md` | 9.3 KB | 2026-03-12 |
| `plans/role-reports/security-report.md` | 9 KB | 2026-03-12 |
| `plans/role-reports/tester-role-report.md` | 12.7 KB | 2026-03-12 |
| `plans/spawner-upgrade-plan.md` | 6.7 KB | 2026-03-07 |
| `plans/steps/US-01-acs.md` | 2.6 KB | 2026-03-12 |
| `plans/steps/US-01-ecs.md` | 1.7 KB | 2026-03-12 |
| `plans/steps/US-01-skeleton.md` | 0.5 KB | 2026-03-12 |
| `plans/steps/US-01.md` | 7.4 KB | 2026-03-12 |
| `plans/steps/US-02-acs.md` | 4.6 KB | 2026-03-12 |
| `plans/steps/US-02-ecs.md` | 3.5 KB | 2026-03-12 |
| `plans/steps/US-02-skeleton.md` | 0.5 KB | 2026-03-12 |
| `plans/steps/US-02.md` | 11.7 KB | 2026-03-12 |
| `plans/steps/US-03-acs.md` | 3.4 KB | 2026-03-12 |
| `plans/steps/US-03-ecs.md` | 2.7 KB | 2026-03-12 |
| `plans/steps/US-03-skeleton.md` | 0.6 KB | 2026-03-12 |
| `plans/steps/US-03.md` | 9.8 KB | 2026-03-12 |
| `plans/steps/US-04-acs.md` | 4.9 KB | 2026-03-12 |
| `plans/steps/US-04-ecs.md` | 5 KB | 2026-03-12 |
| `plans/steps/US-04-skeleton.md` | 0.8 KB | 2026-03-12 |
| `plans/steps/US-04.md` | 14.4 KB | 2026-03-12 |

### Report Artifacts (35 files)

| File | Size | Modified |
|------|------|----------|
| `reports/US-01/eval-report-1.md` | 2.5 KB | 2026-03-12 |
| `reports/US-01/eval-report.md` | 2.5 KB | 2026-03-12 |
| `reports/US-01/impl-report.md` | 1 KB | 2026-03-12 |
| `reports/US-01/learning.md` | 3.6 KB | 2026-03-12 |
| `reports/US-01/refactor-report.md` | 2 KB | 2026-03-12 |
| `reports/US-01/test-report-1.md` | 2.8 KB | 2026-03-12 |
| `reports/US-01/test-report.md` | 2.8 KB | 2026-03-12 |
| `reports/US-02/eval-report-1.md` | 3.1 KB | 2026-03-12 |
| `reports/US-02/eval-report.md` | 3.1 KB | 2026-03-12 |
| `reports/US-02/impl-report.md` | 1 KB | 2026-03-12 |
| `reports/US-02/learning.md` | 3.3 KB | 2026-03-12 |
| `reports/US-02/refactor-report.md` | 2.5 KB | 2026-03-12 |
| `reports/US-02/test-report-1.md` | 7 KB | 2026-03-12 |
| `reports/US-02/test-report.md` | 7 KB | 2026-03-12 |
| `reports/US-03/diagnosis-report-2.md` | 5.6 KB | 2026-03-12 |
| `reports/US-03/eval-report-1.md` | 5.6 KB | 2026-03-12 |
| `reports/US-03/eval-report-2.md` | 2.2 KB | 2026-03-12 |
| `reports/US-03/eval-report-3.md` | 2.2 KB | 2026-03-12 |
| `reports/US-03/eval-report.md` | 2.2 KB | 2026-03-12 |
| `reports/US-03/fix-report-1.md` | 2.3 KB | 2026-03-12 |
| `reports/US-03/fix-report-2.md` | 2.3 KB | 2026-03-12 |
| `reports/US-03/impl-report.md` | 1.7 KB | 2026-03-12 |
| `reports/US-03/learning.md` | 6.3 KB | 2026-03-12 |
| `reports/US-03/refactor-report.md` | 3 KB | 2026-03-12 |
| `reports/US-03/test-report-1.md` | 6.5 KB | 2026-03-12 |
| `reports/US-03/test-report-2.md` | 5.4 KB | 2026-03-12 |
| `reports/US-03/test-report-3.md` | 5.3 KB | 2026-03-12 |
| `reports/US-03/test-report.md` | 5.3 KB | 2026-03-12 |
| `reports/US-04/eval-report-1.md` | 4.7 KB | 2026-03-12 |
| `reports/US-04/eval-report.md` | 4.7 KB | 2026-03-12 |
| `reports/US-04/impl-report.md` | 2.2 KB | 2026-03-12 |
| `reports/US-04/learning.md` | 7.2 KB | 2026-03-12 |
| `reports/US-04/refactor-report.md` | 4.7 KB | 2026-03-12 |
| `reports/US-04/test-report-1.md` | 8.8 KB | 2026-03-12 |
| `reports/US-04/test-report.md` | 8.8 KB | 2026-03-12 |

### State Files (4 files)

| File | Size | Modified |
|------|------|----------|
| `consolidated-report.md` | 21.5 KB | 2026-03-12 |
| `manager-log.jsonl` | 6.6 KB | 2026-03-12 |
| `memory.md` | 2.4 KB | 2026-03-12 |
| `retrospective.md` | 13.6 KB | 2026-03-12 |

### Other (3 files)

| File | Size | Modified |
|------|------|----------|
| `code-review-report.md` | 4.4 KB | 2026-03-12 |
| `log-analysis.md` | 6.3 KB | 2026-03-12 |
| `reviews/sound-notification-feature-review.md` | 6.2 KB | 2026-03-11 |

