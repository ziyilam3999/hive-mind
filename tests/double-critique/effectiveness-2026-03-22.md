# Double-Critique Pipeline -- Effectiveness Report

**Date:** 2026-03-22
**Run number:** 8 (cumulative)
**Runs covered:** 8 (Run 1: 2026-03-08 fixture, Run 2: 2026-03-08 e2e-bugfix, Run 3: 2026-03-14 phase-6-plan, Run 4: 2026-03-15 post-mvp-plan, Run 5: 2026-03-17 normalize-stage-plan, Run 6: 2026-03-21 pipeline-failure-fix-plan, Run 7: 2026-03-21 CI/CD reference guide, Run 8: 2026-03-22 pipeline-bug-fix-plan)
**Author:** Effectiveness analysis agent

---

## This Run

Run 8 critiqued an implementation plan for 3 pipeline bugs and produced 20 findings across two critique rounds, all applied, with two compilation blockers caught and a late-stage architectural pivot that improved the final design.

- **Document critiqued:** Implementation plan for fixing 3 pipeline bugs in hive-mind (scope rules, max-5 enforcement, uncommitted stories), processed via `tmp/dc-{1..9}-*.md` stages
- **Total findings: 20** (critic-originated, actionable)
  - CRITICAL: 2 (1 from Critic-1: overlap guard category mismatch; 1 from Critic-2: `config.projectRoot` does not exist in `HiveMindConfig`)
  - MAJOR: 9 (5 from Critic-1: false-positive registry warnings, no salvage safety criteria, incomplete path traversal guard, rule merge loses specificity, zero test coverage for riskiest code; 4 from Critic-2: multi-module path resolution, salvage ordering atomicity gap, sub-task impl reports missed, wrong import paths + duplicates)
  - MINOR: 9 (4 from Critic-1: incorrect `console.warn` rationale, issue numbering inconsistency, shell injection via `git add`, anti-pattern references unexplained; 5 from Critic-2: separator row filter too aggressive, missing `Story` type import, `--pathspec-from-file` requires git 2.26+, no multi-module test, `computeModifiedFiles`/`runCommit` changes prose-only)
- **Application rate: 100%** (20/20 actionable findings applied; zero rejections)
- **Pre-critic findings (Researcher):** 7 verified claims (key corrections: max-5 applies to ALL agent types not just refactorer, `ensureDirSync` does not exist in codebase), YAGNI flag on `envRequires`, missing caller audit, 4 knowledge-base cross-references (F2, F49, F32, C-SCALE-2). All resolved by the Drafter before critics saw the document.
- **Corrector-1 regressions: 1** (`config.projectRoot` type error perpetuated with false self-review verification)
- **Corrector-2 regressions: 0** (also produced architectural pivot to `plan-validator` agent)
- **Pipeline variant:** 7-stage (Reader, Researcher, Drafter, Critic-1, Corrector-1, Critic-2, Corrector-2). No Justifier stage.

### Stages that carried weight vs. stages that added nothing

