# Double-Critique Pipeline -- Effectiveness Report

**Date:** 2026-03-21 (Run 2 of the day)
**Run number:** 7 (cumulative)
**Runs covered:** 7 (Run 1: 2026-03-08 fixture, Run 2: 2026-03-08 e2e-bugfix, Run 3: 2026-03-14 phase-6-plan, Run 4: 2026-03-15 post-mvp-plan, Run 5: 2026-03-17 normalize-stage-plan, Run 6: 2026-03-21 pipeline-failure-fix-plan, Run 7: 2026-03-21 CI/CD reference guide)
**Author:** Effectiveness analysis agent

---

## This Run

This run critiqued a CI/CD reference guide and produced 20 findings across two critique rounds, all of which were applied.

- **Document critiqued:** CI/CD Setup Reference Guide (pipeline reliability, workflow replication across repos), processed via `tmp/dc-{1..9}-*.md` stages
- **Total findings: 20** (critic-originated, actionable)
  - CRITICAL: 3 (2 from Critic-1: C1 unsupported CI health claim, C2 security status contradiction; 1 from Critic-2: F1 reusable workflow YAML mixing two files in one code block)
  - MAJOR: 8 (5 from Critic-1: M1 "self-improving loop" misnomer, M2 missing cost analysis, M3 reusable workflow missing permissions block, M4 Node 18 called "current LTS" past EOL, M5 Release-Please no failure mode analysis; 3 from Critic-2: F2 postinstall hook footgun, F3 Dependabot label race condition, F4 cost figures without methodology)
  - MINOR: 9 (5 from Critic-1: m1-m5 including AI review as required check risk, Dependabot cost noise; 4 from Critic-2: F5 fetch-depth undocumented, F6 engines field inconsistency, F7 token ownership ambiguity, F8 correction log confusing readers)
- **Application rate: 100%** (20/20 actionable findings applied)
- **Pre-critic findings (Researcher):** 5 factual inaccuracies (version range mismatch, "~6 rounds" misleading, Round 3 narrative unsupported, max-turns progression unverified, timeout progression unverified), 4 unjustified design decisions, 10 missing failure modes, Windows compatibility issue. All resolved by the Drafter before critics saw the document.
- **Pipeline variant:** 7-stage (Reader, Researcher, Drafter, Critic-1, Corrector-1, Critic-2, Corrector-2). No Justifier stage.

### Stages that carried weight vs. stages that added nothing

The columns below: **Contribution** rates the stage's impact on this run (HIGH/MEDIUM/LOW). **Key output** summarizes the stage's most important deliverables.

| Stage | Contribution | Key output |
|-------|-------------|-----------|
| Researcher (2) | **HIGH -- MVP of the run** | Caught 5 factual inaccuracies (version range mismatch, unsupported Round 3 narrative, unverified progressions), 10 missing failure modes, 4 unjustified decisions. All verified with line numbers and CHANGELOG references. Zero false positives. The single highest-yield stage. |
| Critic-1 (4) | **HIGH** | 12 findings (2C/5M/5Mi). Found the two most important framing problems: unsupported CI health claim (C1) and security status contradiction (C2). Also caught the most dangerous technical gap: missing permissions block in reusable workflow YAML (M3). |
| Critic-2 (6) | **HIGH** | 8 findings (1C/3M/4Mi), all entirely new -- zero overlap with Critic-1. Found the CRITICAL copy-paste YAML hazard (F1), the postinstall footgun (F2), and the Dependabot label race condition (F3). Also caught 2 defects introduced by Corrector-1 itself (cost methodology gap, label race condition). |
| Corrector-2 (7) | **HIGH** | Applied 8/8 findings (100%). Split the YAML into two copy-pasteable blocks (most impactful structural fix). Promoted `branches-ignore` over `skip-review` label. Reframed cost estimates as unverified. Zero regressions. |
| Drafter (3) | **MEDIUM-HIGH** | Heavy lifting on restructuring: corrected version history, added failure behaviour subsection, added cost projection, added Node 18 EOL context. But introduced 2 new errors: incorrect Node 18 LTS statement and cost figures without methodology. |
| Corrector-1 (5) | **MEDIUM** | Applied 12/12 Critic-1 findings. Self-review caught the YAML two-file issue but dismissed it ("No fix needed"). Introduced 2 new problems (unsourced cost figures, race-condition-prone label suggestion) that required Critic-2 cleanup. |
| Reader (1) | **LOW** | Produced 199-line structured inventory across 4 sections. Did not flag any factual inaccuracies, missing analysis, or the "self-improving loop" overstatement. Zero evaluative contribution. Faithful transcription only. |

