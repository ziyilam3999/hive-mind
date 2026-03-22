# Double-Critique Pipeline -- Effectiveness Report

**Date:** 2026-03-21
**Runs covered:** 6 (Run 1: 2026-03-08 fixture, Run 2: 2026-03-08 e2e-bugfix, Run 3: 2026-03-14 phase-6-plan, Run 4: 2026-03-15 post-mvp-plan, Run 5: 2026-03-17 normalize-stage-plan, Run 6: 2026-03-21 pipeline-failure-fix-plan)
**Author:** Effectiveness analysis agent

---

## This Run

- **Document critiqued:** Hive-Mind Pipeline Failure Analysis & Fix Plan (5 fixes for pipeline failures in the AI orchestrator), processed via `tmp/dc-{1..9}-*.md` stages
- **Total findings: 18** (critic-originated, actionable)
  - CRITICAL: 3 (0 from Critic-1, 3 from Critic-2: missing retry loop for whole-story BUILD, sync/async `verifyFixApplied` signature, `git diff` running in wrong directory)
  - MAJOR: 7 (4 from Critic-1: tsc gate language assumption, `sourceFiles` trust/provenance, retry regression for "passed" sub-tasks, fragile free-text report parsing; 3 from Critic-2: wrong test file paths, concurrent `tsc --noEmit` pollution, concurrent `git diff` baseline pollution)
  - MINOR: 8 (5 from Critic-1: priority ordering, tsc detection mechanism, context sizing vagueness, cross-reference gap, + 1 rejected stale verdict; 3 from Critic-2: compliance check on partial failure, `sourceFiles: undefined` type contradiction, prompts.ts vs execute-verify.ts ambiguity)
- **Application rate: 94%** (17/18 actionable findings applied; 1 skipped by Corrector-1 -- Finding 8 "stale verdict" -- with documented rationale)
- **Pre-critic findings (Researcher):** 7 verified claims (2 inaccurate, 1 partial), 13 failure-mode gaps, Windows compatibility issue, hooks feasibility analysis. All resolved by the Drafter before critics saw the document.
- **Pipeline variant:** 7-stage (Reader, Researcher, Drafter, Critic-1, Corrector-1, Critic-2, Corrector-2). No Justifier stage.

### Stages that carried weight vs. stages that added nothing

| Stage | Contribution | Key output |
|-------|-------------|-----------|
| Critic-2 (6) | **HIGH -- MVP of the run** | 9 findings (3C/3M/3Mi). Found all 3 CRITICALs: missing retry loop (permanent failure on throw), sync/async signature mismatch, wrong-directory `git diff` (would check hive-mind files instead of target project). Without this stage, the plan would have shipped with 3 production bugs. |
| Researcher (2) | **HIGH** | Redirected Fix 2 from unproven Claude Hooks approach to pipeline-level `tsc --noEmit` gate (the single biggest architectural change). Caught diagnostician-bug vs diagnostician agent-type error, return-type mismatch, test file existence issue, Windows `.sh` script incompatibility. 7 codebase claims verified with line numbers. |
| Corrector-2 (7) | **HIGH** | Applied 9/9 findings (100%). Replaced entire `git diff` approach with file content hashing -- an elegant solution that resolved the wrong-directory, sync/async, and concurrent-pollution problems simultaneously. Self-caught 1 additional edge case (snapshot must be per-attempt inside VERIFY loop). |
| Drafter (3) | **HIGH (volume)** | Rewrote Fix 2 architecture, fixed agent-type error, changed error-handling to `throw`, added edge cases. Conservative, well-justified changes. Zero regressions introduced. |
| Critic-1 (4) | **MEDIUM** | 9 findings (0C/4M/5Mi). Caught trust assumptions (`sourceFiles` provenance), fragile report parsing, and tsc language gap. But operated purely on document logic without codebase verification, so missed all 3 CRITICALs. |
| Corrector-1 (5) | **MEDIUM** | Applied 8/9 Critic-1 findings. Self-caught 1 edge case (`git add`/`git commit` fooling git diff). But adopted the `git diff` approach which had 3 hidden flaws requiring Critic-2 cleanup. |
| Reader (1) | **LOW** | Produced structured inventory (8 sections, 21 claims, 9 decisions, 5 implementation items). No evaluative findings. Useful scaffolding for downstream but zero original discovery. |

---

## Cross-Run Trends

### Finding counts and severity profiles across all runs

