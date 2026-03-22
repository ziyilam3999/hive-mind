# Double-Critique Pipeline -- Retrospective Report

**Date:** 2026-03-22 (updated after Run 10)
**Runs covered:** 10 (Run 1 through Run 10, 2026-03-08 to 2026-03-22)
**Based on:** effectiveness-2026-03-22.md (Run 10 -- Live Summary Report Plan)
**Prior version:** This file's prior version covered Runs 1-9

---

## Summary

Run 10 is the cleanest pipeline execution in 10 runs: zero regressions from both Drafter and Corrector-1, 100% evidence-gating compliance (53/53 claims), and 100% application rate -- all three metrics hitting ideal values simultaneously for the first time. The Reader stage was dropped with no observable downstream degradation, validating 9 runs of zero-value evidence. The key open question is whether Run 10's zero-regression result is sustainable (caused by 100% evidence-gating compliance) or a one-off like Run 6.

---

## KEEP -- What's Working Well

**[Two-round critic architecture]** -- Two independent critics find fundamentally different bug classes, with zero finding overlap across 10 runs. -- Evidence: 10/10 runs complementary. Run 10: Critic-1 found the only CRITICAL (sync I/O blocking event loop); Critic-2 found REGISTRY_GAP_FIXED emission impossibility and 3 missing integration points. Mean 2.7 CRITICALs/run. -- Action: No change. This is the pipeline's most proven structural decision (P5).

**[Researcher front-loading]** -- Reads KB, cross-references codebase, surfaces factual problems before critics see the document. Zero false positives in 10 runs -- the only stage with a perfect accuracy record. -- Evidence: 10/10 runs, 4-15 pre-critic findings/run. Run 10: 3 MAJOR issues (directory inconsistency, config validation gap, test/signature mismatch), verified all 13 integration point line numbers, confirmed 5 KB patterns. Factual foundation enabled Drafter's zero-regression performance. -- Action: Keep as-is.

**[Evidence-gating protocol]** -- 100% compliance in Run 10 (53/53 claims across 3 writing stages) vs 82% in Run 9. Pre-protocol Runs 6-8 had fabricated verification in every run. Run 10 had zero false claims and zero regressions. -- Evidence: 2/2 runs with protocol active had 0 false verification claims. Run 9 (82% compliance): 2 Drafter + 1 Corrector-1 regressions. Run 10 (100% compliance): 0 regressions across both stages. Inverse correlation between compliance % and regression count emerging. -- Action: Keep as mandatory. Track compliance % as first-class metric (see ADD).

**[Corrector-2 reliability]** -- Perfect record: 0 regressions in 10/10 runs. Run 10: applied 9/10, rejected 1 with documented justification, designed the REGISTRY_GAP_FIXED return-metadata approach (elegant architectural contribution). -- Evidence: Zero regressions across 10 runs. 7th consecutive run with non-trivial design contribution. Most reliable stage in the pipeline. -- Action: No change.

**[6-stage pipeline (Reader dropped)]** -- First run without Reader caused zero downstream degradation. No stage reported missing context. Researcher built its own factual foundation independently. -- Evidence: 9 runs of zero-value Reader output + 1 clean run without it. Saves one full agent spawn per run. -- Action: Confirm 6-stage as permanent default (Researcher, Drafter, Critic-1, Corrector-1, Critic-2, Corrector-2).

**[Severity calibration stability]** -- CRITICAL/MAJOR/MINOR distribution remains consistent across 10 runs and 5 document types. -- Evidence: CRITICAL 5-21% (mean 14%), MAJOR 39-47% (mean 42%), MINOR 32-50% (mean 43%). Run 10's 5% CRITICAL is a new low but reflects a higher-quality input document, not pipeline miscalibration -- the single CRITICAL found was genuinely critical. -- Action: No change.

**[Application rate]** -- Pipeline produces findings that are overwhelmingly accepted as valid corrections. -- Evidence: 10-run mean: 96.9%. Run 10 returned to 100% (19/20 applied, 1 rejected with documented rationale). -- Action: Continue as-is.

---

## CHANGE -- What Should Be Modified

**[Evidence-gating compliance must stay at 100%]** -- Run 9 (82%) had regressions. Run 10 (100%) had none. This is the strongest signal the pipeline has produced about regression prevention. -- Evidence: Inverse correlation: 82% compliance = regressions, 100% compliance = zero regressions. Prior prompt changes for Corrector-1 (3 retrospective cycles) had no effect (F2). Evidence-gating at 100% is the first intervention that correlated with zero regressions. -- Action: If compliance drops below 100% in Run 11, treat it as a pipeline defect to investigate, not acceptable variance. The compliance % is the leading indicator.

