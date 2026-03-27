# Double-Critique Pipeline -- Retrospective Report

**Date:** 2026-03-24 (Run 11 REVISED)
**Runs covered:** 11 (Run 1 through Run 11R, 2026-03-08 to 2026-03-24)
**Based on:** effectiveness-2026-03-24.md (Run 11 REVISED -- Design Stage PRD)
**Prior version:** retrospective-2026-03-22.md covered Runs 1-10
**Note:** This retrospective supersedes the original Run 11 retrospective, which was based on broken Critic-2 data. All assessments below reflect the corrected run with all 21 findings.

---

## Summary

Run 11 REVISED is the cleanest full-pipeline execution in 11 runs: 21 findings, 100% application rate, zero regressions from both Drafter and Corrector-1, zero false verification claims, and 100% evidence-gating compliance. This is the second consecutive run hitting all ideal values (alongside Run 10), breaking the R7-R9 regression streak decisively. The Critic-2 rerun proved Round 2 is not redundant -- 7 findings (3 MAJOR) were invisible to Round 1. The pipeline generalizes to PRDs (first non-plan document type). Novelty-flag compliance is 0% -- a new metric and the pipeline's weakest dimension. NP-1 (evidence-gating at 100% -> zero C1 regressions) now has 3 confirming data points and is graduated to the knowledge base.

---

## KEEP -- What's Working Well

**[Two-round critic architecture]** -- Two independent critics find fundamentally different bug classes with zero overlap across 11 runs. The Critic-2 rerun proved this by contrast: the original Run 11's Critic-2 failure left 7 findings undiscovered (3 MAJOR), including MAJOR-3 (iteration feedback mechanism) which was essential for the core UX loop. -- Evidence: 11/11 functioning runs complementary. Run 11R: Critic-1 found design-logic flaws (cosmetic gate, cross-requirement contradiction, cost inconsistency); Critic-2 found operational/UX gaps (interview recovery, false-positive cost, feedback mechanism). Zero overlap. -- Action: No change. Most proven structural decision (P5).

**[Researcher front-loading]** -- Zero false positives in 11 runs. The only stage with a perfect accuracy record. Run 11R: 2 CRITICALs, 4 MAJORs, 6 MINORs, 8 verified codebase claims, 7 failure mode gaps, 6 KB patterns cross-referenced. Eliminated the entire "codebase accuracy" problem class before the Drafter started. -- Evidence: 11/11 runs, consistently the most architecturally grounded stage. Freed Critic-1 to focus on higher-level logic analysis (Critic-1 produced its highest-ever CRITICAL count: 3). -- Action: Keep as-is.

**[Evidence-gating protocol]** -- Third consecutive run at 100% compliance. Zero false verification claims across all three (R9 at 82%, R10 at 100%, R11R at 100%). Self-correction observed in R11R: Corrector-2 refined `spawnClaude` to `spawnAgent` (actual export at spawner.ts:10). Pre-protocol Runs 6-8 had fabricated verification in every run. -- Evidence: 3/3 runs with protocol active at 100% compliance had 0 false claims AND 0 regressions from both writing stages. The protocol is the most effective single intervention the pipeline has introduced. -- Action: Keep as mandatory. 100% compliance is the standard, not a stretch target.

**[Evidence-gating at 100% correlates with zero regressions -- NP-1 GRADUATED]** -- Run 11R is the third data point: R9 (82% compliance, 1 C1 regression), R10 (100%, 0 regressions), R11R (100%, 0 regressions). The pattern now has 3 data points with clear directionality and meets all KB graduation criteria. -- Evidence: The only intervention that correlated with zero Corrector-1 regressions after 3 retrospective cycles of prompt changes failed (F2). -- Action: Graduated to knowledge base as P55 (see Graduation Assessment below).

**[Corrector-2 reliability]** -- Perfect record: 0 regressions in 11/11 functioning runs. Run 11R: applied all 7 findings (100%), designed three-tier recovery, confirmation prompt before interview, previous-prototype-in-prompt for re-generation. Self-correction on evidence claims. -- Evidence: Zero regressions ever. 8th consecutive run with non-trivial design contribution. -- Action: No change.

