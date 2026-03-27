# Double-Critique Pipeline -- Retrospective (Run 12)

**Date:** 2026-03-27
**Document:** Automated UI Design Stage PRD v1.0 -> v1.3

---

What is this report? This is a team retrospective -- like a post-game huddle where we decide what to keep doing, what to change, and what to stop doing. It covers Run 12 of the double-critique pipeline (2026-03-27) applied to the Automated UI Design Stage PRD, and distills findings into actionable next steps.

---

## KEEP

**Two-round critic architecture** -- Two independent cold reviewers find fundamentally different bug classes with zero overlap. -- Evidence: 12/12 runs, Run 12 Critic-1 found design-logic flaws (undefined behavior, contradictions), Critic-2 found cross-requirement feasibility conflicts. -- Action: Non-negotiable. Never reduce to single critic.

**Researcher front-loading** -- Fact-checking and justification analysis before drafting prevents downstream waste. -- Evidence: 12/12 runs, zero false positives ever. Run 12: pre-answered 5+ findings, caught inflated checkpoint stat. -- Action: Keep as Stage 1.

**Evidence-gating protocol** -- VERIFIED/UNVERIFIED format eliminates fabricated verification claims. -- Evidence: 3 consecutive runs (R10-R12) with zero false claims. Pre-protocol runs had fabrication in every run. -- Action: Keep and enforce at 100%.

**Corrector-2 reliability** -- Final corrector has never introduced a defect in any run. -- Evidence: 12/12 runs, 0 regressions. Run 12: 8/8 applied cleanly. -- Action: Keep unchanged.

**6-stage configuration** -- Current pipeline (Researcher, Drafter, Critic-1, Corrector-1, Critic-2, Corrector-2) is the optimal configuration. -- Evidence: No redundant stages in Run 12. Reader and Justifier correctly dropped. -- Action: Keep.

**100% application rate streak** -- 5 consecutive runs at 100% means findings are actionable, not noise. -- Evidence: R8-R12 all at 100%. Updated 12-run mean: 97.4%. -- Action: Keep monitoring.

---

## CHANGE

**Drafter needs "consistency pass" instruction** -- 3 regressions in Run 12 (worst count tracked), all internal contradictions detectable by re-reading own output. The Drafter wrote keyword removal rationale and contradictory keyword examples in the same section. -- Evidence: Regression series R6-R12: 0->2->2->2->0->0->3. Prompt changes alone don't work (5 retrospective cycles). -- Action: Add explicit instruction to `references/stage-prompts-core.md` Stage 2: "After drafting, re-read every section where you made changes. For each change, check: does any other section in the document contradict this change? If yes, fix the contradiction before proceeding."

**Enforce 100% evidence-gating as hard requirement** -- 4/4 measured data points: sub-100% correlates with regressions, 100% correlates with zero. Run 12 at 95% had 4 regressions. -- Evidence: R9 (82%) -> 3 reg. R10 (100%) -> 0. R11R (100%) -> 0. R12 (95%) -> 4. -- Action: Change Drafter and Corrector-1 prompts from "you MUST use the format" to "If ANY verification claim lacks evidence, STOP and re-verify before proceeding. 100% compliance is required."

**Config/integration gap checklist** -- Same finding type in 10/12 runs (dashboard integration, path portability, failure count persistence). Pipeline catches them but documents keep producing them. -- Evidence: Run 12: 3 config/integration findings. 10/12 runs historically. -- Action: Add to Researcher prompt: "Explicitly check for: cross-stage data contracts, path portability, state persistence across restarts, dashboard/UI integration points."

---

## ADD

**Drafter "re-read for internal consistency" self-check** -- New post-drafting step that specifically targets the contradiction failure mode (Run 12's worst regression type). -- Evidence: All 3 Drafter regressions in Run 12 were internal contradictions. -- Action: Add as step in Stage 2 prompt after the existing self-review checklist.

---

## DROP

Nothing new to drop. Reader (dropped R9) and Justifier (dropped R5) remain dropped with no degradation.

---

## NEW PATTERNS

**NP-2: Novelty-flag compliance is the fastest-improving metric**
- **What:** Drafter novelty-flag tagging went from 0% (R11R) to ~90% (R12) in a single run after adding the `NEW_CLAIM:` format instruction.
- **Why:** Explicit format requirements convert Tier 4 behavioral prose into Tier 2 artifact enforcement. Same mechanism that made evidence-gating work.
- **Evidence:** R11R: 0% (no tags). R12: 14 tags on ~15-16 novel claims = ~90%.
- **Analogy:** Like requiring a "source:" citation on every Wikipedia edit -- it doesn't prevent bad edits but makes them visible for review.

**NP-3: Second-pass critique yields fewer findings but maintains MAJOR detection**
- **What:** Running double-critique on a second iteration of the same document produces fewer total findings (21 -> 17) but the MAJOR detection rate holds (38% -> 41%).
- **Why:** Big problems were caught in the first pass. Residual issues skew MINOR. But cross-requirement contradictions and feasibility conflicts still emerge because they depend on the specific changes made, not the document's baseline quality.
- **Evidence:** R11R (first pass): 21 findings, 38% MAJOR. R12 (second pass): 17 findings, 41% MAJOR.
- **Analogy:** Like proofreading a paper twice -- the second pass catches fewer typos but still finds structural arguments that only become visible after the first round of fixes.

---

## NEW ANTI-PATTERNS

**NAP-1: Drafter regressions cluster around content contradictions, not evidence errors**
- **What:** Evidence-gating prevents fabricated verification but cannot prevent the Drafter from writing contradictory content across sections.
- **Why:** Evidence-gating checks "did this thing exist?" -- it doesn't check "does this thing I wrote agree with that other thing I wrote 50 lines up?"
- **Evidence:** R12: 3 regressions at 95% evidence-gating. All 3 were section-to-section contradictions, none were evidence fabrication.
- **Analogy:** Like a fact-checker who verifies every quote is real but doesn't notice the article contradicts itself between paragraphs.

**NAP-2: Zero-regression streaks are correlation, not causation**
- **What:** The R10-R11R zero-regression streak (both 100% evidence-gating) broke at R12, proving the streak was not a permanent state change.
- **Why:** Multiple factors contribute to regressions beyond evidence-gating: document complexity, number of changes, Drafter attention to consistency.
- **Evidence:** R10: 0 reg (100% EG). R11R: 0 reg (100% EG). R12: 4 reg (95% EG). Two-run streaks don't establish baselines.
- **Analogy:** Like saying "I haven't gotten a flat tire in 2 months, so I'm immune" -- then getting one.

---

## Next Run Priorities

1. **Add Drafter consistency-pass instruction** to `references/stage-prompts-core.md` Stage 2. After drafting and before self-review, add: "Re-read every section where you made changes. For each change, verify no other section contradicts it." This directly targets the 3 Drafter regressions from Run 12.

2. **Enforce 100% evidence-gating as hard requirement** in Drafter and Corrector-1 prompts. Change from "you MUST use the format" to "100% compliance is required. If any claim lacks evidence, STOP and re-verify." 4/4 data points confirm the correlation.

3. **Monitor novelty-flag compliance** -- confirm it sustains above 80% in Run 13. If it drops, the instruction needs reinforcement (same trajectory as evidence-gating: R9 introduced -> R10 hit 100%).