**[Corrector-1 structural intervention -- defer pending Run 11 data]** -- Run 10 achieved zero Corrector-1 regressions for the first time since Run 1, coinciding with 100% evidence-gating compliance. But Run 6 also had zero, followed by reversion. -- Evidence: Series: 0->1->?->2->1->1->2->1->1->0. Mean 1.0/run. Run 10 may be evidence-gating working, or may be noise. -- Action: Wait for Run 11. If Run 11 has 100% compliance AND zero Corrector-1 regressions, evidence-gating is the structural fix (3 data points: R9 negative, R10 positive, R11 positive). If regressions return despite 100% compliance, escalate to automated diff-based regression detection.

**[Drafter regression monitoring -- same deferral]** -- Run 10 breaks the R7-R9 streak of 2 regressions/run. -- Evidence: Series (R6-R10): 0->2->2->2->0. Same pattern as Corrector-1 -- zero coincides with 100% evidence-gating. -- Action: Track alongside Corrector-1. If both stay at zero with 100% compliance, evidence-gating is the universal fix.

**[Config/integration gap checklist for document authors]** -- Silent config/integration gaps persist as the most common finding type (8/10 runs). The pipeline catches these reliably but authors keep producing them. -- Evidence: Run 10: 3 instances (REGISTRY_GAP_FIXED emission impossibility, config knownKeys ordering dependency, stopAfterPlan paths missing). -- Action: Add a prompt-level checklist for document authors: "For each new feature, list every config field it reads, every file it writes, every function it calls, and every event it emits."

---

## ADD -- New Pipeline Stages or Modifications to Try

**[Evidence-gating compliance as a first-class metric in the effectiveness report]** -- The Run 9 vs Run 10 comparison is the most informative signal the pipeline has produced. -- Evidence: 82% compliance = regressions. 100% compliance = zero regressions. 2 data points with clear directionality. -- Action: Add evidence-gating compliance % to the regression tracking table in the effectiveness report. If the correlation holds over 3+ runs, consider making 100% compliance a hard gate (reject pipeline output below threshold).

**[Automated diff between Corrector-1 input and output]** -- Recommended for the third consecutive retrospective. Still not implemented. Critic-2 catches Corrector-1 regressions by cold-reading, but this is fragile. -- Evidence: dc-8 roadmap pass: 4 Corrector-1 regressions. Run 10: 0. Without a diff, the regression source is opaque when it occurs. -- Action: Implement a lightweight diff step. Flag any section changed by Corrector-1 that was not mentioned in a Critic-1 finding. Feed the diff to Critic-2 as additional context. This converts regression detection from Tier 4 (cold-reading judgment) to Tier 2 (mechanical comparison).

**[Monitor critic false-positive rate]** -- Run 9 introduced critic-originated false positives as a risk category. Run 10 had zero. -- Evidence: Run 9: 1 Critic-2 false positive (fabricated KB citation claim). Run 10: 0. -- Action: Track as a metric in the effectiveness report. If rate stays near zero, the citation verification prompt added after Run 9 is working.

---

## DROP -- Not Pulling Its Weight

**[Reader stage -- confirmed permanent drop]** -- 9 runs of zero evaluative findings followed by a clean Run 10 without it. No downstream stage reported missing context. Saves one full agent spawn per run. -- Evidence: 10/10 runs (9 with Reader contributing nothing, 1 without it with no quality loss). -- Action: Permanently removed. Do not revisit unless document complexity exceeds ~1000 lines.

**[Justifier stage -- confirmed permanent drop]** -- Absent for 6 consecutive runs (R5-R10). Every finding when present was a restatement of Researcher findings. -- Evidence: No missed findings in any run since removal. -- Action: Confirmed permanently removed.

---

## NEW PATTERNS -- Candidate Patterns Discovered

### Evidence-gating at 100% compliance correlates with zero writing-stage regressions

- **Plain-language name:** When everyone shows their receipts, nobody makes stuff up
- **What:** Run 10 achieved 100% evidence-gating compliance (53/53 verification claims with file:line evidence) and simultaneously achieved zero regressions from both Drafter and Corrector-1 -- a first in 10 runs.
- **Why:** Evidence-gating forces each factual claim to be anchored to a specific file, line number, and quoted code. This prevents the "I verified X" fabrication that caused regressions in Runs 6-9, where agents claimed they checked something they never actually read.
- **Evidence:** Run 9: 82% compliance, 3 total regressions (2 Drafter + 1 Corrector-1). Run 10: 100% compliance, 0 total regressions. Pre-protocol Runs 6-8: fabricated verification in every run. The compliance percentage appears to be the leading indicator of regression count.
- **Status:** 2 data points (R9 as negative control, R10 as positive). Needs Run 11 to confirm. If Run 11 has 100% compliance and zero regressions, this becomes a 3-point pattern eligible for KB graduation.
- **Cross-ref:** P11 (external artifacts), P13 (compliance hierarchy), F9 (self-scoring bias).

### Reader-less pipeline produces equivalent quality on sub-500-line documents

