# Double-Critique Pipeline -- Retrospective Report

**Date:** 2026-03-22 (updated after Run 9)
**Runs covered:** 9 (Run 1 through Run 9, 2026-03-08 to 2026-03-22)
**Based on:** effectiveness-2026-03-22.md (Run 9 -- PRD workflow recommendation)
**Prior retrospective:** retrospective-2026-03-21-r2.md (covered Runs 1-7), this file's prior version (covered Runs 1-8)

---

## Summary

What is this report? This is a team retrospective -- like a post-game huddle where we decide what to keep doing, what to change, and what to stop doing. It covers 9 pipeline runs across 5 document types (design docs, fix plans, implementation plans, reference guides, recommendation reports) and distills them into actionable next steps. Run 9 validated the evidence-gating protocol (0 false Drafter verification claims), surfaced a new risk category (critic-originated false positive), and confirmed that Reader, Corrector-1 regression rate, and Drafter regression rate remain structurally unchanged despite repeated retrospective recommendations.

---

## KEEP -- What's Working Well

- **Two-round critique architecture** -- Two independent critics find fundamentally different bug classes, with zero finding overlap across 9 runs. -- Evidence: 9/9 runs complementary. Run 9: Critic-1 found VALIDATE value-proposition contradiction (logical consistency); Critic-2 found NORMALIZE schema mismatch (architectural). Mean 2.9 genuine CRITICALs/run. Every run on a real document finds at least 2 genuine CRITICALs. -- Action: Keep unchanged. Do not merge critics into a single pass.

- **Researcher front-loading** -- Reads KB, cross-references codebase, surfaces factual problems before critics see the document. Zero false positives in 9 runs. -- Evidence: 9/9 runs, 4-15 pre-critic findings/run. Run 9: 10+ findings including debunked cost data ($10-40 vs actual ~$0.10), path bugs, 6 omitted PRD examples, 6 missing failure mode specs. Called "the most valuable single stage" in Run 9. Perfect accuracy record (only stage with zero false positives ever). -- Action: Keep as-is.

- **Corrector-2 as pipeline safety net** -- Final corrector applies findings with zero regressions across all 9 runs, exercising increasingly sophisticated editorial judgment. -- Evidence: 0 regressions in 9 runs. Run 9: correctly rejected Critic-2's dangerous false positive (fabricated KB citations claim) after independent verification. Judgment progression: self-catches (R5), file-content hashing (R6), YAML split (R7), plan-validator pivot (R8), false-positive rejection + three-option Gap 2 table (R9). Most reliable stage in the pipeline. -- Action: Keep as final stage.

- **Severity calibration stability** -- CRITICAL/MAJOR/MINOR distribution remains consistent across 9 runs and 5 document types. -- Evidence: CRITICAL 10-21% (mean 15%), MAJOR 39-47% (mean 42%), MINOR 32-47% (mean 43%). Run 9: 17/39/44, matching Runs 1 and 6 exactly. -- Action: No change needed.

- **Evidence-gating protocol (first run, promising)** -- The VERIFIED:<evidence> format eliminated fabricated Drafter verification claims in its first outing. -- Evidence: Run 9: 13/13 Drafter verification claims accurate with file paths and line numbers. Run 8 (pre-protocol): both Drafter and Corrector-1 fabricated `config.projectRoot` verification. 0 false claims vs 2+ in prior run. -- Action: Keep protocol. Extend enforcement to Corrector-1 (see CHANGE).

- **Application rate** -- Pipeline produces findings that are overwhelmingly accepted as valid corrections. -- Evidence: 9-run mean: 96.6%. Run 9 dipped to 88% (lowest in series), but both rejections were well-reasoned by Corrector-2 with documented rationale, and 1 Critic-2 finding was a false positive excluded from the actionable count. -- Action: Continue as-is.

---

## CHANGE -- What Should Be Modified

- **Corrector-1 must re-verify inherited claims** -- Corrector-1 inherits Drafter verification claims without checking them, creating a protocol gap at 82% compliance. -- Evidence: Run 9: 4 claims inherited at 0% re-verification. Corrector-1 explicitly stated "I did not re-verify these as they were not modified in this correction pass." This is the exact mechanism that caused false verification in Runs 6-8 (`config.projectRoot`). The evidence-gating format (Tier 2) works, but the independence requirement (Tier 4) does not -- 86pp gap per P13. -- Action: Add to Corrector-1 prompt: "Every factual claim you carry forward must have a VERIFIED: tag with your own evidence. Inherited Drafter tags are not valid for your output. If you cannot verify, mark UNVERIFIED: inherited."

- **Drafter regression rate needs structural intervention, not more prompts** -- Three consecutive runs (7-9) with exactly 2 regressions each. Prompt changes have not helped. -- Evidence: Drafter regression series (R6-R9): 0, 2, 2, 2. Run 9: wrong constitution path (guessed `constitution/` instead of `constitution.md`) and unresolved VALIDATE contradiction. Run 6's zero was the outlier. -- Action: Add a mechanical self-check: before outputting, the Drafter must run `ls` or `cat` on any new file paths it introduces (converts path verification from Tier 4 to Tier 2). For logical contradictions, add an explicit output section: "## Contradictions Check."