| Stage | Contribution | Key output |
|-------|-------------|-----------|
| Researcher (2) | **HIGH -- co-MVP** | Caught both compilation blockers (`ensureDirSync` nonexistent, max-5 applies to all 37 agent types), corrected the key factual error, killed ENV-TAGGING and `envRequires` as YAGNI, surfaced 4 knowledge-base patterns that shaped 3 design decisions. Zero false positives. The extractor calls it "the single most valuable stage this run." |
| Critic-1 (4) | **HIGH -- co-MVP** | 10 findings (1C/5M/4Mi). Found the CRITICAL overlap guard category mismatch -- the deepest logical flaw in the plan. Also surfaced the missing test coverage gap (leading to 6 new test cases) and the shell injection vulnerability. |
| Critic-2 (6) | **HIGH** | 10 findings (1C/4M/5Mi), zero overlap with Critic-1. Found the CRITICAL `config.projectRoot` type error that both Drafter and Corrector-1 falsely claimed to have verified. Also caught multi-module path resolution, sub-task impl report gap, and wrong import paths. |
| Corrector-2 (7) | **HIGH** | Applied 10/10 findings (100%). Made the architectural pivot to `plan-validator` agent -- the single largest quality improvement. Added `hasModules` guard, sub-task iteration, fixed imports. Expanded test cases from 21 to 26. Zero regressions. |
| Drafter (3) | **MEDIUM-HIGH** | Rewrote plan incorporating all Researcher findings, self-caught 4 issues (empty commit check, `runShell` syntax, missing try/catch, weak path guard). But introduced 2 defects: `config.projectRoot` type error (with false self-review) and logically flawed overlap guard. |
| Corrector-1 (5) | **MEDIUM** | Applied 10/10 Critic-1 findings (shell injection fix, salvage criteria, path traversal hardening, 5 new test cases). But perpetuated the `config.projectRoot` error with its own false self-review verification. 1 regression. |
| Reader (1) | **LOW** | Catalogued 9 claims, 13 implementation items, 11 test cases, 9 files touched. Did not evaluate whether any claim was wrong. Zero original findings. |

---

## Cross-Run Trends

Finding volume and severity distribution remain stable; Run 8 sits at the 8-run mean exactly. The "Corrector/Drafter introduces defects" pattern persists at 7/8 runs.

### Finding counts and severity profiles across all runs

| Run | Date | Document | CRITICAL | MAJOR | MINOR | Total | App rate | C1 regressions |
|-----|------|----------|----------|-------|-------|-------|----------|----------------|
| 1 -- Rate Limiter (fixture) | 2026-03-08 | Design doc (planted flaws) | 3 | 7 | 8 | 18 | 94% | 0 |
| 2 -- E2E Bug Fix Plan | 2026-03-08 | Real bug fix plan | 2 | 6 | 7 | 15 | 93% | 1 |
| 3 -- Phase 6 Plan | 2026-03-14 | Real implementation plan | 4 | 11 | 11 | 26 | 100% | ? |
| 4 -- Post-MVP Plan | 2026-03-15 | Real implementation plan | 4 | 9 | 6 | 19 | 100% | 2 |
| 5 -- Normalize Stage Plan | 2026-03-17 | Real implementation plan | 2 | 8 | 7 | 17 | 100% | 1 |
| 6 -- Pipeline Failure Fix Plan | 2026-03-21 | Real fix plan | 3 | 7 | 8 | 18 | 94% | 1 |
| 7 -- CI/CD Reference Guide | 2026-03-21 | Real reference doc | 3 | 8 | 9 | 20 | 100% | 2 |
| **8 -- Pipeline Bug Fix Plan** | **2026-03-22** | **Real implementation plan** | **2** | **9** | **9** | **20** | **100%** | **1** |

### What the numbers say

1. **Finding counts: 18 -> 15 -> 26 -> 19 -> 17 -> 18 -> 20 -> 20.** The 8-run range remains 15-26. Run 8's 20 matches Run 7 exactly and sits at the updated mean of 19.1. No upward or downward trend -- volume tracks document complexity.

2. **CRITICAL counts: 3 -> 2 -> 4 -> 4 -> 2 -> 3 -> 3 -> 2.** Run 8's 2 CRITICALs is the joint-lowest with Run 2 and Run 5. Updated mean: 2.9 CRITICALs per run. Both Run 8 CRITICALs were high-quality: one was a logical design flaw (overlap guard category mismatch), the other was a compilation blocker (`config.projectRoot`). The lower count reflects that the Researcher front-loaded 2 compilation blockers (ensureDirSync, max-5 scope) that in prior runs might have surfaced as critic-found CRITICALs.

3. **Application rate: 94% -> 93% -> 100% -> 100% -> 100% -> 94% -> 100% -> 100%.** Run 8 continues the 100% streak (3 consecutive). Updated mean: 97.6% across 8 runs.

4. **Severity distribution (% of total):**

