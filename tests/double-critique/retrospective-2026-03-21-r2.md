# Double-Critique Pipeline -- Retrospective Report (R2)

**Date:** 2026-03-21
**Runs covered:** 7 (Run 1 through Run 7, 2026-03-08 to 2026-03-21)
**Based on:** effectiveness-2026-03-21-r2.md
**Prior retrospective:** retrospective-2026-03-21.md (covered Runs 1-6)

---

## Summary

Run 7 validated the pipeline on a new document type (CI/CD reference guide) with no loss of effectiveness: 3 CRITICALs caught, 20 total findings, 100% application rate. The Corrector-1 defect-introduction anti-pattern is now confirmed at 6/7 runs and remains the pipeline's most persistent weakness. The Reader stage has produced zero original findings across all 7 runs and is overdue for reform or removal.

---

## KEEP -- What's Working Well

- **Two-round critique architecture** -- Critic-1 and Critic-2 continue to find completely non-overlapping bug classes, with Critic-1 catching framing/consistency issues and Critic-2 catching operational/integration issues -- Evidence: 7/7 runs with zero finding overlap; Run 7 Critic-1 found unsupported claims while Critic-2 found YAML copy-paste hazards and race conditions -- Action: Continue as-is, this is the pipeline's defining strength

- **Researcher front-loading** -- The Researcher catches factual errors and missing failure modes before the Drafter writes anything, preventing wasted downstream work and keeping critic attention on deep issues -- Evidence: 7/7 runs, zero false positives ever, 4-15 pre-critic findings per run; Run 7 verified 5 inaccuracies against CHANGELOG with line numbers and surfaced 10 missing failure modes -- Action: Continue as-is, no changes needed

- **Corrector-2 clean final output** -- Corrector-2 has a perfect application rate and zero regressions across all 7 runs, and increasingly produces creative structural fixes rather than mechanical patches -- Evidence: 7/7 runs at 100% application, 0 regressions; Run 7 split the YAML into two copy-pasteable blocks and promoted `branches-ignore` over label-based skipping -- Action: Continue as-is, this stage is peak performing

- **Severity calibration stability** -- CRITICAL/MAJOR/MINOR distribution stays in tight bands making severity meaningful for cross-run comparison -- Evidence: 7-run means of 16%/42%/42%; Run 7 at 15/40/45 is squarely within bands (CRITICAL 12-21%, MAJOR 39-47%, MINOR 32-47%) -- Action: Continue as-is; if any severity band deviates by more than 10 percentage points, investigate

- **97.3% application rate** -- Nearly all findings the pipeline produces are applied, proving critics find real problems not noise -- Evidence: 7-run mean 97.3% (range 93-100%); Run 7 returned to 100% after Run 6's 94% -- Action: Continue as-is

- **7-stage pipeline (no Justifier)** -- Three consecutive runs without Justifier, zero quality loss, confirmed token savings -- Evidence: Runs 5, 6, 7 all without Justifier; no finding type missing; Researcher absorbs justification-challenge naturally -- Action: Adopt 7-stage as permanent default

---

## CHANGE -- What Should Be Modified

- **Corrector-1 prompt needs codebase verification** -- Corrector-1 applies fixes mechanically without checking whether they work in the actual codebase, introducing new defects that Critic-2 must clean up -- Evidence: 6/7 runs with defects introduced; Run 7 introduced race-condition-prone label suggestion and dismissed a valid self-review finding; regression count across runs: 0->1->?->2->1->1->2 (no improvement) -- Action: Add explicit instruction to Corrector-1 prompt: "After applying each fix, verify function signatures, file paths, and behavior against the actual codebase. Do not adopt any suggested approach without independent verification."

- **Critic-1 prompt needs mitigation-claim audit** -- False safety claims ("In place," "no known failures," "retry loop handles it") propagate through 3-5 stages before being caught, wasting downstream work -- Evidence: 4/7 runs (Runs 4, 5, 6, 7); Run 7's security and CI health claims passed through Reader and Drafter before Critic-1 caught them; "self-improving loop" accepted by 3 stages before flagged -- Action: Add a "verify mitigation claims" checklist to Critic-1's prompt: "List every claim of the form 'X handles/prevents/mitigates Y' and verify each one against evidence in the document or codebase."

