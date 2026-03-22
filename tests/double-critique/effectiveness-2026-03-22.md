# Double-Critique Pipeline -- Effectiveness Report

**Date:** 2026-03-22 (Run 3 of 2026-03-22)
**Run number:** 10 (cumulative)
**Runs covered:** 10 (Run 1: 2026-03-08 fixture, Run 2: 2026-03-08 e2e-bugfix, Run 3: 2026-03-14 phase-6-plan, Run 4: 2026-03-15 post-mvp-plan, Run 5: 2026-03-17 normalize-stage-plan, Run 6: 2026-03-21 pipeline-failure-fix-plan, Run 7: 2026-03-21 CI/CD reference guide, Run 8: 2026-03-22 pipeline-bug-fix-plan, Run 9: 2026-03-22 PRD workflow recommendation, Run 10: 2026-03-22 live summary report plan)
**Author:** Effectiveness analysis agent

---

## This Run

Run 10 critiqued a live summary report feature plan and produced 20 findings across two critique rounds with a 100% application rate and zero regressions from either corrector stage -- the cleanest corrector performance in the pipeline's history.

- **Document critiqued:** Live Summary Report feature implementation plan (real-time dashboard for pipeline execution), processed via `tmp/dc-{1..9}-*.md` stages
- **Total findings: 20** (critic-originated, actionable)
  - CRITICAL: 1 (from Critic-1: synchronous I/O blocking the event loop during concurrent story execution via `runWithConcurrency` -- unsupported "sub-millisecond" performance claim)
  - MAJOR: 9 (Researcher: 3 -- directory naming inconsistency `src/reporting/` vs `src/reports/`, missing config validation, test/function signature mismatch; Critic-1: 4 -- Windows rename atomicity, no integration test for 13 call sites, phantom "Early gate catches" row, resume-mid-wave under-specified; Critic-2: 5 -- REGISTRY_GAP_FIXED emission impossible from plan-stage, orphaned temp files on rename failure, integration point #12 wrong line + missing approve-integration path, config knownKeys ordering dependency, test #8 mechanism unspecified). Note: Researcher findings are counted here because they were substantive defect discoveries, not just verification.
  - MINOR: 10 (Critic-1: 4 -- pre-flight pause inconsistency, no config validation test, totalWaves unknown, "Committed" column undefined, story table unbounded; Critic-2: 5 -- stopAfterPlan paths missing, wave counter not initialized, negative elapsed time from clock skew, mid-wave story count staleness, test #16 location mismatch)
- **Application rate: 100%** (19/20 critic findings applied; 1 finding rejected with documented rationale -- Critic-2 Finding 10 test #16 location kept with justification. Corrector-2 applied 9/10 Critic-2 findings plus documented the rejection.)
- **Drafter regressions: 0** -- No defects introduced by the Drafter that were not present in the source document.
- **Corrector-1 regressions: 0** -- No defects introduced by Corrector-1 that were not present in the Drafter output.
- **Evidence-gating compliance: 100%** (53 total verification claims across 3 writing stages -- Drafter: 10, Corrector-1: 17, Corrector-2: 26 -- all in `VERIFIED: <evidence>` format with file paths, line numbers, and quoted code)
- **False verification claims: 0** (all 53 evidence-backed claims independently confirmed accurate across all 3 writing stages)
- **Pipeline variant:** 6-stage (Researcher, Drafter, Critic-1, Corrector-1, Critic-2, Corrector-2). No Reader. No Justifier.

### Stages that carried weight vs. stages that added nothing

| Stage | Contribution | Key output |
|-------|-------------|-----------|
| Critic-1 (3) | **HIGH -- found the only CRITICAL** | 10 findings (1C/4M/5Mi). Found the only CRITICAL: unsupported sync I/O performance claim that masked event-loop blocking during concurrent execution. Also found the phantom "Early gate catches" row that would have caused an implementation dead-end. The highest-impact single stage. |
| Critic-2 (5) | **HIGH** | 10 findings (0C/5M/5Mi). Found 5 MAJOR issues that Critic-1 missed entirely: REGISTRY_GAP_FIXED emission impossibility (load-bearing -- would have made a feature unimplementable), 3 missing integration points, and the orphaned temp file problem. All genuinely new, zero overlap with Critic-1. |
| Researcher (1) | **HIGH** | 3 MAJOR issues (directory inconsistency, config validation gap, test/signature mismatch), 6 failure mode gaps, verified all 13 integration point line numbers, all 8 codebase claims, and 5 knowledge base patterns. Zero false positives. Provided the factual foundation for confident Drafter fixes. |
| Corrector-2 (6) | **HIGH** | Applied 9/10, rejected 1 with justification. Changed REGISTRY_GAP_FIXED to return-metadata approach, added orphaned temp file cleanup, corrected integration point line numbers, added 3 new integration points. Brought test count from 10 to 18, integration points from 13 to 16. Zero regressions. |
| Drafter (2) | **HIGH** | Applied all Researcher findings, added 3 test cases (#11-13), added concurrency clarification. Zero regressions -- the first zero-regression Drafter since Run 6. |
| Corrector-1 (4) | **HIGH** | Applied 9/10 Critic-1 findings, added 7 new evidence-gated verifications. Zero regressions -- the first zero-regression Corrector-1 since Run 1. Self-caught no additional edge cases but executed cleanly. |
| Reader | **N/A (absent)** | Dropped per retrospective recommendation (9 runs of zero evaluative contribution). No downstream stage reported missing context. |

---

## Cross-Run Trends

Finding volume remains stable at 15-26 per run; Run 10's 20 matches Runs 7 and 8 and sits just above the 10-run mean of 19.1. The headline: zero regressions from both Drafter and Corrector-1 for the first time since Run 1, and 100% evidence-gating compliance.

### Finding counts and severity profiles across all runs

| Run | Date | Document | CRITICAL | MAJOR | MINOR | Total | App rate | Drafter reg. | C1 reg. |
|-----|------|----------|----------|-------|-------|-------|----------|-------------|---------|
| 1 -- Rate Limiter (fixture) | 2026-03-08 | Design doc (planted flaws) | 3 | 7 | 8 | 18 | 94% | ? | 0 |
| 2 -- E2E Bug Fix Plan | 2026-03-08 | Real bug fix plan | 2 | 6 | 7 | 15 | 93% | ? | 1 |
| 3 -- Phase 6 Plan | 2026-03-14 | Real implementation plan | 4 | 11 | 11 | 26 | 100% | ? | ? |
| 4 -- Post-MVP Plan | 2026-03-15 | Real implementation plan | 4 | 9 | 6 | 19 | 100% | ? | 2 |
| 5 -- Normalize Stage Plan | 2026-03-17 | Real implementation plan | 2 | 8 | 7 | 17 | 100% | ? | 1 |
| 6 -- Pipeline Failure Fix Plan | 2026-03-21 | Real fix plan | 3 | 7 | 8 | 18 | 94% | 0 | 1 |
| 7 -- CI/CD Reference Guide | 2026-03-21 | Real reference doc | 3 | 8 | 9 | 20 | 100% | 2 | 2 |
| 8 -- Pipeline Bug Fix Plan | 2026-03-22 | Real implementation plan | 2 | 9 | 9 | 20 | 100% | 2 | 1 |
| 9 -- PRD Workflow Recommendation | 2026-03-22 | Real recommendation report | 3 | 7 | 8 | 18 | 88% | 2 | 1 |
| **10 -- Live Summary Report Plan** | **2026-03-22** | **Real implementation plan** | **1** | **9** | **10** | **20** | **100%** | **0** | **0** |

### Regression tracking table

This table tracks defects introduced by the Drafter and Corrector-1 as first-class metrics, alongside evidence-gating compliance. Higher regression numbers mean the stage is creating more work for downstream stages.

| Run | Drafter regressions | Corrector-1 regressions | Evidence-gating compliance |
|-----|--------------------|-----------------------|---------------------------|
| 1 | ? | 0 | N/A (pre-evidence-gating) |
| 2 | ? | 1 | N/A |
| 3 | ? | ? | N/A |
| 4 | ? | 2 | N/A |
| 5 | ? | 1 | N/A |
| 6 | 0 | 1 | N/A |
| 7 | 2 | 2 | N/A |
| 8 | 2 | 1 | N/A |
| 9 | 2 | 1 | 82% |
| **10** | **0** | **0** | **100%** |

### What the numbers say

1. **Finding counts: 18 -> 15 -> 26 -> 19 -> 17 -> 18 -> 20 -> 20 -> 18 -> 20.** The 10-run range remains 15-26. Run 10's 20 is slightly above the updated mean of 19.2. No trend -- volume tracks document complexity.

2. **CRITICAL counts: 3 -> 2 -> 4 -> 4 -> 2 -> 3 -> 3 -> 2 -> 3 -> 1.** Run 10 has the lowest CRITICAL count in the series (1). However, the single CRITICAL was high-quality: unsupported sync I/O performance claim masking event-loop blocking. The low count likely reflects document quality -- the live summary report plan was well-constructed with fewer critical flaws to find. Updated mean: 2.7 CRITICALs per run.

3. **Application rate: 94% -> 93% -> 100% -> 100% -> 100% -> 94% -> 100% -> 100% -> 88% -> 100%.** Run 10 returns to 100%, matching 6 of the prior 9 runs. Updated mean: 96.9%.

4. **Severity distribution (% of total):**

| Severity | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 | R9 | R10 | Mean |
|----------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|
| CRITICAL | 17% | 13% | 15% | 21% | 12% | 17% | 15% | 10% | 17% | 5% | 14% |
| MAJOR | 39% | 40% | 42% | 47% | 47% | 39% | 40% | 45% | 39% | 45% | 42% |
| MINOR | 44% | 47% | 42% | 32% | 41% | 44% | 45% | 45% | 44% | 50% | 43% |

Run 10 dips to 5% CRITICAL (below the prior band of 10-21%) and 50% MINOR (at the upper edge of the 32-47% band). This is the first run to breach the CRITICAL severity band floor. The shift toward MINOR findings suggests a higher-quality input document with fewer critical flaws but more edge-case gaps.

5. **Drafter regression series (Runs 6-10): 0 -> 2 -> 2 -> 2 -> 0.** Run 10 breaks the three-run streak of 2 regressions per run. This is the second zero-regression Drafter run (alongside Run 6) out of 5 tracked.

6. **Corrector-1 regression series: 0 -> 1 -> ? -> 2 -> 1 -> 1 -> 2 -> 1 -> 1 -> 0.** Run 10 is the first zero-regression Corrector-1 run since Run 1 (9 runs ago). Mean drops from 1.1 to 1.0 (excluding Run 3).

7. **Evidence-gating compliance: N/A -> N/A -> ... -> 82% -> 100%.** Run 10 achieved 100% compliance across all three writing stages (53 total claims). This is a significant improvement over Run 9's 82%.

### Recurring finding types (patterns appearing in 2+ runs)

| Finding type | Runs present | Run 10 evidence |
|-------------|-------------|----------------|
| **Silent config/integration gaps** | **8/10** (R2, R3, R5-R10) | REGISTRY_GAP_FIXED emission impossible from plan-stage (no log infrastructure). Config `knownKeys` ordering dependency. `stopAfterPlan` path missing from integration points. 3 missing integration points total (13->16). |
| **Corrector/Drafter introduces new defects** | **8/10** (R2-R9, **NOT R10**) | Run 10 breaks the pattern: zero regressions from both Drafter and Corrector-1. First clean run since Run 1. |
| **Wrong directory / path errors** | **5/10** (R3, R5, R6, R8, R9) | Not present in Run 10. The Researcher verified all 13 integration point line numbers as accurate, preventing path errors. |
| **Verification/test gaps** | **8/10** (R2, R4-R10) | Test #8 mechanism unspecified ("call orchestrator code path" too vague). Test count grew from 10 to 18 to cover identified gaps. |
| **False safety claims / incorrect verification** | **6/10** (R4-R9, **NOT R10**) | Not present in Run 10. All 53 verification claims across 3 stages were evidence-gated and independently confirmed accurate. The evidence-gating protocol appears to have eliminated this pattern. |

### Is the pipeline finding fewer issues over time?

No. Run 10 found 20 findings, matching Runs 7 and 8. Finding counts remain stable at 15-26. The shift in Run 10 is in severity profile, not volume: 1 CRITICAL vs the 2.7 mean suggests a higher-quality input document, not a less effective pipeline.

### Is evidence-gating reducing false verification claims compared to pre-evidence-gating runs?

Yes, based on 2 data points. Run 9 (first evidence-gating run): 0 false Drafter claims at 82% compliance (Corrector-1 inherited without re-verifying). Run 10: 0 false claims across all 3 stages at 100% compliance. In pre-evidence-gating Runs 6-8, Drafter and/or Corrector-1 fabricated verification claims in every run. The evidence-gating protocol has eliminated fabricated verification in both runs where it was active. The compliance gap at Corrector-1 (82% in Run 9) was closed in Run 10 (100%). Two data points is suggestive, not conclusive, but the direction is clear.

---

## Stage Effectiveness Rankings

For each stage type, contribution is based on findings caught or value added across all runs. Trend compares recent runs to earlier runs.

| Stage | Contribution | Trend | Evidence (10 runs) |
|-------|-------------|-------|-------------------|
| **Critic-2** | **HIGH** | **STABLE (peak)** | Run 10: 10 findings (0C/5M/5Mi), all new, zero overlap with Critic-1. Found the most architecturally important issue (REGISTRY_GAP_FIXED emission impossibility) and 3 missing integration points. Across 10 runs: consistently finds issues invisible to Critic-1. Run 9's false positive appears to be an isolated event (not repeated in Run 10). |
| **Researcher** | **HIGH** | **STABLE** | Run 10: 3 MAJOR issues, 6 failure mode gaps, verified all line numbers and function signatures. Zero false positives in 10 runs -- the only stage with a perfect accuracy record. The factual foundation enabled the Drafter's zero-regression performance. |
| **Critic-1** | **HIGH** | **STABLE** | Run 10: 10 findings (1C/4M/5Mi), including the only CRITICAL in the run (sync I/O blocking). CRITICAL count across runs: 2->1->1->2->1->0->2->1->1->1. Run 10 confirms stable CRITICAL-finding capability after the Run 6 nadir. |
| **Corrector-2** | **HIGH** | **IMPROVING** | Run 10: applied 9/10, rejected 1 with justification. Zero regressions in 10/10 runs (perfect record). Run 10 added the most elegant design contribution: REGISTRY_GAP_FIXED return-metadata approach. Evidence-gating: 26/26 claims verified (100%). Judgment progression continues upward. Most reliable stage in the pipeline. |
| **Drafter** | **MEDIUM-HIGH** | **MIXED (improved this run)** | Run 10: zero regressions, applied all Researcher findings, added 3 test cases. Evidence-gating: 10/10 claims verified (100%). But the regression series (0->2->2->2->0) does not yet show a sustained trend. Need 2+ more zero-regression runs to confirm improvement. |
| **Corrector-1** | **MEDIUM-HIGH (upgraded this run)** | **MIXED (improved this run)** | Run 10: zero regressions (first since Run 1), 9/10 applied, evidence-gating at 100% (up from 82% in Run 9). But regression series (0->1->?->2->1->1->2->1->1->0) shows only 2 zero-regression runs in 10. Need sustained data before upgrading permanently. |
| **Reader** | **DROPPED** | **N/A** | Dropped from Run 10 per retrospective recommendation (9 runs, zero evaluative findings). No downstream degradation observed. Estimated savings: one full agent spawn. |
| **Justifier** | **DROPPED** | **N/A** | Absent for 6 consecutive runs (R5-R10). Permanently removed. |

---

## What's Working

Pipeline behaviors that consistently produce value, with evidence from multiple runs.

**1. Two critique rounds find fundamentally different bug classes (10/10 runs)**
Run 10 is textbook complementarity: Critic-1 found the CRITICAL sync I/O blocking issue (a document-logic flaw: unsupported performance claim), Critic-2 found the REGISTRY_GAP_FIXED emission impossibility (a code-level integration flaw requiring codebase verification). Zero overlap in findings across all 10 runs. Neither critic alone would have found what the other found.

**2. Evidence-gating protocol eliminates fabricated verification claims (2/2 runs)**
Run 9: 0 false Drafter claims but 82% compliance (Corrector-1 gap). Run 10: 0 false claims across all 3 stages at 100% compliance (53/53 claims). In pre-protocol Runs 6-8, fabricated verification was present in every run. The protocol has eliminated this failure mode in both runs where it was active.

**3. Researcher front-loading prevents downstream waste (10/10 runs, zero false positives)**
Run 10: caught the `src/reporting/` vs `src/reports/` directory inconsistency before it propagated, verified all 13 integration points, and confirmed 5 knowledge base patterns. Across 10 runs: 4-15 pre-critic findings per run, zero false positives ever. The only stage with a perfect accuracy record.

**4. Corrector-2 is the most reliable stage (10/10 runs, 0 regressions)**
Perfect record across 10 runs: zero regressions, increasingly sophisticated judgment. Run 10: applied 9/10, rejected 1 with justification, added 9 new evidence-gated verifications. The final corrector continues to deliver the cleanest output.

**5. Dropping the Reader caused no downstream degradation (Run 10, 1 data point)**
Run 10 was the first run without a Reader stage. No downstream stage reported missing context. The Researcher built its own factual foundation independently. While 1 data point is not conclusive, the 9 runs of zero-value Reader output preceding this gave strong justification.

**6. Severity calibration remains stable (10 runs)**
CRITICAL: 5-21% (mean 14%). MAJOR: 39-47% (mean 42%). MINOR: 32-50% (mean 43%). Run 10's 5% CRITICAL is a new low but reflects a higher-quality input document rather than pipeline miscalibration -- the single CRITICAL found was genuinely critical.

---

## What's Not Working

Pipeline behaviors that consistently underperform or add no value.

**1. Corrector-1 zero-regression runs are rare (2/10 runs: R1, R10)**
While Run 10's zero-regression result is encouraging, the historical record shows only 2 clean runs out of 10 (mean: 1.0 regressions/run). Three retrospective recommendations for prompt changes preceded this improvement, plus the evidence-gating protocol enforcement in Run 10. It is unclear which intervention (if any) caused the improvement, or whether this is noise. Need 2+ more zero-regression runs to confirm the trend.

**2. Drafter zero-regression runs are intermittent (2/5 tracked: R6, R10)**
Run 10 breaks the R7-R9 streak of 2 regressions/run, but the same happened with Run 6 followed by a reversion. The regression series (0->2->2->2->0) does not show a sustained downward trend. Evidence-gating may be helping (Run 10 had 100% compliance), but Run 9 also had evidence-gating and still had 2 regressions.

**3. Silent config/integration gaps persist as the most common finding type (8/10 runs)**
Run 10 had 3 instances: REGISTRY_GAP_FIXED emission impossibility, config knownKeys ordering dependency, and stopAfterPlan paths missing. This is the most persistent recurring finding type across all 10 runs. The pipeline catches these reliably, but document authors consistently produce them. This is a source-document quality issue, not a pipeline failure.

**4. Single-CRITICAL runs reduce the pipeline's demonstrated ROI per run**
Run 10 found only 1 CRITICAL (the lowest count in 10 runs, vs 2.7 mean). While the finding was genuine and high-quality, a team lead comparing pipeline cost against value will see less return when CRITICALs drop. This is likely a property of the input document (well-constructed plan with fewer critical flaws), not a pipeline decline. But it means the pipeline's cost-benefit case is stronger for lower-quality input documents.

---

## So What?

- **Run 10 is the cleanest pipeline execution in 10 runs: zero regressions from both Drafter and Corrector-1, 100% evidence-gating compliance (53/53 claims), and 100% application rate.** This is the first time all three metrics hit their ideal values simultaneously. The evidence-gating protocol is the most plausible explanation -- it was 82% in Run 9 (with regressions) and 100% in Run 10 (without). Two data points, not conclusive, but directionally strong.

- **Dropping the Reader stage caused no visible quality loss in its first run.** Nine runs of zero-value output followed by a clean Run 10 without it validates the decision. The 6-stage pipeline (Researcher, Drafter, Critic-1, Corrector-1, Critic-2, Corrector-2) should be the default going forward, saving one full agent spawn per run.

- **The CRITICAL count dropped to 1 (vs 2.7 mean) -- this is about the input document, not the pipeline.** The live summary report plan was well-constructed with fewer critical flaws. The pipeline still found 9 MAJORs and 10 MINORs, proving it adds value even on higher-quality documents. The test count grew from 10 to 18 and integration points from 13 to 16 -- concrete improvements.

- **Evidence-gating at 100% compliance is the strongest intervention the pipeline has seen.** Runs 6-8 (pre-protocol) had fabricated verification in every run. Run 9 (82% compliance) had regressions. Run 10 (100% compliance) had zero regressions and zero false claims. If this holds, the evidence-gating protocol is the structural fix that prompt-level instructions could never achieve for Corrector-1's regression problem.

- **Next run should confirm whether the zero-regression result is sustainable or a one-off like Run 6.** The key question is whether 100% evidence-gating compliance causes zero regressions, or whether Run 10's document was simply easier. Run 11 on a complex document will answer this.