| Severity | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 | Mean |
|----------|-----|-----|-----|-----|-----|-----|-----|-----|------|
| CRITICAL | 17% | 13% | 15% | 21% | 12% | 17% | 15% | 10% | 15% |
| MAJOR | 39% | 40% | 42% | 47% | 47% | 39% | 40% | 45% | 42% |
| MINOR | 44% | 47% | 42% | 32% | 41% | 44% | 45% | 45% | 43% |

Run 8's CRITICAL share (10%) dips below the prior band floor (12%). This is the first time CRITICAL % has gone below 12%. However, the absolute CRITICAL count (2) is within the 2-4 range seen before. The 10% is an artifact of high total findings (20) combined with only 2 CRITICALs. MAJOR and MINOR remain squarely within established bands.

5. **Corrector-1 regression series: 0 -> 1 -> ? -> 2 -> 1 -> 1 -> 2 -> 1.** Run 8 returns to 1 after Run 7's 2. No improvement trend. 8-run mean (excluding Run 3): 1.1 regressions per run.

### Recurring finding types

| Finding type | Runs present | Run 8 evidence |
|-------------|-------------|----------------|
| **Corrector/Drafter introduces new defects** | **7/8** (all except R1) | Drafter introduced `config.projectRoot` type error and flawed overlap guard. Corrector-1 perpetuated `config.projectRoot` with false self-review. Both the Drafter and Corrector-1 independently claimed to verify a config field that does not exist. |
| **False safety claims / incorrect verification** | **5/8** (R4, R5, R6, R7, R8) | Both Drafter (self-review item 1) and Corrector-1 (self-review item 1) claimed "verified `config.projectRoot` is available." It is not. This is the same false-verification pattern from R6 ("retry loop handles it") -- the claimed verification never happened. |
| **Silent config/integration gaps** | **6/8** (R2, R3, R5, R6, R7, R8) | `config.projectRoot` does not exist in `HiveMindConfig`. Multi-module path resolution not handled. Sub-task impl reports missed by overlap guard. Import paths wrong for orchestrator directory. |
| **Verification/test gaps** | **6/8** (R2, R4, R5, R6, R7, R8) | Zero test cases for salvage commit, overlap guard, or artifact preservation -- the riskiest new code. Critic-1 flagged this, leading to 6 new test cases. |
| **Wrong directory / path errors** | **4/8** (R3, R5, R6, R8) | Multi-module `sourceFiles` paths relative to module root, not project root. Wrong relative import paths (`../utils/file-io.js` vs `./utils/file-io.js`). |

### Is the pipeline finding fewer issues over time?

No. Run 8 found 20 findings (above the 19.1 mean), including 2 CRITICALs. The meaningful signal remains: **every run on a real document finds at least 2 CRITICALs** (8/8 runs), and those CRITICALs are always specific to that document. The "false self-review verification" pattern (5/8 runs) is intensifying -- it appeared in 3 of the last 5 runs and was especially pronounced in Run 8 where two stages independently made the same false claim.

---

## Stage Effectiveness Rankings