**[6-stage pipeline as production configuration]** -- Second run without Reader, zero downstream degradation. No stage was redundant in Run 11R -- every stage contributed unique value. -- Evidence: Run 10 + Run 11R both clean without Reader. Justifier absent for 7 consecutive runs with no missed findings. -- Action: Confirmed permanent: Researcher, Drafter, Critic-1, Corrector-1, Critic-2, Corrector-2.

**[Severity calibration stability]** -- Distributions remain consistent across 11 runs and 6 document types (fixture, bug-fix plan, implementation plan, reference guide, recommendation report, PRD). -- Evidence: CRITICAL 5-21% (mean 14%), MAJOR 38-47% (mean 42%), MINOR 32-50% (mean 44%). Run 11R at 14/38/48 -- within all bands. -- Action: No change.

**[Application rate]** -- Four consecutive runs at 100%. 11-run mean: 97.2%. -- Evidence: Run 11R: 21/21 applied. The pipeline produces findings that are overwhelmingly accepted as valid. -- Action: No change.

---

## CHANGE -- What Should Be Modified

**[Novelty-flag compliance must be tracked and improved]** -- Run 11R measured 0% (first measurement). The Drafter introduced or preserved at least 4 novel claims without flagging any. All novelty detection fell to critics -- the expensive path. -- Evidence: 4 unflagged novel claims: 4000-token threshold (M5), false-positive UX cost framing (MAJOR-2), manifest write timing assumption (M1), unbounded iteration cost framing (C3). If flagged, critics could have focused on structural analysis. -- Action: Add `[NEW -- NEEDS JUSTIFICATION]` self-check to Drafter prompt. Measure novelty-flag compliance as a first-class metric starting Run 12.

**[Drafter regression monitoring -- cautiously optimistic]** -- Two consecutive zeros (R10-R11R) breaks the R7-R9 streak of 2/run. The reclassification of the 4000-token threshold (preserved from input PRD, not Drafter-invented) supports this. -- Evidence: Series (R6-R11R): 0->2->2->2->0->0. Two consecutive zeros at 100% evidence-gating. But evidence-gating alone cannot prevent novelty-based regressions (NP-2 discovery). -- Action: Continue monitoring. If R12 maintains zero regressions with novelty-flagging active, credit the combined intervention (evidence-gating + novelty-flagging).

**[Config/integration gap checklist for document authors]** -- Still the most common finding type (9/11 runs). Run 11R had the highest single-run count: 4 instances. -- Evidence: SPEC injection unspecified, Playwright dependency unspecified, REPORT stage omitted, iteration feedback mechanism unspecified. -- Action: Repeat recommendation from R10 retrospective: prompt-level checklist for document authors. This is the 4th consecutive recommendation without implementation.

---

## ADD -- New Pipeline Stages or Modifications to Try

**[Novelty-flag self-check for Drafter]** -- Add `[NEW -- NEEDS JUSTIFICATION]` tag requirement for any claim not directly derived from Researcher output or source document. -- Evidence: Run 11R: 0% novelty-flag compliance, 4 unflagged novel claims. All were caught by critics, but earlier detection (at Drafter stage) would reduce critic workload and shift the pipeline toward catching structural issues. -- Action: Implement for Run 12. Track compliance rate as a metric.

**[Cross-requirement contradiction detection prompt for Critic-1]** -- This finding type appeared in 4/11 runs (R4, R9, R11 original, R11R) and was caught exclusively by Critic-1. It requires holding two distant sections in context simultaneously. -- Evidence: Run 11R: 2 contradictions (semantic HTML vs REQ-04, unbounded iteration vs cost motivation). Neither Critic-2 nor Researcher has ever caught this type. -- Action: Add to Critic-1 prompt: "Explicitly check whether each requirement's assumptions are contradicted by other requirements."

**[Automated diff between Corrector-1 input and output]** -- Fourth consecutive retrospective recommendation. Still not implemented. Now less urgent given two consecutive zero-regression runs, but valuable for diagnostics when regressions recur. -- Evidence: When regressions do occur (R2-R9 average: 1.1/run), root cause analysis is opaque without a diff. -- Action: Deprioritize below novelty-flag. Implement if capacity allows.

