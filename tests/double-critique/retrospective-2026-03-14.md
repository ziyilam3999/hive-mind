# Double-Critique Pipeline Retrospective

**Date:** 2026-03-14
**Runs analyzed:** 3 (Run 1: fixture, Run 2: e2e-bugfix, Run 3: phase-6-plan)
**Facilitator:** Automated retrospective from effectiveness report

---

## ELI5 Summary

The double-critique pipeline is finding real bugs that would have shipped without it, and it is getting better at applying fixes (now 100%). The second critique round is not redundant -- it consistently finds the deepest bugs that the first round misses. The Justifier stage has never found anything the Researcher did not already find, so it may be dead weight.

---

## KEEP

### K1 — Two independent critique rounds
**Plain language:** Critic-2 consistently finds bugs Critic-1 cannot see, especially cross-file interaction bugs.
**Evidence:** Across 3 runs, Critic-2 produced 29 findings including 5 CRITICALs that Critic-1 missed entirely. Run 3: Critic-2 found 3 CRITICALs (sourceFiles path resolution) that all prior stages missed. Run 2: Critic-2 caught a regression *introduced by* Critic-1's own fix.
**Action:** Continue running two isolated critique rounds. Do not merge them.

### K2 — Researcher as institutional memory
**Plain language:** The Researcher cross-references the knowledge base and catches known-pattern bugs with near-perfect recall.
**Evidence:** Run 1: caught all 4 planted flaws via KB. Run 3: caught the READ_ONLY_TOOLS repeat of Phase 4 Bug 17 (F43/P42) -- a guaranteed-failure bug. Consistently the highest-value early stage across all 3 runs.
**Action:** Keep the Researcher stage and continue expanding the knowledge base it references.

### K3 — Stable severity calibration
**Plain language:** The pipeline classifies bugs at a consistent severity ratio, not inflating over time.
**Evidence:** CRITICAL: 17% / 13% / 15%. MAJOR: 39% / 40% / 42%. MINOR: 44% / 47% / 42%. The distribution is remarkably stable across 3 runs with different document types.
**Action:** No calibration changes needed. Trust the current severity classification.

### K4 — 100% application rate (Run 3)
**Plain language:** Every finding the pipeline produced was actually applied to the document.
**Evidence:** Run 1: 94% (17/18). Run 2: 93% (14/15). Run 3: 100% (26/26). Improving trend, now at ceiling.
**Action:** Monitor for regression but no process change needed.

---

## CHANGE

### C1 — Justifier stage needs restructuring
**Plain language:** The Justifier has never surfaced a novel finding. It reorganizes Researcher output but discovers nothing new. Its token cost may not justify its organizational value.
**Evidence:** Run 1: findings overlap with Researcher. Run 2: 4 unjustified items flagged (all derived from Researcher). Run 3: 13 items organized, zero novel issues. Across 3 runs, 0 unique discoveries.
**Action:** Option A: Merge Justifier into Researcher prompt (add "flag unjustified claims" to Researcher instructions). Option B: Make Justifier conditional -- skip for documents under 150 lines, run for complex plans. Evaluate in next run.

### C2 — Early stages cannot find cross-file interaction bugs
**Plain language:** The Researcher/Justifier/Drafter missed all 3 of Run 3's highest-impact CRITICALs because they require understanding how multiple source files interact at runtime.
**Evidence:** Run 3: sourceFiles path resolution across `runBuild`, `filterNonOverlapping`, `computeModifiedFiles` -- 3 CRITICALs -- were invisible to pattern-matching against the KB. Only cold-read critics caught them.
**Action:** Experiment with adding source-code context (relevant function signatures or call graphs) to the Researcher's input for implementation plans that reference specific source files. Test in next run.

---

## ADD

### A1 — Regression check between correction rounds
**Plain language:** The pipeline has no systematic way to verify that Corrector-1's fixes did not introduce new problems. It relies on Critic-2 happening to notice.
**Evidence:** Run 2: Critic-2 caught a CRITICAL that was a side effect of Critic-1's fix (return-type change breaking callers). This happened once out of 3 runs. A targeted diff-based check between Corrector-1 input and output could make this systematic.
**Action:** Add a lightweight regression-check step between Corrector-1 and Critic-2: diff the before/after, flag any new assertions, changed signatures, or removed safeguards. Evaluate whether this catches issues Critic-2 would miss.

### A2 — Document complexity scoring to calibrate expectations
**Plain language:** Run 3 produced 26 findings vs 18 and 15 in earlier runs, but the document was also more complex (multi-repo CWD threading). Without a complexity score, it is hard to know if more findings means "pipeline is scaling" vs "document is worse."
**Evidence:** Run 1: test fixture, ~65 lines, 18 findings. Run 2: real bug fix, 252 lines, 15 findings. Run 3: real implementation plan, ~180 lines, 26 findings. Finding-per-line ratios differ significantly.
**Action:** Add a brief complexity annotation at the top of each effectiveness report: document lines, number of files referenced, number of cross-file interactions. This enables normalized comparison.