| Stage | Contribution | Trend | Evidence (8 runs) |
|-------|-------------|-------|-------------------|
| **Critic-2** | **HIGH** | **STABLE (peak)** | Run 8: 10 findings (1C/4M/5Mi), all new -- zero overlap with Critic-1. Found the `config.projectRoot` compilation blocker that both Drafter and Corrector-1 missed despite self-review. Across 8 runs: the only stage that has caught a compilation blocker in every run where one existed. Zero false positives. |
| **Researcher** | **HIGH** | **STABLE** | Run 8: caught both `ensureDirSync` and max-5 scope errors (compilation blockers), killed ENV-TAGGING and `envRequires` as YAGNI, surfaced 4 knowledge-base cross-references. The extractor rates it "the single most valuable stage this run." Across 8 runs: zero false positives, highest foundational value. |
| **Critic-1** | **HIGH** | **RECOVERING** | Run 8: 10 findings (1C/5M/4Mi) -- a solid result with 1 CRITICAL (overlap guard category mismatch). This confirms the Run 7 rebound from Run 6's 0-CRITICAL nadir. CRITICAL counts across runs: 2->1->1->2->1->0->2->1. Run 8's CRITICAL was a deep logical flaw requiring reasoning about runtime behavior, suggesting Critic-1 can find code-reasoning CRITICALs when the flaw is visible from document logic. |
| **Corrector-2** | **HIGH** | **IMPROVING** | Run 8: 10/10 applied (100%), zero regressions. Made the architectural pivot to `plan-validator` agent -- the single largest quality improvement in the document. Expanded tests from 21 to 26. Across 8 runs: perfect application rate, 0 regressions ever, increasing creative contribution (file-content hashing in R6, YAML split in R7, plan-validator in R8). |
| **Drafter** | **MEDIUM-HIGH** | **MIXED** | Run 8: self-caught 4 issues (empty commit, runShell syntax, missing try/catch, weak path guard) but introduced 2 defects (config.projectRoot, flawed overlap guard). Run 7 also had 2 regressions; Run 6 had 0. Regression series: unclear->unclear->unclear->unclear->unclear->0->2->2. Essential for volume but unreliable for accuracy. |
| **Corrector-1** | **MEDIUM** | **STABLE (mediocre)** | Run 8: applied 10/10 findings but introduced 1 regression (false self-review on config.projectRoot). Regression series: 0->1->?->2->1->1->2->1. Mean 1.1 per run. No improvement despite retrospective recommendations in Runs 6 and 7. The "false self-review verification" pattern is now confirmed: in 3 of the last 5 runs, Corrector-1 (or Drafter) claimed to verify something that does not exist. |
| **Justifier** | **LOW** | **N/A (absent Runs 5-8)** | Not present in Run 8. Four consecutive runs without Justifier, zero missed findings. Permanently deprecated. |
| **Reader** | **LOW** | **STABLE (consistently low)** | Run 8: catalogued 9 claims, 13 implementation items, 11 test cases. Did not flag that `ensureDirSync` does not exist, did not evaluate whether max-5 scope claim was correct. 8/8 runs: zero evaluative contribution. The extractor notes it "did not evaluate whether any claims were wrong -- it faithfully transcribed." |

---

## What's Working

Pipeline behaviors that consistently produce value, with evidence from multiple runs.

**1. Two critique rounds find fundamentally different bug classes (8/8 runs)**
Run 8 is a textbook example: Critic-1 found the overlap guard category mismatch (a logical design flaw), Critic-2 found the `config.projectRoot` type error (a compilation blocker requiring codebase verification). Zero overlap in findings. Across 8 runs, the two critics have never found the same issue. This remains the pipeline's defining strength.

**2. Researcher front-loading prevents compilation blockers from reaching critics (8/8 runs)**
In Run 8, the Researcher caught `ensureDirSync` (does not exist) and the max-5 universal scope -- both would have been CRITICAL-grade findings if they reached the critics. By resolving them early, the Researcher freed Critic-1 and Critic-2 to focus on deeper design flaws (overlap guard, config type errors) rather than surface-level fact-checking. This may explain why Run 8's CRITICAL count (2) is lower than average (2.9) -- the Researcher front-loaded issues that in prior runs surfaced as critic CRITICALs.

**3. Corrector-2 is producing increasingly creative architectural solutions (Runs 5-8)**
Run 8: `plan-validator` agent replacing rule-merge compromise. Run 7: YAML block split and `branches-ignore` promotion. Run 6: file-content hashing replacing `git diff`. Run 5: 3 self-catches. In 4 consecutive runs, Corrector-2 has done more than mechanically apply fixes -- it has redesigned approaches when critic analysis revealed fundamental problems. Zero regressions across all 8 runs.

**4. Severity calibration remains stable across 8 runs**
CRITICAL: 10-21% (mean 15%). MAJOR: 39-47% (mean 42%). MINOR: 32-47% (mean 43%). Run 8's CRITICAL share (10%) is a minor dip below the prior floor (12%) but not an outlier -- it reflects strong Researcher front-loading rather than severity miscalibration. MAJOR and MINOR bands are unchanged.