- **Critic-2 needs a citation verification requirement** -- Produced its first-ever false positive in Run 9, claiming KB citations were fabricated when they demonstrably exist. -- Evidence: Run 9 Finding 1: claimed P30, P28, F2, F9 were fabricated and KB files were empty. All four entries exist. If Corrector-2 had accepted, the document would have lost all supporting evidence. First critic-originated false positive in 9 runs. -- Action: Add to Critic-2 prompt: "Before claiming a citation is fabricated, you MUST read the cited file and confirm the entry does not exist. Cite file path and line number as evidence of absence."

- **Corrector-1 regression rate is structurally unchanged** -- Mean 1.1 regressions/run across 9 runs. Three retrospective recommendations have not measurably reduced this rate. This is F2 in action. -- Evidence: Series: 0, 1, ?, 2, 1, 1, 2, 1, 1. No improvement trend across 9 runs. -- Action: Stop recommending prompt changes. Consider structural changes: (1) give Corrector-1 codebase read access for path/type verification, or (2) add a lightweight diff-checker between Corrector-1 input/output that flags new terms introduced without evidence. If neither is feasible, accept 1.1/run as a structural pipeline cost.

---

## ADD -- New Pipeline Stages or Modifications to Try

- **Evidence-gating enforcement at Corrector-1 level** -- Extend the VERIFIED:<evidence> protocol to Corrector-1. The protocol worked at Drafter level (0 false claims) but was not enforced at Corrector-1 (82% compliance). -- Action: In Corrector-1 prompt, require: "Every factual claim you carry forward must have a VERIFIED: tag with your own evidence." Track compliance rate in Run 10 effectiveness report.

- **Monitor Critic false-positive rate as a tracked metric** -- Run 9 introduced a new risk category: critic-originated false positives. -- Action: Add a "Critic false positives" row to the regression tracking table. Track count per run starting Run 10.

---

## DROP -- Not Pulling Its Weight

- **Reader stage (9/9 runs, zero evaluative findings)** -- The Reader produces a structured document inventory but has never generated an original evaluative finding. The Researcher builds a more thorough inventory on its own. Two prior retrospective recommendations (evaluative instructions trial, consider dropping) were never acted on. Nine runs is conclusive. -- Evidence: 9 consecutive runs, 0 evaluative contributions. -- Action: Drop from Run 10 entirely. If downstream stages report degradation (unlikely), re-add. Estimated savings: one full agent spawn per run.

- **Justifier stage (confirmed drop, 5 consecutive runs absent)** -- Absent for Runs 5-9 with zero missed findings. Every Justifier finding when present was a restatement of Researcher findings. -- Action: Confirm permanent removal. Remove from documentation if still referenced.

---

## NEW PATTERNS -- Candidate Patterns Discovered

### Last reviewer catches the most important judgment call

- **Plain-language name:** The final pair of eyes has no emotional investment
- **What:** Corrector-2, as the final stage, is uniquely positioned to catch false positives from upstream critics because it reads the entire pipeline output cold and can independently verify claims without sunk-cost bias.
- **Why:** By the time Corrector-2 runs, all other stages have committed to their positions. Corrector-2 has no authorship stake in any prior finding -- it can objectively evaluate whether a critic's claim is valid.
- **Evidence:** Run 9: Critic-2 falsely claimed all KB citations (P30, P28, F2, F9) were fabricated. Corrector-2 independently verified the citations existed and correctly rejected the finding. Without this rejection, the document would have lost all supporting evidence.
- **Analogy:** Like a final quality inspector on an assembly line who catches a previous inspector's mis-tag -- the last set of eyes has no emotional investment in any prior station's work.

### Evidence-gating prevents fabrication but not inheritance

- **Plain-language name:** Receipts stop lying but not copying
- **What:** Requiring `VERIFIED: <file:line>` format eliminated fabricated verification claims from the Drafter (0 false claims) but did not prevent Corrector-1 from carrying forward those claims without re-checking.
- **Why:** The format requirement is Tier 2 enforcement (mechanical -- either the tag exists or not). The independence requirement (re-verify, do not inherit) is Tier 4 (behavioral prose). These two enforcement tiers have an 86pp compliance gap (P13).
- **Evidence:** Run 9: Drafter 13/13 accurate (Tier 2 format enforcement). Corrector-1: 4 claims inherited at 0% re-verification (Tier 4 behavioral expectation). Overall compliance: 82%.
- **Analogy:** Like requiring receipts for expense reports -- the receipt format is easy to enforce, but checking whether someone actually bought what the receipt says requires a second verification step that nobody does unless forced.

### Critics can produce false positives too