---

## Cross-Run Trends

Finding volume remains stable at 15-26 per run; Run 7's 20 is slightly above the 6-run mean of 18.8. Application rate returned to 100% after Run 6's 94%.

### Finding counts and severity profiles across all runs

The columns: **Run** identifies the document. **CRITICAL/MAJOR/MINOR** are finding counts by severity. **Total** is the sum. **App rate** is the percentage of actionable findings applied to the final document.

| Run | Date | Document | CRITICAL | MAJOR | MINOR | Total | App rate |
|-----|------|----------|----------|-------|-------|-------|----------|
| 1 -- Rate Limiter (fixture) | 2026-03-08 | Design doc (planted flaws) | 3 | 7 | 8 | 18 | 94% |
| 2 -- E2E Bug Fix Plan | 2026-03-08 | Real bug fix plan | 2 | 6 | 7 | 15 | 93% |
| 3 -- Phase 6 Plan | 2026-03-14 | Real implementation plan | 4 | 11 | 11 | 26 | 100% |
| 4 -- Post-MVP Plan | 2026-03-15 | Real implementation plan | 4 | 9 | 6 | 19 | 100% |
| 5 -- Normalize Stage Plan | 2026-03-17 | Real implementation plan | 2 | 8 | 7 | 17 | 100% |
| 6 -- Pipeline Failure Fix Plan | 2026-03-21 | Real fix plan | 3 | 7 | 8 | 18 | 94% |
| **7 -- CI/CD Reference Guide** | **2026-03-21** | **Real reference doc** | **3** | **8** | **9** | **20** | **100%** |

### What the numbers say

1. **Finding counts: 18 -> 15 -> 26 -> 19 -> 17 -> 18 -> 20.** The 7-run range remains 15-26. Run 7's 20 is slightly above the mean of 19.0. No upward or downward trend -- volume continues to track document complexity.

2. **CRITICAL counts: 3 -> 2 -> 4 -> 4 -> 2 -> 3 -> 3.** Run 7 holds steady at 3, matching the 7-run mean of 3.0 exactly. All 3 CRITICALs in Run 7 were qualitatively important: unsupported health claim, security contradiction, and a copy-paste YAML hazard.

3. **Application rate: 94% -> 93% -> 100% -> 100% -> 100% -> 94% -> 100%.** Run 7 returns to 100%, breaking the pattern of the two sub-100% runs (1 and 6). Updated mean: 97.3% across 7 runs.

4. **Severity distribution (% of total):**

| Severity | R1 | R2 | R3 | R4 | R5 | R6 | R7 | Mean |
|----------|-----|-----|-----|-----|-----|-----|-----|------|
| CRITICAL | 17% | 13% | 15% | 21% | 12% | 17% | 15% | 16% |
| MAJOR | 39% | 40% | 42% | 47% | 47% | 39% | 40% | 42% |
| MINOR | 44% | 47% | 42% | 32% | 41% | 44% | 45% | 42% |

Run 7 sits squarely in the established bands: CRITICAL 15% (band: 12-21%), MAJOR 40% (band: 39-47%), MINOR 45% (band: 32-47%). Severity calibration remains remarkably stable across 7 runs.

### Recurring finding types

| Finding type | Runs present | Run 7 evidence |
|-------------|-------------|----------------|
| **Corrector/Drafter introduces new defects** | 6/7 (all except R1) | Drafter introduced incorrect Node 18 LTS statement and unsourced cost figures. Corrector-1 introduced race-condition-prone label suggestion and dismissed YAML two-file issue it flagged itself. |
| **False safety claims / incorrect mitigation references** | 4/7 (R4, R5, R6, R7) | Document claimed security was "In place" while describing no enforcement mechanism. CI health claimed "no known failures" with no supporting data. Both propagated through Reader, Drafter, and partially through Critic-1 before being fully caught. |
| **Silent config/integration gaps** | 5/7 (R2, R3, R5, R6, R7) | Missing permissions block in reusable workflow would reproduce the exact OIDC failure (v0.7.1) the document warns about. `fetch-depth: 0` undocumented. `engines` field not mentioned alongside Node matrix change. |
| **Verification/test gaps** | 5/7 (R2, R4, R5, R6, R7) | Version history claims (round labeling, "~6 rounds", max-turns progression, timeout progression) were unverified assertions accepted at face value. |
| **Copy-paste hazards in code examples** | 2/7 (R6, R7) | Run 7: YAML mixing two files in one code block -- a CRITICAL for a reference doc intended for direct copying. New pattern emerging. |