**5. Application rate at 100% for 3 consecutive runs**
Runs 6 through 8: 100%, 100%, 100%. Updated 8-run mean: 97.6%. The pipeline produces findings that are overwhelmingly accepted as valid corrections. No noise.

---

## What's Not Working

Pipeline behaviors that consistently underperform or add no value.

**1. False self-review verification is the pipeline's most dangerous failure mode (5/8 runs)**
Run 8 is the worst example yet: both the Drafter (self-review item 1) and Corrector-1 (self-review item 1) independently claimed to verify that `config.projectRoot` exists in `HiveMindConfig`. It does not. This is not a miss -- it is a false positive claim of verification. The same pattern appeared in Run 6 ("retry loop handles it") and Run 7 (Corrector-1 dismissed a valid self-review finding). When an agent claims to have verified something it has not, downstream stages treat the claim as authoritative. This is worse than not checking at all, because it creates false confidence.

**2. Corrector-1 defect introduction rate is unchanged (7/8 runs)**
Regression series: 0 -> 1 -> ? -> 2 -> 1 -> 1 -> 2 -> 1. Mean: 1.1 per run. The retrospective-2026-03-21.md recommended adding "verify against actual codebase" instructions. The retrospective-2026-03-21-r2.md recommended tracking regressions as a first-class metric. Neither has measurably reduced the rate. This is the pipeline's most persistent structural weakness.

**3. Drafter introduces defects at a consistent rate (Runs 6-8 pattern: 0 -> 2 -> 2)**
The hypothesis from Run 6 (stronger Researcher input reduces Drafter regressions) was tested across 3 runs: Run 6 had the strongest Researcher contribution and 0 Drafter regressions, but Runs 7 and 8 also had strong Researcher input and 2 Drafter regressions each. The hypothesis is not supported (n=3). The Drafter reliably introduces 1-2 new defects per run regardless of input quality.

**4. Reader remains zero-value for finding discovery (8/8 runs)**
Eight runs, zero original findings. Run 8's extractor explicitly states the Reader "did not evaluate whether any claims were wrong." The retrospective-2026-03-21-r2.md recommended trialing evaluative instructions for Run 8; this does not appear to have been implemented. The Reader continues to produce structured inventory that the Researcher could build itself. Eight runs of evidence is more than sufficient for a decision.

---

## So What?

- **Run 8 confirms the pipeline catches real bugs: 2 CRITICALs (overlap guard category mismatch, config.projectRoot compilation blocker), 9 MAJORs, and the plan went from 11 test cases to 26.** Across 8 runs, the pipeline averages 2.9 CRITICALs per run with 97.6% application rate. Every run on a real document has found at least 2 CRITICALs.

- **False self-review verification is now the top-priority failure mode.** In Run 8, two stages independently claimed to verify a nonexistent config field. This is worse than missing an issue -- it creates false confidence that propagates downstream. 5 of the last 8 runs have this pattern. Fix: replace self-review "I verified X" claims with tool-assisted verification (e.g., require the Corrector to output the actual line of code it found, not just assert it exists).

- **Corrector-2's architectural creativity is a growing asset.** Three consecutive runs with non-trivial design improvements (file hashing, YAML split, plan-validator agent). This stage is not just fixing bugs -- it is improving the overall design quality of the final document.

- **The Reader stage decision is overdue.** Eight runs of zero evaluative contribution. The retrospective recommended trialing evaluative instructions or dropping the stage. That trial should happen in Run 9 or the Reader should be permanently removed.

- **Corrector-1 regression rate (mean 1.1/run) has not responded to two retrospective recommendations.** Prompt-level instructions are not sufficient. Consider structural changes: either give Corrector-1 explicit tool access for codebase verification, or add a lightweight pre-Critic-2 validation step that checks function signatures and import paths programmatically.