- **Drafter accuracy is inconsistent despite strong Researcher input** -- The hypothesis from Run 6 that stronger Researcher input reduces Drafter regressions was not confirmed in Run 7 -- Evidence: Run 6 Drafter had zero regressions (best ever), Run 7 Drafter introduced 2 errors (incorrect Node 18 LTS statement, unsourced cost figures) despite equally strong Researcher input in both runs -- Action: Add a self-check instruction to the Drafter prompt: "Before finalizing, verify any factual claims you introduce (version numbers, dates, cost figures) against primary sources. Flag any claim you cannot verify."

---

## ADD -- New Pipeline Stages or Modifications to Try

- **Copy-paste review criteria for code-containing documents** -- Documents with code examples need explicit "is this copy-pasteable?" review, since code block hazards are an emerging finding pattern -- Evidence: 2/7 runs (Runs 6 and 7) had code-level integration gaps; Run 7's CRITICAL was a YAML block mixing two files that a reader would copy verbatim and break their workflow -- Action: Add to Critic-2's prompt: "For every code block, verify: (1) is this a single copy-pasteable unit? (2) are file boundaries clearly marked? (3) would a reader copying this verbatim get a working result?"

- **Corrector-1 regression count as a tracked metric** -- The Corrector-1 defect rate is the pipeline's most persistent weakness but is only visible through narrative analysis, not a tracked number -- Evidence: Regression counts reconstructed from 7 runs: 0->1->?->2->1->1->2; this should be a first-class metric like application rate -- Action: Add `corrector1_regressions` as a field in the effectiveness report template alongside application rate

- **Reader reform trial: evaluative instructions** -- The Reader should either add value or be removed; 7 runs of zero-value output is conclusive -- Evidence: 7/7 runs with zero original findings; Run 7 cataloged every claim but flagged nothing; the effectiveness report calls it "a transcription, not an analysis" -- Action: Next run, add evaluative instructions to Reader: "Flag any claim that appears inconsistent, unverifiable, or contradicted by other sections. You are an evaluator, not a transcriber." If this produces zero findings, drop Reader entirely.

---

## DROP -- Not Pulling Its Weight

- **Justifier stage (confirmed drop)** -- Three consecutive runs validate that the Justifier adds nothing the Researcher does not already cover -- Evidence: Runs 5, 6, 7 without Justifier; zero missed finding types; Researcher naturally absorbs justification-challenge role -- Action: Permanently remove from pipeline configuration and documentation

- **Reader stage (candidate for drop if reform fails)** -- Seven runs of zero evaluative contribution is sufficient data to force a decision -- Evidence: 7/7 runs, zero original findings; faithfully catalogs information without evaluating it; the Researcher could build the same checklist itself -- Action: Trial evaluative instructions in Run 8. If still zero findings, permanently drop.

---

## NEW PATTERNS -- Candidate Patterns Discovered

### Copy-Paste Hazard Amplification in Reference Documents

- **What:** Documents intended as reference guides (copy-paste targets) have a higher severity ceiling for code-block formatting issues than design documents, because readers will execute the code verbatim.
- **Why:** A design doc reader interprets code examples as illustrative. A reference doc reader copies them directly into their workflow. The same formatting flaw (e.g., two files in one block) is MINOR in a design doc but CRITICAL in a reference guide.
- **Evidence:** Run 7's CRITICAL F1 was a YAML block mixing two files -- a copy-paste hazard that would break any reader's workflow. Run 6 had a similar integration gap in code examples. Neither would have been CRITICAL in a pure design document.
- **Analogy:** A typo on a restaurant menu is embarrassing; the same typo on a prescription label is dangerous. The severity depends on whether the reader will act on it literally.

### Critic-1 Rebound After Document-Type Shift

- **What:** Critic-1's zero-CRITICAL result in Run 6 was document-specific (all CRITICALs required code-level reasoning), not a permanent decline. When Run 7 presented a document whose CRITICALs were visible from document logic, Critic-1 rebounded to 2 CRITICALs.
- **Why:** Critic-1 operates on document logic. Its effectiveness depends on whether the document's most serious flaws are detectable without codebase access. This is a property of the input document, not the stage.
- **Evidence:** Run 6: 0 CRITICALs (all required code verification). Run 7: 2 CRITICALs (unsupported health claim and security contradiction, both visible from document logic alone).
- **Analogy:** A proofreader who only reads the manuscript will catch plot holes but not factual errors about real-world geography. Whether the manuscript has plot holes or geography errors determines the proofreader's hit rate.

### Corrector-1 Self-Review Dismissal

