# Double-Critique Pipeline -- Effectiveness Report

**Date:** 2026-03-22 (Run 2 of the day)
**Run number:** 9 (cumulative)
**Runs covered:** 9 (Run 1: 2026-03-08 fixture, Run 2: 2026-03-08 e2e-bugfix, Run 3: 2026-03-14 phase-6-plan, Run 4: 2026-03-15 post-mvp-plan, Run 5: 2026-03-17 normalize-stage-plan, Run 6: 2026-03-21 pipeline-failure-fix-plan, Run 7: 2026-03-21 CI/CD reference guide, Run 8: 2026-03-22 pipeline-bug-fix-plan, Run 9: 2026-03-22 PRD workflow recommendation)
**Author:** Effectiveness analysis agent

---

## This Run

This section captures the vital signs of the current run -- how many issues were found, how many were fixed, and whether the pipeline introduced any new problems of its own.

- **Document critiqued:** Recommendation report on whether hive-mind should add a PRD creation workflow (`tmp/dc-{1..9}-*.md` stages)
- **Total findings: 18** (critic-originated)
  - CRITICAL: 3 (1 from Critic-1: VALIDATE self-undermines its value proposition; 2 from Critic-2: NORMALIZE schema mismatch 7-vs-10 sections, fabricated KB citations claim [FALSE POSITIVE])
  - MAJOR: 7 (3 from Critic-1: no evidence guided interview improves quality, session interruption handling inadequate, Gap 2 never resolved; 4 from Critic-2: constitution path wrong directory-vs-file, session persistence doesn't fit slash command model, VALIDATE "10 sections" conflicts with NORMALIZE 7-section output, evidence-gating trust gap)
  - MINOR: 8 (5 from Critic-1: cost argument confused, "no HOW sections" under-specified, user story generation stated as trivial, straw-man "What NOT to build" entries, no user disagreement handling; 3 from Critic-2: line count 20 not 19, HOW-check examples too narrow, cost note internal contradictions)
- **Application rate: 88%** (15/17 actionable findings applied; 1 Critic-2 finding was a false positive and excluded from actionable count; 2 findings rejected with documented rationale -- Critic-1 F8 straw-man entries, Critic-2 F9 trust gap dismissed because premise was wrong)
- **Drafter regressions: 2** (introduced wrong constitution path `constitution/` instead of `constitution.md`, introduced unresolved VALIDATE contradiction by including both the mechanism and the evidence against it without reconciling)
- **Corrector-1 regressions: 1** (introduced naive Gap 2 resolution proposing "~20 lines of section-presence checking" that ignores the NORMALIZE 7-vs-10 schema mismatch)
- **Evidence-gating compliance: 82%** (18 verification claims with evidence / 22 total verification claims; Corrector-1 inherited 4 KB citations from the Drafter without re-verifying them)
- **False verification claims: 0** (all 18 evidence-backed claims were independently confirmed accurate; the 4 inherited claims also turned out to be correct, though the protocol gap is real)
- **Pipeline variant:** 7-stage (Reader, Researcher, Drafter, Critic-1, Corrector-1, Critic-2, Corrector-2). No Justifier stage.

### Stages that carried weight vs. stages that added nothing

The columns below: **Contribution** rates the stage's impact on this run (HIGH/MEDIUM/LOW). **Key output** summarizes the most important deliverables.

| Stage | Contribution | Key output |
|-------|-------------|-----------|
| Researcher (2) | **HIGH -- MVP of the run** | 10+ findings: P30 gap, F2/F9 warnings, path bug (`document-guidelines.md` wrong path), cost data debunked ($10-40 vs ~$0.10), 6 omitted PRD examples, 6 missing failure mode specs, compliance hierarchy concern. Zero false positives. The extractor calls it "the most valuable single stage." |
| Critic-2 (6) | **HIGH** | 9 findings (2C/4M/3Mi). Found the NORMALIZE schema mismatch (the most architecturally important discovery in the entire pipeline) and the constitution path error. Also surfaced the session persistence model mismatch. Offset by a dangerous false positive (Finding 1: falsely claimed KB citations were fabricated). |
| Corrector-2 (7) | **HIGH** | Applied 7/9, correctly rejected 2. The single best judgment call: rejecting Finding 1 (fabricated citations) after independent verification. Produced the three-option Gap 2 resolution table. Zero regressions. |
| Critic-1 (4) | **HIGH** | 9 findings (1C/3M/5Mi). Found the VALIDATE value-proposition contradiction -- the most important structural problem in the document. Also caught the missing evidence for the central thesis and the unresolved Gap 2. |
| Drafter (3) | **MEDIUM-HIGH** | Integrated 10+ Researcher findings into a coherent rewrite. Added evidence-gated self-review (13 claims with file paths and line numbers). But introduced 2 regressions (wrong constitution path, unresolved VALIDATE contradiction). |
| Corrector-1 (5) | **MEDIUM** | Applied 8/9 Critic-1 findings (session persistence, Gap 2 closure, cost reframing, HOW-check examples). But introduced 1 regression (naive Gap 2 resolution ignoring schema mismatch) and inherited the Drafter's constitution path error without checking. |
| Reader (1) | **LOW** | No evaluative contribution. Zero original findings. The extractor does not mention any Reader output shaping downstream work. 9th consecutive run with zero evaluative value. |

---

## Cross-Run Trends

This section compares Run 9 against all 8 prior runs to identify patterns that persist across documents. A single run is an anecdote; trends across 9 runs are signal.

### Finding counts and severity profiles across all runs

The columns: **Run** identifies the document. **CRITICAL/MAJOR/MINOR** are finding counts by severity. **Total** is the sum. **App rate** is the percentage of actionable findings applied. **Drafter reg.** and **C1 reg.** are regression counts for the Drafter and Corrector-1 respectively.

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
| **9 -- PRD Workflow Recommendation** | **2026-03-22** | **Real recommendation report** | **3** | **7** | **8** | **18** | **88%** | **2** | **1** |

### Regression tracking table

This table tracks defects introduced by the Drafter and Corrector-1 as first-class metrics. Higher numbers mean the stage is creating more work for downstream stages to clean up.

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
| **9** | **2** | **1** | **82%** |

### What the numbers say

1. **Finding counts: 18 -> 15 -> 26 -> 19 -> 17 -> 18 -> 20 -> 20 -> 18.** The 9-run range remains 15-26. Run 9's 18 is exactly the Run 1 count and sits just below the updated mean of 19.0. No trend -- volume continues to track document complexity.

2. **CRITICAL counts: 3 -> 2 -> 4 -> 4 -> 2 -> 3 -> 3 -> 2 -> 3.** Run 9 returns to 3 after Run 8's 2. However, 1 of the 3 was a false positive (Critic-2 falsely claimed KB citations were fabricated). Excluding the false positive: 2 genuine CRITICALs. Updated mean: 2.9 CRITICALs per run (raw), ~2.8 excluding known false positives. Both genuine CRITICALs were high-quality: the VALIDATE self-undermining contradiction and the NORMALIZE schema mismatch.

3. **Application rate: 94% -> 93% -> 100% -> 100% -> 100% -> 94% -> 100% -> 100% -> 88%.** Run 9 is the lowest application rate in the series. The 2 rejected findings were both rejected with documented rationale by Corrector-2, and 1 Critic-2 finding was a false positive. The 88% reflects legitimate editorial judgment, not noise -- but it breaks the 3-run 100% streak. Updated mean: 96.6%.

4. **Severity distribution (% of total):**

| Severity | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 | R9 | Mean |
|----------|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|
| CRITICAL | 17% | 13% | 15% | 21% | 12% | 17% | 15% | 10% | 17% | 15% |
| MAJOR | 39% | 40% | 42% | 47% | 47% | 39% | 40% | 45% | 39% | 42% |
| MINOR | 44% | 47% | 42% | 32% | 41% | 44% | 45% | 45% | 44% | 43% |

Run 9 snaps back to 17/39/44, matching Run 1 and Run 6 almost exactly. After Run 8's dip in CRITICAL share (10%), the distribution returns to the established center. Severity calibration remains stable across 9 runs.

5. **Corrector-1 regression series: 0 -> 1 -> ? -> 2 -> 1 -> 1 -> 2 -> 1 -> 1.** Run 9 holds at 1. Mean (excluding Run 3): 1.1 per run. No improvement trend.

6. **Drafter regression series (Runs 6-9): 0 -> 2 -> 2 -> 2.** Three consecutive runs with 2 regressions each. Run 6's 0 looks like the outlier, not the norm.

### Recurring finding types (patterns appearing in 2+ runs)

| Finding type | Runs present | Run 9 evidence |
|-------------|-------------|----------------|
| **Corrector/Drafter introduces new defects** | **8/9** (all except R1) | Drafter introduced wrong constitution path and unresolved VALIDATE contradiction. Corrector-1 introduced naive Gap 2 resolution ignoring schema mismatch. 3 total regressions across 2 stages. |
| **False safety claims / incorrect verification** | **6/9** (R4-R9) | Corrector-1 inherited the Drafter's constitution path error (`constitution/` vs `constitution.md`) without verifying. The Drafter itself introduced the path by guessing rather than checking. Critic-2 produced a false positive claiming KB citations were fabricated. |
| **Silent config/integration gaps** | **7/9** (R2, R3, R5-R9) | NORMALIZE agent expects 7 sections; document-guidelines template has 10. Constitution is a file (`constitution.md`), not a directory (`constitution/`). These schema mismatches were invisible to all stages until Critic-2. |
| **Verification/test gaps** | **7/9** (R2, R4-R9) | The VALIDATE phase designs a 9-row validation table while simultaneously citing evidence (F2/F9) that such checks achieve only 17% compliance. No measurement plan for whether the proposed workflow improves PRD quality. |
| **Wrong directory / path errors** | **5/9** (R3, R5, R6, R8, R9) | `/prd` skill references `.hive-mind/document-guidelines.md` but the file lives at `../.hive-mind-persist/document-guidelines.md`. Drafter wrote `constitution/` (directory) instead of `constitution.md` (file). |
| **Critic produces false positive** | **2/9** (R9 new, R8 had false self-review) | Critic-2 Finding 1 falsely claimed all KB citations (P30, P28, F2, F9) were fabricated. They demonstrably exist. This is a new failure mode for the critic stage specifically -- prior runs had false verification by Drafter/Corrector, not by critics. |

### Is the pipeline finding fewer issues over time?

No. Run 9 found 18 findings (just below the 19.0 mean), including 2 genuine CRITICALs (plus 1 false positive). Each run reviews a different document, so stable finding counts are expected. The meaningful signal remains: **every run on a real document finds at least 2 genuine CRITICALs** (9/9 runs). The "false verification/safety claims" pattern has now appeared in 6 of the last 6 runs (R4-R9) and is intensifying.

### Is evidence-gating reducing false verification claims compared to pre-evidence-gating runs?

Run 9 is the first run with the evidence-gating protocol explicitly in place (Drafter used `VERIFIED: <evidence>` format with file paths and line numbers). Result: **0 false verification claims from the Drafter** (13/13 accurate), and **0 false claims from Corrector-1** (5/5 direct claims accurate, 4 inherited without re-verification but all turned out correct). This is a positive initial signal, but it is a single data point. In the pre-evidence-gating Run 8, both Drafter and Corrector-1 fabricated verification of `config.projectRoot`. The evidence-gating protocol may have prevented that failure mode in Run 9 -- or Run 9's document may have been less prone to it. More runs needed to confirm.

The evidence-gating protocol did NOT prevent Corrector-1 from inheriting claims without re-verification (4 claims). The protocol gap is real: Corrector-1 explicitly stated "I did not re-verify these as they were not modified in this correction pass." This is a compliance gap at 82% (18/22 claims had evidence). The 18% without evidence were inherited, not fabricated -- a less dangerous failure mode, but still a protocol violation.

---

## Stage Effectiveness Rankings

This section grades each pipeline stage like employees on a team: who is carrying weight, who is coasting, and who is improving or declining. Contribution is based on findings caught or value added. Trend compares recent runs to earlier runs.

| Stage | Contribution | Trend | Evidence (9 runs) |
|-------|-------------|-------|-------------------|
| **Critic-2** | **HIGH** | **STABLE (peak), with a new risk** | Run 9: 9 findings (2C/4M/3Mi), including the most architecturally important discovery (NORMALIZE schema mismatch). But also produced a dangerous false positive (fabricated KB citations claim). This is the first time Critic-2 has introduced a false positive across 9 runs. Corrector-2 correctly rejected it, but if accepted, it would have stripped all KB citations from the document. Across 9 runs: still the most valuable critic stage overall, but Run 9 introduces a yellow flag. |
| **Researcher** | **HIGH** | **STABLE** | Run 9: 10+ findings including P30 gap, F2/F9 warnings, path bug, cost data debunked, 6 missing failure mode specs. The extractor calls it "the most valuable single stage." Across 9 runs: zero false positives ever, highest foundational value. The only stage with a perfect accuracy record. |
| **Critic-1** | **HIGH** | **STABLE** | Run 9: 9 findings (1C/3M/5Mi). Found the VALIDATE value-proposition contradiction -- the most important structural problem. This CRITICAL was a deep logical reasoning catch: the document designs a mechanism and simultaneously cites evidence that the mechanism does not work. CRITICAL count across runs: 2->1->1->2->1->0->2->1->1. Run 9 confirms the Run 7 rebound from Run 6's nadir. |
| **Corrector-2** | **HIGH** | **IMPROVING** | Run 9: applied 7/9, correctly rejected 2 (including the false positive -- the single most important judgment call). Produced the three-option Gap 2 resolution table. Zero regressions. Across 9 runs: perfect accuracy (0 regressions ever), increasing judgment quality (file-content hashing R6, YAML split R7, plan-validator R8, false-positive rejection + Gap 2 table R9). The most reliable stage in the pipeline. |
| **Drafter** | **MEDIUM-HIGH** | **DECLINING (slight)** | Run 9: integrated 10+ Researcher findings, added 13 evidence-gated claims with file paths. But introduced 2 regressions (wrong constitution path, unresolved VALIDATE contradiction). Regression series (R6-R9): 0->2->2->2. Three consecutive runs with 2 regressions. The Run 6 zero-regression result was the outlier. The Drafter does heavy volume work but reliably introduces 2 defects per run. |
| **Corrector-1** | **MEDIUM** | **STABLE (mediocre)** | Run 9: applied 8/9 Critic-1 findings, but introduced 1 regression (naive Gap 2 resolution) and inherited the constitution path error without checking. Also skipped re-verification of 4 inherited KB claims. Regression series: 0->1->?->2->1->1->2->1->1. Mean: 1.1 per run. No improvement despite 3 retrospective recommendations. |
| **Justifier** | **N/A** | **DEPRECATED** | Absent for 5 consecutive runs (R5-R9). Zero missed findings attributable to absence. Permanently removed from pipeline. |
| **Reader** | **LOW** | **STABLE (zero value)** | Run 9: zero evaluative contribution. 9/9 runs with no original findings. The retrospective recommended dropping it or trialing evaluative instructions. Neither has happened. 9 runs of evidence is conclusive. |

---

## What's Working

Pipeline behaviors that consistently produce value, with evidence from multiple runs. If a behavior has only 1-2 data points, that is noted.

**1. Two critique rounds find fundamentally different bug classes (9/9 runs)**
Run 9 continues the pattern: Critic-1 found the VALIDATE value-proposition contradiction (a logical consistency flaw visible from document reasoning alone), Critic-2 found the NORMALIZE schema mismatch and constitution path error (architectural flaws requiring codebase verification). Zero overlap in findings across all 9 runs. This is the pipeline's defining strength.

**2. Researcher front-loading prevents dozens of errors from entering the document (9/9 runs)**
In Run 9, the Researcher surfaced P30, F2/F9, the path bug, cost data problems, 6 omitted PRD examples, and 6 missing failure mode specs -- all before the Drafter touched the document. The extractor notes that "nearly everything downstream built on this foundation." Across 9 runs: zero false positives ever, 4-15 pre-critic findings per run.

**3. Corrector-2 is the most reliable stage in the pipeline (9/9 runs, 0 regressions)**
Run 9: correctly rejected the false positive (Finding 1) after independent verification, produced the three-option Gap 2 table. Across 9 runs: perfect application rate on accepted findings, zero regressions ever, increasingly sophisticated judgment calls (R6: file hashing, R7: YAML split, R8: plan-validator, R9: false-positive rejection). No other stage has a perfect record.

**4. Evidence-gating produced 0 false verification claims in its first run (1 data point)**
Run 9 is the first run with the `VERIFIED: <evidence>` protocol. The Drafter made 13 verification claims with file paths and line numbers; all 13 were independently confirmed accurate. In the prior run (R8, pre-evidence-gating), both Drafter and Corrector-1 fabricated verification of `config.projectRoot`. The protocol may have prevented a similar failure in Run 9 -- but this is a single data point, not a trend.

**5. Severity calibration remains stable across 9 runs**
CRITICAL: 10-21% (mean 15%). MAJOR: 39-47% (mean 42%). MINOR: 32-47% (mean 43%). Run 9 sits at 17/39/44, matching the established center. Severity ratings remain meaningful for cross-run comparison.

---

## What's Not Working

Pipeline behaviors that consistently underperform or add no value. Every claim below cites a number from an actual run.

**1. Drafter regression rate has settled at 2 per run (Runs 7-9: 2, 2, 2)**
Three consecutive runs with exactly 2 Drafter regressions. Run 9: wrong constitution path (guessed `constitution/` instead of verifying `constitution.md`) and unresolved VALIDATE contradiction (included both the mechanism and the evidence against it without reconciling). The Run 6 zero-regression result was the outlier, not the norm. The hypothesis that stronger Researcher input reduces Drafter regressions is not supported across 4 data points (R6-R9).

**2. Corrector-1 regression rate is structurally unchanged (mean 1.1/run across 9 runs)**
Run 9: 1 regression (naive Gap 2 resolution ignoring schema mismatch). Series: 0->1->?->2->1->1->2->1->1. Three retrospective recommendations (Runs 6, 7, 8) have not measurably reduced this rate. Prompt-level instructions are insufficient per F2 (behavioral prose without consequences achieves 17% compliance).

**3. Critic-2 produced its first false positive in 9 runs**
Run 9's Finding 1 claimed all knowledge-base citations (P30, P28, F2, F9) were fabricated and KB files were empty. All four entries demonstrably exist at the cited locations. The extractor calls this "a significant error" and notes it "nearly damaged the document." This is the first time a critic stage (as opposed to Drafter/Corrector) has produced a false positive. If Corrector-2 had not independently verified, the document would have lost all its supporting evidence. This is a new risk that did not exist in Runs 1-8.

**4. Corrector-1 inherits verification claims without re-checking (Run 9: 4 inherited claims at 0% re-verification)**
Corrector-1 explicitly stated: "I did not re-verify these as they were not modified in this correction pass." This produced 82% evidence-gating compliance instead of 100%. While the inherited claims happened to be accurate in Run 9, this protocol gap is the exact mechanism that caused failures in Runs 6-8 (propagated false claims). The evidence-gating protocol needs enforcement at the Corrector-1 level, not just the Drafter level.

**5. Reader remains zero-value for finding discovery (9/9 runs)**
Nine runs, zero original findings. The retrospective recommended dropping Reader or trialing evaluative instructions after Run 8. Neither has been implemented. The Reader's structured inventory gives downstream stages a checklist, but the Researcher builds its own more thorough checklist. Nine runs is conclusive.

---

## So What?

These are the 5 things a team lead should know about the pipeline's health after 9 runs.

- **The pipeline continues to catch real bugs: 2 genuine CRITICALs in Run 9 (VALIDATE self-undermining, NORMALIZE schema mismatch), plus 7 MAJORs.** Across 9 runs, the pipeline averages 2.9 CRITICALs per run with 96.6% application rate. Every run on a real document has found at least 2 genuine CRITICALs. The pipeline generalizes across 5 document types (design docs, fix plans, implementation plans, reference guides, recommendation reports).

- **Evidence-gating shows promise in its first run: 0 false verification claims vs. Run 8's 2 fabricated claims.** But this is 1 data point. The protocol has a gap: Corrector-1 skipped re-verification of inherited claims (82% compliance, not 100%). The next run should enforce re-verification at the Corrector-1 level and track whether the 0-false-claim result holds.

- **Critic-2 produced its first-ever false positive, creating a new risk category.** In 8 prior runs, critics had never generated a false positive -- only Drafter/Corrector stages had that failure mode. Run 9's Critic-2 falsely claimed KB citations were fabricated. Corrector-2 correctly rejected it, but this relies on Corrector-2's judgment. If Corrector-2 had accepted, the document would have lost all supporting evidence. Monitor whether this recurs.

- **Drafter and Corrector-1 regression rates are structural, not prompt-fixable.** Drafter: 2/run for 3 consecutive runs. Corrector-1: mean 1.1/run across 9 runs, unchanged by 3 retrospective recommendations. Accept these as pipeline costs that Critic-2 and Corrector-2 absorb, or make structural changes (tool access for codebase verification, automated pre-validation).

- **The Reader stage decision is now 9 runs overdue.** Zero evaluative findings in 9 runs. Drop it or merge its inventory function into the Researcher prompt. Every run it remains is wasted tokens with no demonstrated value.