| Run | Date | Document | CRITICAL | MAJOR | MINOR | Total | App rate |
|-----|------|----------|----------|-------|-------|-------|----------|
| 1 -- Rate Limiter (fixture) | 2026-03-08 | Design doc (planted flaws) | 3 | 7 | 8 | 18 | 94% (17/18) |
| 2 -- E2E Bug Fix Plan | 2026-03-08 | Real bug fix plan | 2 | 6 | 7 | 15 | 93% (14/15) |
| 3 -- Phase 6 Plan | 2026-03-14 | Real implementation plan | 4 | 11 | 11 | 26 | 100% (26/26) |
| 4 -- Post-MVP Plan | 2026-03-15 | Real implementation plan | 4 | 9 | 6 | 19 | 100% (19/19) |
| 5 -- Normalize Stage Plan | 2026-03-17 | Real implementation plan | 2 | 8 | 7 | 17 | 100% (17/17) |
| **6 -- Pipeline Failure Fix Plan** | **2026-03-21** | **Real fix plan** | **3** | **7** | **8** | **18** | **94% (17/18)** |

### What the numbers say

1. **Finding counts: 18 -> 15 -> 26 -> 19 -> 17 -> 18.** The range has stabilized at 15-26 across 6 runs. Run 6's 18 is median. No upward or downward trend -- finding volume tracks document complexity, not pipeline maturation.

2. **CRITICAL counts: 3 -> 2 -> 4 -> 4 -> 2 -> 3.** Run 6 returns to the Run 1 level. The 3 CRITICALs were high quality: each would have caused a distinct production failure (permanent crash on build failure, wrong directory for verification, broken function signature). Mean across 6 runs: 3.0 CRITICALs per run.

3. **Application rate: 94% -> 93% -> 100% -> 100% -> 100% -> 94%.** Run 6 broke the three-run streak of 100%. The 1 skipped finding (Critic-1 Finding 8, "stale verdict") was rejected with documented rationale by Corrector-1, so this is not noise -- it is a legitimate editorial judgment. Mean across 6 runs: 97%.

4. **Severity distribution (% of total):**

| Severity | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Run 6 | Mean |
|----------|-------|-------|-------|-------|-------|-------|------|
| CRITICAL | 17% | 13% | 15% | 21% | 12% | 17% | 16% |
| MAJOR | 39% | 40% | 42% | 47% | 47% | 39% | 42% |
| MINOR | 44% | 47% | 42% | 32% | 41% | 44% | 42% |

Run 6 snaps back to the Run 1 distribution almost exactly (17/39/44 vs 17/39/44). The severity calibration is remarkably stable over 6 runs, oscillating in narrow bands: CRITICAL 12-21%, MAJOR 39-47%, MINOR 32-47%.

### Recurring finding types (2+ runs)

| Finding type | Runs present | Run 6 evidence |
|-------------|-------------|----------------|
| **Corrector/Drafter introduces new defects** | 5/6 (Runs 2-6) | Corrector-1 adopted `git diff --name-only` approach which had 3 hidden flaws (wrong directory, sync/async, concurrent pollution). All required Critic-2 to clean up. |
| **Silent config/integration gaps** | 4/6 (Runs 2, 3, 5, 6) | Plan assumed `executeWholeStory` has a retry loop -- it does not. `verifyFixApplied` is synchronous but proposed approach requires subprocess execution. Authors miss integration points. |
| **False safety claims / incorrect mitigation references** | 3/6 (Runs 4, 5, 6) | Plan states "throw and let the retry loop handle it" -- no retry loop exists. Critic-1 accepted this claim at face value without verifying. Critic-2 caught it. |
| **Verification/test gaps** | 4/6 (Runs 2, 4, 5, 6) | Plan references 3 test files to "modify" that don't exist at the listed paths (they exist at different subdirectory paths). |
| **Wrong directory / path errors** | 3/6 (Runs 3, 5, 6) | `git diff --name-only` would run in `hiveMindDir` instead of `moduleCwd` -- checking hive-mind's own report files instead of the target project's source files. |

### Is the pipeline finding fewer issues over time?

No. The finding count for Run 6 (18) is identical to Run 1. Each run reviews a different document, so this is expected. The meaningful signal remains: **every run on a real document finds at least 2 CRITICALs**, and those CRITICALs are always novel to that document. The recurring "silent integration gap" pattern (4/6 runs) and "false safety claims" pattern (3/6 runs) suggest these are persistent blind spots in document authoring, not pipeline failures -- the pipeline catches them consistently.