- **What:** Corrector-1 sometimes identifies a valid issue in its own self-review but then dismisses it with "no fix needed," allowing the defect to pass through to Critic-2.
- **Why:** Self-review creates a conflict of interest: the same agent that authored the fix is evaluating it. The incentive is to confirm rather than challenge.
- **Evidence:** Run 7: Corrector-1 flagged the YAML two-file issue in self-review but dismissed it ("No fix needed"). Critic-2 then found it as a CRITICAL. This is new -- prior runs had Corrector-1 either missing issues entirely or catching them.
- **Analogy:** Asking the cook to taste-test their own food -- they are biased toward "it's fine" because they made it.

---

## NEW ANTI-PATTERNS -- Candidate Anti-Patterns Discovered

### Self-Review Dismissal Bias

- **What:** When a Corrector flags an issue during its own self-review pass but then dismisses it, the finding is lost until a later stage rediscovers it.
- **Why:** The agent that authored a fix has an implicit bias toward defending it. Self-review questions are treated as "did I do this right?" (confirmation-seeking) rather than "what did I break?" (fault-seeking).
- **Evidence:** Run 7: Corrector-1 self-flagged the YAML two-file mixing issue, then dismissed it with "No fix needed." Critic-2 later found it as a CRITICAL (F1). The self-review caught the right problem but the dismissal let it through.
- **Analogy:** A student who re-reads their essay, notices a weak paragraph, thinks "it's probably fine," and submits it anyway -- the teacher then marks that exact paragraph.

### Unverified Factual Claims Introduced by Drafter

- **What:** When the Drafter adds factual claims (version numbers, dates, cost figures) that were not in the Researcher's output, those claims bypass verification and propagate as accepted facts.
- **Why:** The Researcher verifies claims in the original document against primary sources. But new claims introduced by the Drafter during restructuring have no upstream verification -- they are treated as authoritative simply because the Drafter wrote them.
- **Evidence:** Run 7: Drafter introduced "Node 18 is the current LTS" (incorrect -- past EOL) and cost figures without methodology. Neither claim was in the Researcher's output. Both were caught by critics but only after propagating through Corrector-1.
- **Analogy:** A fact-checker reviews a journalist's draft, but the editor adds new claims during layout that skip the fact-checking step entirely.

---

## Knowledge Base Update Assessment

The following findings were evaluated against the three criteria (Stability: 3+ runs, Evidence: measured numbers, Generalizability: applies beyond critique pipeline):

1. **Two-round critique finds non-overlapping bugs:** 7/7 runs, measured zero overlap, generalizable to any multi-reviewer process. MEETS all three criteria. However, no knowledge-base files exist yet to update.

2. **Corrector-1 defect introduction:** 6/7 runs, regression counts tracked, generalizable to any fix-then-review workflow. MEETS all three criteria. However, no knowledge-base files exist yet.

3. **Severity calibration stability:** 7 runs, tight bands measured, generalizable as a pipeline health metric. MEETS all three criteria.

4. **Reader zero-value:** 7/7 runs, zero findings measured. Generalizable as "transcription without evaluation adds no quality signal." MEETS all three criteria.

**Recommendation:** Multiple findings meet graduation criteria, but the knowledge-base directory (`knowledge-base/01-proven-patterns.md`, `02-anti-patterns.md`, etc.) does not exist in either `hive-mind` or `hive-mind-design`. These findings should be written to knowledge-base files when the directory is created. For now, they are documented here as graduated candidates.

---

## Memory Update Assessment

No `memory.md` file exists in `hive-mind` or `hive-mind-design` root (only in e2e smoke-test subdirectories). No memory file to update. Key findings are captured in this retrospective for future reference.

---

## Next Run Priorities

1. **Reform the Reader or drop it.** Add evaluative instructions ("flag inconsistent, unverifiable, or contradicted claims") to the Reader prompt for Run 8. If it still produces zero findings, permanently remove Reader from the pipeline. 7 runs of zero-value output is conclusive evidence that transcription-only adds no quality signal.

2. **Add copy-paste review criteria to Critic-2's prompt.** For documents containing code blocks, Critic-2 should verify each block is a single copy-pasteable unit with clear file boundaries. This addresses the emerging pattern (2/7 runs) before it becomes a persistent blind spot.

3. **Track Corrector-1 regression count as a first-class metric.** Add `corrector1_regressions` to the effectiveness report template. The current regression series (0->1->?->2->1->1->2) shows no improvement despite two retrospectives recommending prompt changes. Making it a tracked metric creates accountability.