### Is the pipeline finding fewer issues over time?

No. Run 7 found 20 findings (above the 19.0 mean), including 3 CRITICALs. Each run reviews a different document, so stable finding counts are expected. The meaningful signal: **every run on a real document finds at least 2 CRITICALs** (7/7 runs), and those CRITICALs are always specific to that document's content.

---

## Stage Effectiveness Rankings

The columns: **Contribution** rates overall value across all runs (HIGH/MEDIUM/LOW). **Trend** compares recent runs to earlier runs (IMPROVING/STABLE/DECLINING).

| Stage | Contribution | Trend | Evidence (7 runs) |
|-------|-------------|-------|-------------------|
| **Critic-2** | **HIGH** | **STABLE (peak)** | Run 7: 8 findings (1C/3M/4Mi), all new -- zero overlap with Critic-1. Found the CRITICAL YAML copy-paste hazard and 2 defects introduced by Corrector-1. Across 7 runs: consistently finds issues invisible to Critic-1, with zero false positives. |
| **Researcher** | **HIGH** | **STABLE** | Run 7: 5 factual inaccuracies verified against CHANGELOG with line numbers, 10 missing failure modes, 4 unjustified decisions. The extractor calls it "the most valuable early-stage player." Across 7 runs: zero false positives, highest foundational value. |
| **Critic-1** | **HIGH** | **RECOVERING** | Run 7: 12 findings (2C/5M/5Mi) -- a strong rebound from Run 6's 0 CRITICALs. Found C1 (unsupported health claim) and C2 (security contradiction), both high-impact framing problems. The Run 6 retrospective recommended adding codebase-verification instructions; Run 7's document was more amenable to document-logic critique, which may explain the rebound rather than a prompt change. |
| **Drafter** | **MEDIUM-HIGH** | **MIXED** | Run 7: Did heavy restructuring and gap-filling but introduced 2 new errors (Node 18 LTS statement, unsourced cost figures). Run 6 was the Drafter's best (zero regressions); Run 7 reverts to the historical pattern of introducing 1-3 defects. Across 7 runs: essential for volume but unreliable for accuracy. |
| **Corrector-2** | **HIGH** | **IMPROVING** | Run 7: 8/8 applied (100%), zero regressions. The YAML split and `branches-ignore` promotion were the two most reader-impactful fixes. Across 7 runs: perfect application rate, 0 regressions, increasingly sophisticated self-review. |
| **Corrector-1** | **MEDIUM** | **STABLE (mediocre)** | Run 7: Applied 12/12 Critic-1 findings but introduced 2 new problems and dismissed a valid self-review finding. Regression pattern across 7 runs: 0 -> 1 -> ? -> 2 -> 1 -> 1 -> 2. Not improving. |
| **Justifier** | **LOW** | **N/A (absent Runs 5-7)** | Not present in Run 7. Three consecutive runs without Justifier, zero missed findings attributable to its absence. Effectively deprecated. |
| **Reader** | **LOW** | **STABLE (consistently low)** | Run 7: 199-line inventory, zero evaluative findings. Did not flag Node 18 EOL error, missing cost analysis, or "self-improving loop" overstatement it cataloged. 7/7 runs: no original discovery. |

---

## What's Working

Pipeline behaviors that consistently produce value, with evidence from multiple runs.

**1. Two critique rounds find fundamentally different bug classes (7/7 runs)**
Run 7 continues the pattern: Critic-1 found framing/consistency problems (unsupported claims, contradictions, missing analysis), Critic-2 found operational/copy-paste problems (YAML hazard, race condition, footgun, methodology gap). Zero overlap in findings across all 7 runs. This is the pipeline's defining strength.

**2. Researcher front-loading prevents downstream waste (7/7 runs)**
In Run 7, the Researcher verified every claim against CHANGELOG and codebase files, catching 5 inaccuracies and 10 missing failure modes before the Drafter wrote a line. Across 7 runs: 4-15 pre-critic findings per run, zero false positives. The Researcher is the only stage that has never produced a false positive or introduced a defect.