---

## Stage Effectiveness Rankings

| Stage | Contribution | Trend | Evidence (6 runs) |
|-------|-------------|-------|-------------------|
| **Critic-2** | **HIGH** | **STABLE (peak)** | Run 6: 9 findings (3C/3M/3Mi), all 3 CRITICALs in the run. Across 6 runs: 55 findings total, 11 CRITICALs. Found the wrong-directory `git diff` bug in Run 6 -- the single most dangerous flaw that would have been extremely hard to debug in production. Continues to be the most valuable stage. Trend was IMPROVING through Run 5; Run 6 maintains peak performance, hence reclassified as STABLE at the top. |
| **Researcher** | **HIGH** | **STABLE** | Run 6: 7 codebase verifications, 13 failure-mode gaps, and the pivotal hooks-to-pipeline-gate redirect. Across 6 runs: consistently the highest-value early stage with zero false positives. Run 6 contribution was the most architecturally significant of any Researcher run -- it changed the plan's core approach for Fix 2 before any critic saw it. |
| **Critic-1** | **HIGH** | **DECLINING (slight)** | Run 6: 9 findings but 0 CRITICALs -- the first run where Critic-1 found no CRITICALs. Prior runs: always at least 1 CRITICAL (2, 1, 1, 2, 1). Run 6's findings were trust/provenance/fragility concerns (MAJORs and MINORs) rather than correctness defects. The Critic-1 operated purely on document logic without codebase verification, missing all 3 CRITICALs that required code-level reasoning. |
| **Drafter** | **HIGH (volume)** | **IMPROVING** | Run 6: Fixed all Researcher findings, rewrote Fix 2 architecture, zero regressions introduced. This is the first run since Run 1 where the Drafter introduced no new defects. Prior runs (4, 5) had 3 and 2 Drafter-introduced regressions respectively. If this holds, it reverses the "defect-prone Drafter" pattern. |
| **Corrector-2** | **HIGH** | **IMPROVING** | Run 6: 9/9 applied (100%), zero regressions, plus the file-content-hashing replacement for `git diff` -- the most elegant design contribution of the entire run. Self-caught 1 edge case (snapshot per-attempt). Across 6 runs: perfect application rate, 0 regressions, increasing self-catch sophistication. |
| **Corrector-1** | **MEDIUM** | **STABLE (mediocre)** | Run 6: 8/9 applied (89%), 1 skipped with rationale. Self-caught 1 edge case. But adopted the `git diff` approach without checking for hidden flaws (wrong directory, sync/async, concurrency). Regression pattern: 0 -> 1 -> ? -> 2 -> 1 -> 1 (flawed adoption). Not worsening, not improving. |
| **Justifier** | **LOW** | **N/A (absent Runs 5-6)** | Not present in Run 6. Run 5 validated that dropping it caused no quality loss. Two consecutive runs without Justifier, zero missed findings attributable to its absence. Effectively deprecated. |
| **Reader** | **LOW** | **STABLE (consistently low)** | Run 6: produced inventory of 21 claims, 9 decisions, 5 implementation items. Zero original findings. Did not flag the return-type mismatch it faithfully cataloged. 6/6 runs: no evaluative contribution. The Reader's extractor explicitly notes it "didn't evaluate whether any claims were accurate." |

---

## What's Working

**1. Researcher front-loading prevents architectural dead ends (6/6 runs)**
In Run 6, the Researcher killed the entire Claude Hooks approach for Fix 2 before the Drafter wrote a line -- saving every downstream stage from debating hooks feasibility, Windows `.sh` script compatibility, and `--print` mode behavior. This is the most architecturally significant Researcher contribution across all 6 runs. Across all runs, the Researcher has caught between 4 and 15 pre-critic findings per run with zero false positives.

**2. Two critique rounds find fundamentally different bug classes (6/6 runs)**
Run 6 is the clearest demonstration yet: Critic-1 found 0 CRITICALs (trust/provenance/fragility concerns), Critic-2 found 3 CRITICALs (code-level correctness defects). Zero overlap in findings. The separation is not just quantity but kind -- Critic-1 reasons about the document's internal logic, Critic-2 reasons about how the document maps to the actual codebase.