---

## DROP -- Not Pulling Its Weight

**[Reader stage -- confirmed permanent drop]** -- 9 runs of zero evaluative findings + 2 clean runs without it. No downstream stage reported missing context in either Run 10 or Run 11R. -- Evidence: 11 runs total (9 with Reader contributing nothing, 2 without it with no quality loss). -- Action: Permanently removed.

**[Justifier stage -- confirmed permanent drop]** -- Absent for 7 consecutive runs (R5-R11R). No missed findings. -- Evidence: 7 runs without it, zero observable quality loss. -- Action: Permanently removed.

---

## NEW PATTERNS -- Candidate Patterns Discovered

### NP-1: Evidence-gating at 100% compliance eliminates writing-stage regressions (GRADUATED as P55)

- **Plain-language name:** When everyone shows their receipts, nobody makes stuff up
- **What:** Three consecutive data points confirm: 100% evidence-gating compliance correlates with zero regressions from both Drafter and Corrector-1.
- **Why:** Evidence-gating forces each factual claim to be anchored to a specific file, line number, and quoted code. This prevents fabricated verification that caused regressions in Runs 6-9.
- **Evidence:** R9 (82% compliance): 3 total regressions (2 Drafter + 1 Corrector-1). R10 (100%): 0 regressions. R11R (100%): 0 regressions. Pre-protocol Runs 6-8: fabricated verification in every run.
- **Analogy:** Like requiring receipts for expense reports -- when people know they must show proof, they stop padding the numbers.
- **Status:** GRADUATED to `01-proven-patterns.md` as P55. 3 data points (1 negative control + 2 positive confirmations). Meets stability (3+ runs), evidence (measured numbers), and generalizability (applies to any multi-stage pipeline with verification claims) criteria.
- **Cross-ref:** P11 (external artifacts), P13 (compliance hierarchy), F9 (self-scoring bias).

### NP-2: Evidence-gating does NOT fix Drafter regressions (separate failure mode) -- UPDATED

- **Plain-language name:** Showing receipts only works for things you bought -- it cannot catch things you invented
- **What:** Evidence-gating at 100% compliance prevents fabricated verification but cannot prevent the Drafter from introducing novel claims because there is no existing fact to verify against.
- **Why:** Evidence-gating checks "did you actually read file X at line Y?" It does not check "is this claim derived from any source, or did you invent it?" Novelty and fabrication are orthogonal failure modes.
- **Evidence:** Run 11R: 100% evidence-gating compliance, 0% novelty-flag compliance. 4 novel claims caught only by critics. The reclassification of the 4000-token threshold as "preserved from input" means the Drafter regression count is 0 in R11R, but the underlying novelty-detection gap remains -- those 4 claims were detected by critics, not by any self-check.
- **Status:** 2 data points at 100% compliance (R10 zero regressions, R11R zero regressions but 4 unflagged novel claims). The intervention (novelty-flagging) has not been tested yet. Needs R12 with novelty-flagging active.
- **Cross-ref:** F2 (behavioral prose), NP-1/P55 (evidence-gating for verification).

### NP-3: Pipeline generalizes across document types without configuration changes

- **Plain-language name:** The quality inspector works on any product, not just the one it was trained on
- **What:** Run 11R is the first PRD processed by the pipeline (vs. plans, fix documents, reference guides). It found 3 CRITICALs, 8 MAJORs, 10 MINORs with 100% application rate -- all within established bands.
- **Evidence:** 6 document types across 11 runs: fixture (R1), bug-fix plan (R2), implementation plan (R3-R6, R8, R10), reference guide (R7), recommendation report (R9), PRD (R11R). Finding counts, severity distributions, and application rates are all consistent.
- **Status:** 1 data point for PRDs specifically. Pattern is well-established for plans (8 runs). Hold.

---

## NEW ANTI-PATTERNS -- Candidate Anti-Patterns Discovered

### NAP-1: No artifact-identity validation between pipeline stages (from original Run 11)