**3. Corrector-2 consistently delivers clean final output (7/7 runs)**
Run 7: 100% application, zero regressions, creative solutions (YAML split, `branches-ignore` promotion). Across 7 runs: perfect application rate, 0 regressions ever. The final corrector is the most reliable stage in the pipeline.

**4. Severity calibration remains stable across 7 runs**
CRITICAL: 12-21% (mean 16%). MAJOR: 39-47% (mean 42%). MINOR: 32-47% (mean 42%). Run 7 sits at 15/40/45 -- squarely within bands. This consistency means severity ratings are meaningful for cross-run comparison and prioritization.

**5. 7-stage pipeline (no Justifier) continues to work (3 consecutive runs)**
Three runs without the Justifier stage, zero quality loss. The Researcher absorbs justification-challenge naturally. Token savings confirmed.

---

## What's Not Working

Pipeline behaviors that consistently underperform or add no value.

**1. Corrector-1 continues to introduce defects (6/7 runs)**
Run 7: introduced 2 new problems (race-condition-prone label suggestion, dismissed valid self-review finding). This matches the persistent pattern -- in 6 of 7 runs, either the Drafter or Corrector-1 introduced defects that required Critic-2 cleanup. Corrector-1's regression count across runs: 0 -> 1 -> ? -> 2 -> 1 -> 1 -> 2. The Run 6 retrospective recommended adding "verify against the actual codebase" instructions. Run 7 shows no improvement yet.

**2. Drafter regression rate bounced back after Run 6's clean run**
Run 6 was the Drafter's best (zero regressions). Run 7 reverts: introduced incorrect Node 18 LTS statement and unsourced cost figures. The hypothesis from Run 6 -- that stronger Researcher input reduces Drafter regressions -- is not confirmed. The Researcher was strong in both Run 6 and Run 7, yet Run 7's Drafter still introduced errors. Sample size is small (n=2 for the hypothesis); more data needed.

**3. False safety claims still propagate deep into the pipeline (4/7 runs)**
In Run 7, the "In place" security claim and "no known failures" CI health assertion passed through the Reader and Drafter before Critic-1 caught them. The "self-improving loop" narrative was accepted by 3 stages before Critic-1 flagged it. While Run 7's false claims were caught at stage 4 (earlier than Run 6's stage 6), the pattern persists: no stage before the critics owns "verify mitigation claims" as an explicit duty.

**4. Reader remains zero-value for finding discovery (7/7 runs)**
Seven runs, zero original findings. Run 7: faithfully cataloged every claim, identified document flow, correctly identified audience -- but flagged nothing. The extractor explicitly notes it "added no critical judgment of its own -- it was a transcription, not an analysis." The Reader's inventory gives the Researcher a checklist, but a strong Researcher could build that checklist itself.

---

## So What?

- **Run 7 validates the pipeline on a new document type (CI/CD reference guide vs. prior implementation/fix plans) with the same effectiveness: 3 CRITICALs caught, 100% application rate, 20 findings total.** The pipeline generalizes beyond implementation plans. Across 7 runs on 4 document types, the mean is 3.0 CRITICALs per run with 97.3% application rate.

- **Critic-1 rebounded to 2 CRITICALs in Run 7 after the Run 6 zero-CRITICAL result.** This suggests Run 6 was document-specific (all CRITICALs required code-level reasoning) rather than a permanent Critic-1 decline. However, the retrospective's recommendation to add codebase-verification to Critic-1's prompt is still worth pursuing -- Run 7 happened to have CRITICALs visible from document logic alone.

- **The "Corrector-1 introduces defects" anti-pattern is now confirmed at 6/7 runs and is the pipeline's most persistent weakness.** The Run 6 retrospective recommended prompt changes; those changes have not yet been measured in a controlled way. This should remain the top priority for the next pipeline iteration.

- **The Reader should be the next stage to either reform or drop.** Seven runs of zero-value evaluative output is sufficient data. The retrospective's suggestion to either add evaluative instructions or skip Reader entirely should be tested in the next run.

- **Copy-paste hazards in code examples are an emerging pattern (2/7 runs).** Run 7's CRITICAL YAML two-file-in-one-block issue and Run 6's similar integration gap suggest that documents containing code examples need explicit "is this copy-pasteable?" review criteria. Consider adding this to Critic-1 or Critic-2's prompt.