**3. Corrector-2 is producing genuinely creative solutions (Runs 5-6)**
In Run 6, Corrector-2 replaced the entire `git diff` approach with file content hashing -- solving the wrong-directory, sync/async, and concurrent-pollution problems in one move. In Run 5, Corrector-2 had 3 self-catches. The final corrector is not just mechanically applying fixes; it is redesigning approaches when the critic's analysis reveals the original was fundamentally flawed.

**4. Severity calibration is consistent across 6 runs**
CRITICAL: 12-21% (mean 16%). MAJOR: 39-47% (mean 42%). MINOR: 32-47% (mean 42%). The pipeline is not inflating severity over time. Run 6 matched Run 1's distribution almost exactly. This means finding severity is meaningful and comparable across runs.

**5. Dropping the Justifier continues to work (2 consecutive runs)**
Run 6 is the second run without a Justifier. No finding type from earlier Justifier-inclusive runs is missing from Run 6's output. The Researcher naturally absorbs the justification-challenge role. Token savings confirmed with no quality cost.

---

## What's Not Working

**1. Corrector-1 continues to introduce flawed approaches (5/6 runs with defects in Corrector-1 or Drafter)**
Run 6: Corrector-1 adopted `git diff --name-only` based on Critic-1's suggestion without verifying it against the codebase. The approach had 3 hidden flaws (wrong directory, sync/async signature, concurrent pollution). This is the same pattern as Run 2 (`parseReportStatus` callers broken) and Run 4 (2 regressions). Corrector-1 applies the fix it is told to apply but does not ask "does my fix work in the actual code?"

**2. Critic-1 cannot find code-level correctness defects (consistent, Run 6 is clearest example)**
Run 6 is the first run where Critic-1 found 0 CRITICALs. It accepted the "throw and let the retry loop handle it" claim at face value without checking whether a retry loop exists. It accepted the `git diff` suggestion without checking which directory it would execute in. It did not verify any claims against the actual codebase. Prior runs masked this because Critic-1 found CRITICALs that happened to be visible from document logic alone. In Run 6, all CRITICALs required codebase verification, and Critic-1 missed all of them.

**3. False safety claims still propagate through multiple stages (3/6 runs)**
In Run 6, the plan's claim that "the retry loop handles it" was accepted by the Reader, Researcher (partially -- it caught other issues but not this one), Drafter, Critic-1, and Corrector-1. It took Critic-2 (stage 6 of 7) to verify the claim was false. In prior runs (4, 5), similar false mitigation references propagated the same way. The pipeline catches these, but only at the last moment.

**4. Reader remains zero-value for finding discovery (6/6 runs)**
Six runs, zero original findings. The Reader faithfully cataloged the `{ passed: false }` return-type mismatch but did not flag it. It listed all test file references but did not notice they don't exist. The structural inventory may save downstream stages some reading time, but this has never been measured, and the token cost is paid every run.

---

## So What?

- **Run 6 confirms the pipeline's core value proposition: 3 CRITICALs caught that would have caused real production bugs.** The wrong-directory `git diff` alone would have been a silent, extremely hard-to-debug failure in production. Across 6 runs on real documents, the pipeline averages 3.0 CRITICALs per run with a 97% application rate.

- **Critic-1's 0-CRITICAL run is a yellow flag, not a red flag.** Run 6 exposed that Critic-1 operates on document logic only and cannot verify claims against the codebase. It still found 4 MAJORs (trust, fragility, provenance). But if all CRITICALs in a document require code-level reasoning, Critic-1 will miss them. Consider adding codebase-verification instructions to Critic-1's prompt -- currently only Critic-2 and the Researcher do this.

- **Corrector-1's "adopt without verifying" pattern is the most persistent weakness.** In 5 of 6 runs, either the Drafter or Corrector-1 introduced a defect that Critic-2 had to clean up. The previous report recommended adding a "check your fix against the full document" instruction. Run 6 shows the instruction should go further: "check your fix against the actual codebase, not just the document."

- **The Drafter had its best run (zero regressions) since Run 1.** If this is a real improvement (rather than noise from a simpler document), it may indicate that the Researcher's stronger-than-usual contribution in Run 6 (architectural redirect, multiple codebase verifications) gave the Drafter better inputs to work from.

- **Pipeline cost optimization is validated: 7 stages (no Justifier) delivers the same quality as 8.** Two consecutive runs without the Justifier, zero missed findings. The 7-stage configuration should be considered the default going forward.
