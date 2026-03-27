# Double-Critique Pipeline -- Effectiveness Report

**Date:** 2026-03-27
**Run number:** 12 (cumulative)
**Author:** Effectiveness analysis agent

---

## This Run

Run 12 critiqued a second iteration of the Automated UI Design Stage PRD and surfaced 17 findings across two critique rounds with 100% application rate, but the Drafter introduced 3 regressions -- the worst regression count since tracking began -- breaking the two-run zero-regression streak (R10-R11R).

- **Document critiqued:** Automated UI Design Stage PRD v1.0 -> v1.3 (`.ai-workspace/plans/2026-03-27-design-stage-prd.md`)
- **Total findings: 17** (CRITICAL: 1, MAJOR: 7, MINOR: 9)
- **Application rate: 100%** (17/17)
- **Drafter regressions: 3** (keyword example contradiction, silent token divergence, uncapped YAML loop)
- **Corrector-1 regressions: 1** (dismissed file-listing UX as "implementation detail")
- **Evidence-gating compliance: 95%** (Drafter 92%, Corrector-1 100%)
- **False verification claims: 0**
- **Novelty-flag compliance: ~90%** (14 tagged of ~15-16 novel claims)

### Stage contributions

| Stage | Contribution | Key output |
|-------|-------------|-----------|
| Critic-1 | **HIGHEST (MVP)** | 9 findings (1C/3M/5Mi). Found only CRITICAL + all 3 Drafter regressions |
| Researcher | **HIGH** | 11 codebase verifications, 3 MAJOR gaps, keyword false-positive analysis, 0 false positives |
| Critic-2 | **HIGH** | 8 findings (0C/4M/4Mi), zero overlap with Critic-1. Found JS+no-deps feasibility conflict |
| Corrector-2 | **HIGH** | 8/8 applied, zero regressions. Most reliable stage |
| Drafter | **MEDIUM** | 14 changes but 3 regressions -- worst single-run count |
| Corrector-1 | **MEDIUM** | 9/9 applied but 1 regression (dismissed UX concern) |

---

## Cross-Run Trends

### Finding counts across all runs

| Run | Date | Document | C | M | Mi | Total | App% | D-reg | C1-reg |
|-----|------|----------|---|---|-----|-------|------|-------|--------|
| 1 | 03-08 | Rate Limiter (fixture) | 3 | 7 | 8 | 18 | 94% | ? | 0 |
| 2 | 03-08 | E2E Bug Fix | 2 | 6 | 7 | 15 | 93% | ? | 1 |
| 3 | 03-14 | Phase 6 Plan | 4 | 11 | 11 | 26 | 100% | ? | ? |
| 4 | 03-15 | Post-MVP Plan | 4 | 9 | 6 | 19 | 100% | ? | 2 |
| 5 | 03-17 | Normalize Stage | 2 | 8 | 7 | 17 | 100% | ? | 1 |
| 6 | 03-21 | Pipeline Failure Fix | 3 | 7 | 8 | 18 | 94% | 0 | 1 |
| 7 | 03-21 | CI/CD Reference | 3 | 8 | 9 | 20 | 100% | 2 | 2 |
| 8 | 03-22 | Pipeline Bug Fix | 2 | 9 | 9 | 20 | 100% | 2 | 1 |
| 9 | 03-22 | PRD Workflow | 3 | 7 | 8 | 18 | 88% | 2 | 1 |
| 10 | 03-22 | Live Summary Report | 1 | 9 | 10 | 20 | 100% | 0 | 0 |
| 11R | 03-24 | Design Stage PRD | 3 | 8 | 10 | 21 | 100% | 0 | 0 |
| **12** | **03-27** | **Design Stage PRD v2** | **1** | **7** | **9** | **17** | **100%** | **3** | **1** |

### Regression tracking table

| Run | Drafter reg. | C1 reg. | Evidence-gating | Novelty-flag |
|-----|-------------|---------|-----------------|--------------|
| 9 | 2 | 1 | 82% | N/A |
| 10 | 0 | 0 | 100% | N/A |
| 11R | 0 | 0 | 100% | 0% |
| **12** | **3** | **1** | **95%** | **~90%** |

**Key trends:**
- R10-R11R zero-regression streak broken. 3 Drafter regressions is worst count tracked.
- Sub-100% evidence-gating correlates with regressions in all 4 measured runs.
- Novelty-flag compliance jumped from 0% to ~90% (fastest metric improvement in pipeline history).
- Finding count (17) tied for second-lowest, reflecting higher-quality input (second pass on same document).

---

## Stage Effectiveness Rankings

| Stage | Contribution | Trend |
|-------|-------------|-------|
| Critic-1 | HIGH | STABLE |
| Critic-2 | HIGH | STABLE (peak) |
| Researcher | HIGH | STABLE |
| Corrector-2 | HIGH | STABLE (peak) |
| Drafter | MEDIUM | DECLINING (this run) |
| Corrector-1 | MEDIUM | DECLINING (slight) |

---

## What's Working

1. **Two critique rounds find different bug classes** (12/12 runs) -- zero overlap between Critic-1 and Critic-2 in Run 12.
2. **Evidence-gating eliminates fabricated verification** (3 consecutive runs, 0 false claims).
3. **Researcher front-loading** (12/12 runs, zero false positives ever).
4. **Corrector-2 is the most reliable stage** (12/12 runs, 0 regressions ever).
5. **Novelty-flag compliance jumped 0% -> ~90%** in one run.

## What's Not Working

1. **Drafter regressions not structurally solved** -- R10-R11R zeros were a streak, not a new baseline. Needs "consistency pass" instruction.
2. **NP-1 pattern ambiguous** -- 95% evidence-gating -> regressions, but regressions were content errors not evidence errors.
3. **Silent config/integration gaps persist** (10/12 runs) -- same categories keep appearing.

---

## So What?

- Run 12 breaks the zero-regression streak with 4 total regressions (3 Drafter + 1 Corrector-1). Evidence-gating at 95% instead of 100% correlates with the return. The Drafter needs a structural "re-read for internal consistency" instruction.
- The pipeline still delivers: 17 findings caught, 100% applied, zero false claims. Even with a regression-heavy Drafter, critics caught everything. Final v1.3 is clean.
- Novelty-flag compliance jumped 0% -> ~90%. Fastest metric improvement in history.
- Enforce 100% evidence-gating compliance or accept regression risk. The data across 4 measured runs is consistent.
- Critic-1 remains the safety net. Found the only CRITICAL and all 3 Drafter regressions.