- **Plain-language name:** The extra pair of eyes that never noticed anything
- **What:** Dropping the Reader stage in Run 10 caused no downstream quality loss. The Researcher independently built a more thorough factual foundation.
- **Evidence:** Run 10: 20 findings, 100% application rate, 0 regressions, 100% evidence-gating -- all metrics at or above 10-run means. No stage reported missing context.
- **Status:** 1 data point. Needs 2+ more runs to confirm.
- **Cross-ref:** Prior Reader zero-value discovery (memory.md 2026-03-15, 2026-03-22).

### Input document quality inversely correlates with CRITICAL count

- **Plain-language name:** Better recipes need fewer corrections
- **What:** Run 10's well-constructed plan produced only 1 CRITICAL (vs 2.7 mean), but the pipeline still found 9 MAJORs and 10 MINORs, proving it adds value even on high-quality documents.
- **Evidence:** Run 10: 1 CRITICAL (lowest ever, vs 2.7 mean). Tests grew 10->18, integration points 13->16. The pipeline shifted from catching critical flaws to catching edge cases and integration gaps.
- **Status:** Observational. Not actionable as a pipeline change; relevant for setting ROI expectations.

---

## NEW ANTI-PATTERNS -- Candidate Anti-Patterns Discovered

### Single-CRITICAL runs reduce perceived pipeline ROI

- **Plain-language name:** The smoke alarm that did not ring because there was no fire
- **What:** When the input document is high-quality, the pipeline finds fewer CRITICALs. A stakeholder comparing cost vs value sees lower return. This is a perception problem, not a pipeline problem.
- **Evidence:** Run 10: 1 CRITICAL (lowest in 10 runs) despite 20 total findings. The 9 MAJORs and 10 MINORs still represent concrete improvements (tests 10->18, integration points 13->16), but the headline number (CRITICALs) is less dramatic.
- **Mitigation:** Track total value added (test count growth, integration point additions, regression count) alongside CRITICAL count. Report both.
- **Status:** 1 data point. Not actionable as a pipeline change.

---

## Knowledge Base Graduation Assessment

Five candidate findings assessed against the three criteria (stability: 3+ runs, evidence: measured numbers, generalizability: applies beyond double-critique):

1. **Evidence-gating at 100% eliminates regressions (NP-1 above)** -- Stability: 2 data points (R9 negative, R10 positive). NOT YET (needs 3+). Evidence: YES (measured compliance % and regression counts). Generalizability: YES (applies to any multi-stage pipeline with verification claims). **Decision: Hold for Run 11. If confirmed, graduate as new pattern.**

2. **Corrector-1 regression rate unresponsive to prompt changes (10 runs, mean 1.0)** -- Stability: YES. Evidence: YES. Generalizability: YES (instance of F2). Reinforces existing F2, not a new pattern. **Decision: Do not graduate. Reinforces F2.**

3. **Reader stage zero-value (9/9 runs + 1 without it)** -- Stability: YES. Evidence: YES. Generalizability: PARTIAL (not tested on very long docs). **Decision: Do not graduate. Operational decision, not a design principle.**

4. **Corrector-2 zero-regression record (10/10 runs)** -- Stability: YES (10 runs). Evidence: YES (0 regressions, specific judgment examples per run). Generalizability: YES (final-stage advantage). **Decision: Hold for 2 more runs. If it holds at 12 runs, graduate as "Final-stage correctors outperform mid-pipeline correctors" with position-based explanation.**

5. **Researcher front-loading shifts CRITICAL distribution** -- Stability: PARTIAL (Run 10 supports it -- 1 CRITICAL when Researcher was strong -- but Run 9 had 3 CRITICALs despite strong Researcher). **Decision: Hold. Evidence mixed across runs.**

**KB graduation result: No new entries this run.** The strongest candidate (NP-1: evidence-gating correlation) needs one more confirming data point. This is the fifth consecutive run with no graduations -- the KB has stabilized at its current scope. NP-1 is the first candidate in several runs with a clear path to graduation (Run 11 confirmation).

---

## Next Run Priorities

1. **Confirm evidence-gating causation.** Run 11 must process a complex document (not a clean plan) with 100% evidence-gating compliance enforced. If zero regressions: NP-1 is confirmed as a 3-point pattern (R9 negative control, R10 positive, R11 positive) and is eligible for KB graduation. If regressions return despite 100% compliance, evidence-gating is necessary but not sufficient, and the automated diff between Corrector-1 input/output becomes the priority structural intervention.

2. **Implement automated diff between Corrector-1 input and output.** This has been recommended for 3 consecutive retrospective cycles. Feed the diff to Critic-2 as additional context. Low implementation cost, high diagnostic value for regression root-cause analysis.

3. **Track evidence-gating compliance as a first-class metric.** Add to the effectiveness report regression tracking table alongside Drafter/Corrector-1 regressions. The Run 9 (82%) vs Run 10 (100%) comparison is the strongest signal the pipeline has produced about regression prevention.