- **Plain-language name:** The proofreader checked the wrong essay
- **What:** The pipeline has no mechanism to verify that each stage receives the correct input artifact. The original Run 11 had Critic-2 review a stale document from a prior run.
- **Why it fails:** Stages are connected by file paths. If the wrong path is passed, the stage operates on the wrong document silently.
- **Evidence:** Original Run 11: entire Round 2 wasted. 10 confident findings against the wrong document. The rerun fixed the immediate issue but the structural vulnerability remains.
- **Mitigation:** Document-identity assertion at stage entry (title match, hash check, or path verification).
- **Status:** 1 data point. The rerun prevented data loss but did not fix the underlying vulnerability.

### NAP-2: Unflagged novel claims in Drafter output (first measurement)

- **Plain-language name:** The translator added sentences that were not in the original
- **What:** The Drafter introduces or preserves quantitative claims, cost framings, and mechanism assumptions not present in source material, without flagging them as novel.
- **Why it fails:** Synthesis inherently involves gap-filling. Without a novelty-flag requirement, gap-filling is invisible until critics detect it.
- **Evidence:** Run 11R: 0% novelty-flag compliance. 4 unflagged novel claims caught by critics: 4000-token threshold (M5), false-positive UX cost framing (MAJOR-2), manifest write timing (M1), unbounded iteration framing (C3).
- **Status:** First measurement. Baseline established at 0%.

---

## Knowledge Base Graduation Assessment

Five candidate findings assessed against the three criteria (stability: 3+ runs, evidence: measured numbers, generalizability: applies beyond double-critique):

1. **NP-1: Evidence-gating at 100% eliminates writing-stage regressions** -- Stability: YES (3 data points: R9 negative control at 82% with regressions, R10 positive at 100% with zero, R11R positive at 100% with zero). Evidence: YES (measured compliance % and regression counts with clear inverse correlation). Generalizability: YES (the principle -- "require proof artifacts for verification claims" -- applies to any multi-stage pipeline, not just double-critique; it is P11 applied to verification with P13 Tier 2 enforcement). **Decision: GRADUATE as P55 in `01-proven-patterns.md`. This is the first KB graduation since Run 6 (2026-03-21) and breaks a five-run streak with no graduations.**

2. **NP-2: Evidence-gating does not prevent novelty-based regressions** -- Stability: 2 data points at 100% compliance. NOT YET (needs 3+). Evidence: YES. Generalizability: YES. **Decision: Hold for Run 12 with novelty-flagging active.**

3. **Corrector-2 zero-regression record (11/11 functioning runs)** -- Stability: YES (11 runs). Evidence: YES. Generalizability: YES (final-stage advantage). **Decision: Hold for 1 more functioning run. If 12/12, graduate as "Final-stage correctors outperform mid-pipeline correctors."**

4. **Cross-requirement contradictions as high-value finding type (4/11 runs)** -- Stability: PARTIAL. Evidence: YES. Generalizability: PARTIAL. **Decision: Hold.**

5. **Pipeline generalizes across document types (NP-3)** -- Stability: 1 data point for PRDs. NOT YET. **Decision: Hold for 2+ more non-plan documents.**

**KB graduation result: 1 new entry (P55).** This breaks the five-consecutive-run streak with no graduations. P55 is the scoped claim: "Evidence-gating at 100% compliance eliminates writing-stage regressions in multi-stage pipelines."

---

## Next Run Priorities

1. **Implement novelty-flag self-check for Drafter.** Add `[NEW -- NEEDS JUSTIFICATION]` tag requirement for claims not derived from Researcher output. Track novelty-flag compliance as a first-class metric. This is the pipeline's weakest measured dimension (0%) and the most impactful single intervention available.

2. **Add cross-requirement contradiction prompt to Critic-1.** This finding type (4/11 runs, exclusively caught by Critic-1) would benefit from prompted detection rather than relying on cold-reading. Low implementation cost (one sentence in prompt), potentially high impact on the highest-value finding category.

3. **Implement document-identity validation between stages.** The original Run 11's Critic-2 failure demonstrated that artifact-routing bugs are invisible to stage-quality metrics. A title-match or content-hash check at stage entry would prevent a repeat. This is the only infrastructure vulnerability discovered in 11 runs.