---

## DROP

### D1 — Reader stage as a separate stage (tentative)
**Plain language:** The Reader catalogs the document but produces zero evaluative signal. Downstream stages cite its index but also miss issues the Reader faithfully recorded.
**Evidence:** 3 runs, zero findings from Reader in any run. In Run 3, the Reader recorded `exports`/`imports` fields but no downstream stage flagged them as dead schema until Critic-1.
**Action:** Do not drop yet -- the Reader's structural index may have indirect value that is hard to measure. Instead, track: in next run, run the pipeline once with Reader and once without. Compare Critic-1/Critic-2 finding counts. If no difference, merge Reader's indexing into the Critic-1 prompt.

---

## NEW PATTERNS

### NP1 — Critic-2 finds deeper bug classes than Critic-1 (structural, not just coverage)
**What:** The two critique rounds find fundamentally different *categories* of bugs, not just "more of the same." Critic-1 finds specification gaps and missing validations. Critic-2 finds cross-file interaction bugs and correction-induced regressions.
**Evidence:** Run 1: Critic-1 = boundary conditions, Critic-2 = integer token starvation + Redis replication. Run 2: Critic-1 = missing verification, Critic-2 = return-type caller breakage. Run 3: Critic-1 = git state validation, Critic-2 = sourceFiles path resolution (3 CRITICALs).
**Stability:** 3/3 runs. Meets KB criteria for evidence.
**KB candidate:** Yes -- see KB assessment below.

### NP2 — Finding counts scale with document complexity, not pipeline degradation
**What:** More findings on harder documents is a feature, not a regression. The pipeline adapts its output depth to document difficulty.
**Evidence:** Test fixture (65 lines): 18 findings. Real bug fix (252 lines): 15 findings. Multi-repo plan (180 lines, high interaction surface): 26 findings. Severity profile stays constant.
**Stability:** 3/3 runs. Pattern is consistent.

---

## NEW ANTI-PATTERNS

### NAP1 — Justifier without novel discovery = token waste
**What:** A pipeline stage that reorganizes upstream findings without surfacing novel issues adds organizational value but zero discovery value. At scale, its token cost (1 full stage prompt + completion) may exceed its benefit.
**Evidence:** 3/3 runs: zero unique Justifier findings. All Justifier output was restatement or deepening of Researcher output.
**Stability:** 3/3 runs. Consistent.
**KB candidate:** Not yet -- need to test the merged prompt (C1) before declaring the standalone Justifier an anti-pattern. If the merged prompt preserves organizational quality, then standalone Justifier becomes a confirmed anti-pattern.

---

## Knowledge Base Assessment

### Meets KB criteria (3+ runs, measured numbers, generalizable):

**Candidate: Dual-critique rounds find categorically different bug classes**
- Stability: 3/3 runs, different document types, different CRITICALs each time
- Evidence: 29 Critic-2 findings, 5 CRITICALs, zero overlap with Critic-1 CRITICALs
- Generalizability: Applies to any dual-review process on technical documents

**Decision:** This strengthens existing P5 (Dual-Critique Pipeline) rather than warranting a new pattern. The existing P5 entry already covers the dual-critique principle. The new evidence (Run 3's 3 CRITICALs from Critic-2, cross-run trend data, severity distribution stability) should be folded into P5's evidence section during the next knowledge base maintenance cycle.

**No new KB entries warranted at this time.** The findings reinforce P5 and P42 but do not constitute new patterns. The Justifier weakness (NAP1) needs one more data point (the merged-prompt experiment) before it can be added to the anti-patterns KB. Conservative approach: update P5's evidence in the next KB maintenance pass rather than creating a marginal new entry now.

---

## Next Run Priorities

1. **Merge Justifier into Researcher prompt** (C1) -- Combine "cross-reference KB" and "flag unjustified claims" into a single stage. Compare finding counts to Run 3 to validate no discovery loss. This is the highest-leverage change: removes 1 stage, saves tokens, with minimal risk.

2. **Add source-code context to Researcher for implementation plans** (C2) -- When the document references specific source files, include function signatures or a call graph snippet in the Researcher's input. Test whether this closes the cross-file interaction gap that only Critic-2 currently catches.

3. **Add complexity annotation to effectiveness reports** (A2) -- Simple metadata (lines, files referenced, cross-file interactions) at the top of each report. Enables normalized cross-run comparison. Low effort, high diagnostic value.