- **Plain-language name:** The reviewer who did not read the source
- **What:** For the first time in 9 runs, a critic (not a Drafter or Corrector) generated a false positive -- falsely claiming knowledge-base citations were fabricated.
- **Why:** Critics may infer file contents rather than reading them, leading to confident but wrong conclusions about whether referenced entries exist.
- **Evidence:** Run 9 Critic-2 Finding 1: claimed P30, P28, F2, F9 were fabricated. All four demonstrably exist at cited locations. Prior false positives (Runs 4-8) were exclusively from Drafter/Corrector stages.
- **Analogy:** Like a code reviewer commenting "this function doesn't exist" without actually searching the codebase -- the reviewer assumed rather than checked.

---

## NEW ANTI-PATTERNS -- Candidate Anti-Patterns Discovered

### Inherited verification without re-checking

- **Plain-language name:** Trusting the previous shift's checklist
- **What:** A downstream stage carries forward verification claims from an upstream stage without independently re-verifying them, treating them as pre-validated.
- **Why:** Corrector-1 optimizes for applying critic findings and treats unmodified Drafter claims as "not my responsibility." The evidence-gating protocol required evidence for new claims but did not explicitly require re-verification of inherited ones.
- **Evidence:** Run 9: Corrector-1 stated "I did not re-verify these as they were not modified in this correction pass." 4 inherited claims, 0% re-verification. In Runs 6-8, the same mechanism caused propagation of false claims (`config.projectRoot`).
- **Analogy:** Like a relay race where the second runner assumes the baton is the right one because the first runner handed it over confidently -- nobody re-checks the baton at the handoff.

### Critic asserting absence without reading the source

- **Plain-language name:** Claiming something does not exist without looking
- **What:** A critic claims citations are fabricated without reading the cited files to confirm the entries do not exist.
- **Why:** Critics receive document text but may not access (or choose to read) referenced files. They infer file contents from context clues rather than verifying directly.
- **Evidence:** Run 9 Critic-2 Finding 1: "all KB citations are fabricated." P30, P28, F2, F9 all exist at cited locations. First critic-originated false positive in 9 runs.
- **Analogy:** Like a fact-checker marking a quote as "made up" without calling the person who supposedly said it -- asserting absence requires the same evidence standard as asserting presence.

---

## Knowledge Base Graduation Assessment

Five candidate findings assessed against the three criteria (stability: 3+ runs, evidence: measured numbers, generalizability: applies beyond double-critique):

1. **False self-review verification / evidence-gating gap (5/8 runs pre-protocol, then Run 9 shows Corrector-1 inheritance gap)** -- Stability: YES (6 runs). Evidence: YES (measured rates). Generalizability: YES. However, this reinforces existing F9 (self-scoring bias) and P11 (external artifacts over internal checklists). The evidence-gating protocol is an application of P11, not a new pattern. **Decision: Do not graduate as new entry. Reinforces F9 + P11.**

2. **Corrector-1 regression rate unresponsive to prompt changes (9 runs, mean 1.1)** -- Stability: YES. Evidence: YES. Generalizability: YES (instance of F2). Reinforces existing F2. **Decision: Do not graduate. Reinforces F2.**

3. **Reader stage zero-value (9/9 runs)** -- Stability: YES. Evidence: YES. Generalizability: PARTIAL (not tested on long docs). **Decision: Do not graduate. Operational decision, not a design principle.**

4. **Researcher front-loading shifts CRITICAL distribution (Run 8 clear, suggestive in Runs 2, 5, 9)** -- Stability: PARTIAL (4 suggestive data points, but Run 9 returned to 3 CRITICALs despite strong Researcher, weakening the pattern). Evidence: YES. **Decision: Hold. Run 9 provides counter-evidence -- CRITICAL count returned to 3 despite strong Researcher. The effect may be real but inconsistent.**

5. **Corrector-2 zero-regression record (9/9 runs, increasingly complex judgment calls)** -- Stability: YES (9 runs). Evidence: YES (0 regressions, specific judgment examples per run). Generalizability: YES -- applies to any multi-stage pipeline where the final corrector operates on the most complete context. However, this may be a property of the stage's position (final, most context) rather than a generalizable design principle. **Decision: Hold for 1-2 more runs. If it holds at 12+ runs, consider graduating as "Final-stage correctors outperform mid-pipeline correctors" with position-based explanation.**

**KB graduation result: No new entries this run.** All findings either reinforce existing patterns (F2, F9, P11) or need more data. This is the third consecutive run with no graduations -- the KB has stabilized at its current scope.

---

## Next Run Priorities

1. **Drop the Reader stage.** Remove it from the pipeline configuration for Run 10. Nine runs of zero evaluative findings is conclusive. Monitor whether any downstream stage reports missing context (unlikely given Researcher's independent inventory).

2. **Extend evidence-gating to Corrector-1.** Add to Corrector-1 prompt: "Every factual claim you carry forward must have a VERIFIED: tag with your own evidence. Inherited Drafter tags are not valid for your output. If you cannot verify, mark UNVERIFIED: inherited." Track compliance rate in Run 10 effectiveness report.

3. **Add citation verification requirement to Critic-2.** Add to Critic-2 prompt: "Before claiming a citation or reference is fabricated, you MUST read the cited file and report the specific line number where the entry should exist but does not. Claims of fabrication without file-read evidence are unsubstantiated." This addresses the new false-positive risk from Run 9.
