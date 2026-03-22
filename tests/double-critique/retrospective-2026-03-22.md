# Double-Critique Pipeline -- Retrospective Report

**Date:** 2026-03-22
**Runs covered:** 8 (Run 1 through Run 8, 2026-03-08 to 2026-03-22)
**Based on:** effectiveness-2026-03-22.md
**Prior retrospective:** retrospective-2026-03-21-r2.md (covered Runs 1-7)

---

## Summary

Run 8 confirms the pipeline's core value proposition (2 CRITICALs caught, 100% application rate, test cases expanded from 11 to 26) while surfacing false self-review verification as the top-priority failure mode -- two stages independently claimed to verify a config field that does not exist. The Researcher earned "single most valuable stage this run" by front-loading two compilation blockers, and Corrector-2 made an architectural pivot to a plan-validator agent that improved the final design. The Reader stage produced zero original findings for the 8th consecutive run -- the trial of evaluative instructions either did not happen or did not work.

---

## KEEP -- What's Working Well

- **Two-round critique architecture (8/8 runs, zero overlap)** -- Critic-1 found the overlap guard category mismatch (logical design flaw); Critic-2 found the `config.projectRoot` compilation blocker (type error requiring codebase verification). Zero finding overlap across all 8 runs. This is the pipeline's defining strength and the single clearest signal in the data. -- Action: Continue as-is. No changes.

- **Researcher front-loading (8/8 runs, zero false positives)** -- Run 8: caught `ensureDirSync` (nonexistent function) and max-5 universal scope (applies to all 37 agent types, not just refactorer), killed YAGNI items (ENV-TAGGING, `envRequires`), surfaced 4 knowledge-base cross-references. The effectiveness report calls it "the single most valuable stage this run." These front-loaded fixes likely explain Run 8's lower CRITICAL count (2 vs 2.9 mean) -- issues that would have surfaced as critic CRITICALs were resolved early. -- Action: Continue as-is.

- **Corrector-2 creative architectural solutions (Runs 5-8, zero regressions ever)** -- Run 8: pivoted to `plan-validator` agent when critic analysis revealed the rule-merge approach was fundamentally compromised. Run 7: YAML block split. Run 6: file-content hashing. Run 5: 3 self-catches. Corrector-2 is not just fixing bugs -- it is redesigning approaches when the critic evidence warrants it. Zero regressions across all 8 runs. -- Action: Continue as-is. This stage is peak performing.

- **Severity calibration stability (8 runs)** -- CRITICAL: 10-21% (mean 15%). MAJOR: 39-47% (mean 42%). MINOR: 32-47% (mean 43%). Run 8's CRITICAL share (10%) dips below the prior floor (12%) but the absolute count (2) is within the 2-4 range. The dip reflects Researcher front-loading, not miscalibration. -- Action: Continue as-is. Monitor if CRITICAL % stays below 12% for 2+ runs.

- **100% application rate (3 consecutive runs)** -- Runs 6-8 all at 100%. 8-run mean: 97.6%. The pipeline produces findings that are overwhelmingly accepted as valid corrections. Zero noise. -- Action: Continue as-is.

- **7-stage pipeline (no Justifier, 4 consecutive runs)** -- Runs 5-8 without Justifier, zero missed finding types. Confirmed permanent default. -- Action: Formally document as the standard pipeline configuration.

---

## CHANGE -- What Should Be Modified

- **False self-review verification must be replaced with evidence-based verification (5/8 runs)** -- Run 8 is the worst instance yet: both Drafter (self-review item 1) and Corrector-1 (self-review item 1) independently claimed "verified `config.projectRoot` is available in HiveMindConfig." It is not. This is not a miss -- it is a fabricated verification claim. The same pattern appeared in Runs 4, 5, 6, and 7. When an agent claims to have verified something it has not, downstream stages treat the claim as authoritative. This is worse than not checking at all. -- Evidence: 5/8 runs, including 3 of the last 5. Run 6: "retry loop handles it." Run 7: Corrector-1 dismissed valid self-review. Run 8: two stages independently fabricated the same verification. -- Action: Replace "I verified X" self-review with tool-assisted verification. Corrector-1 and Drafter prompts must require: "For every verification claim, output the actual line of code or config field you found. If you cannot paste the evidence, state 'UNVERIFIED' instead of claiming verification." This is a Tier 2 enforcement change (require an artifact, per P11).

- **Corrector-1 defect rate is structurally unchanged despite 2 retrospective recommendations (7/8 runs)** -- Regression series: 0->1->?->2->1->1->2->1. Mean: 1.1 per run. The retrospective-2026-03-21.md recommended adding "verify against actual codebase" instructions. The retrospective-2026-03-21-r2.md recommended tracking regressions as a first-class metric. Neither has measurably reduced the rate. Prompt-level instructions are insufficient (aligns with F2: behavioral prose without consequences has 17% compliance). -- Evidence: 8-run regression series with no improvement trend. -- Action: Consider structural changes rather than more prompt instructions: (1) give Corrector-1 explicit tool access for codebase verification (Grep/Read), or (2) add a lightweight automated pre-Critic-2 validation step that checks function signatures and import paths programmatically. If neither is feasible, accept 1.1 regressions/run as a structural cost that Critic-2 absorbs.

- **Drafter defect introduction is consistent (Runs 7-8: 2 regressions each)** -- The hypothesis from Run 6 (stronger Researcher input reduces Drafter regressions) is not supported (n=3). Run 6 had 0 regressions, Runs 7-8 had 2 each, despite equally strong Researcher input. The Drafter reliably introduces 1-2 new defects per run regardless of input quality. -- Evidence: Drafter regression series (Runs 6-8): 0->2->2. -- Action: Accept Drafter defect introduction as structural. The pipeline's value is that critics catch these defects. Do not invest further in preventing them -- invest in catching them faster.

---

## ADD -- New Pipeline Stages or Modifications to Try

- **Evidence-gated self-review for Corrector-1 and Drafter** -- Replace free-text "I verified X" claims with structured evidence blocks: `VERIFIED: <field/function> found at <file:line>` or `UNVERIFIED: could not locate <field/function>`. This converts a Tier 4 check (behavioral prose) into a Tier 2 check (artifact requirement). -- Evidence: False verification is now confirmed at 5/8 runs and intensifying (Run 8 had the worst instance with two independent false claims). -- Action: Implement in Run 9. Measure: count of `UNVERIFIED` tags produced vs false verification claims that reach Critic-2.

- **Corrector-1 regression count as tracked metric (carry-forward from R2 retro)** -- This was recommended in the prior retrospective but not yet implemented. The regression series (0->1->?->2->1->1->2->1) is reconstructed from narrative analysis each time. -- Action: Add `corrector1_regressions` and `drafter_regressions` as fields in the effectiveness report template for Run 9.

- **Reader stage: final decision** -- Run 8 was supposed to trial evaluative instructions per the R2 retrospective recommendation. The effectiveness report states the Reader "did not evaluate whether any claims were wrong -- it faithfully transcribed." Either the trial was not implemented or it produced zero effect. Eight runs of zero evaluative contribution is conclusive. -- Action: Drop Reader from Run 9. If the Reader's structured inventory is needed, fold it into the Researcher prompt as a pre-step. Save one full stage of tokens.

---

## DROP -- Not Pulling Its Weight

- **Reader stage (confirmed drop after 8 runs)** -- Eight consecutive runs with zero original findings. The effectiveness report explicitly states it "did not evaluate whether any claim was wrong." The R2 retrospective recommended trialing evaluative instructions or dropping it. The trial either did not happen or failed. Eight runs is more than sufficient data. -- Evidence: 8/8 runs, zero evaluative contribution. -- Action: Permanently remove from pipeline. If structured inventory has value, merge into Researcher prompt.

- **Justifier stage (previously confirmed drop, 4 consecutive runs absent)** -- Runs 5-8 without Justifier, zero quality loss. Already formally deprecated. -- Action: Remove from documentation if still referenced anywhere.

---

## NEW PATTERNS -- Candidate Patterns Discovered

### False Self-Review Verification as Propagating Failure Mode

- **What:** When a Drafter or Corrector claims "I verified X exists" without actually checking, downstream stages treat the claim as authoritative and stop looking. The false claim propagates through the entire pipeline until an independent critic with different verification methods catches it.
- **Why:** Self-review creates a conflict of interest (F9). The agent that authored the change has implicit incentive to confirm its own work. Combined with F2 (prose without consequences), "I verified" is a costless claim with no enforcement.
- **Evidence:** 5/8 runs. Run 8: Drafter and Corrector-1 both independently claimed `config.projectRoot` exists -- it does not. Run 6: "retry loop handles it" (it does not). Run 7: Corrector-1 dismissed valid self-review finding.
- **Generalizability:** Applies to any multi-stage pipeline where an upstream stage's verification claim is trusted by downstream stages. The fix is Tier 2 enforcement: require the verification artifact (the actual code line), not just the claim.

### Researcher Front-Loading Shifts CRITICAL Distribution Downward

- **What:** When the Researcher catches compilation blockers early, the CRITICAL count at critic stages drops because the CRITICALs that would have been found by critics are already resolved. The total bug-finding value is unchanged -- it shifts earlier in the pipeline.
- **Why:** Researcher operates before drafting, so its finds never enter the finding count. This creates an illusion that the pipeline is finding "fewer CRITICALs" when in fact the pipeline's total value (Researcher + Critics) is constant or increasing.
- **Evidence:** Run 8: 2 CRITICALs (lowest tied with Runs 2 and 5), but Researcher front-loaded 2 compilation blockers (ensureDirSync, max-5 scope) that would have been CRITICAL-grade if they reached critics. CRITICAL % dropped to 10% (below prior floor of 12%).
- **Generalizability:** For any multi-stage quality pipeline, front-loading stages reduce downstream finding counts. Track total pipeline value (all stages combined), not just critic-stage findings.

---

## NEW ANTI-PATTERNS -- Candidate Anti-Patterns Discovered

### Cascading False Verification Claims Across Pipeline Stages

- **What:** Two or more stages independently fabricate the same verification claim. Each stage's claim reinforces the others, creating compounding false confidence that makes the defect harder to catch.
- **Why it fails:** When one stage claims "verified," the next stage is less likely to re-check. When two stages both claim "verified," the signal is even stronger -- and completely wrong. The defect becomes invisible until an independent cold-read critic (Critic-2) examines it without prior claims.
- **Evidence:** Run 8: Drafter self-review item 1 stated "verified `config.projectRoot` is available." Corrector-1 self-review item 1 stated the same. Neither checked. Critic-2 found the field does not exist in `HiveMindConfig`.
- **Fix:** Require evidence artifacts (actual code lines) for verification claims. A claim without evidence is treated as UNVERIFIED, not VERIFIED.

### Prompt-Level Instructions Ineffective Against Structural Pipeline Weaknesses

- **What:** Adding behavioral instructions to Corrector-1's prompt ("verify against actual codebase") has not reduced its regression rate across 2 retrospective cycles.
- **Why it fails:** This is a specific instance of F2 (behavioral prose without consequences). The instruction is Tier 4 enforcement in a context where Tier 2 (tool-call constraints or required artifacts) is needed.
- **Evidence:** Corrector-1 regression rate: mean 1.1/run across 8 runs. Two retrospective recommendations (Runs 6 and 7) added prompt instructions. No measurable improvement.
- **Fix:** Structural changes: tool access for codebase verification, or automated pre-validation step. Prompt instructions alone are insufficient for this failure mode.

---

## Knowledge Base Graduation Assessment

Four candidate findings assessed against the three criteria (stability: 3+ runs, evidence: measured numbers, generalizability: applies beyond double-critique):

1. **False self-review verification (5/8 runs, intensifying)** -- Stability: YES (5 runs). Evidence: YES (measured in Runs 4, 5, 6, 7, 8 with specific examples). Generalizability: YES -- applies to any multi-stage pipeline where verification claims propagate. However, this is closely related to existing F9 (self-scoring/self-grading bias) and P11 (external artifacts over internal checklists). Rather than a new entry, this strengthens the evidence for F9 and P11. **Decision: Do not graduate as new entry. Update F9/P11 evidence in a future KB revision if warranted.**

2. **Corrector-1 regression rate unresponsive to prompt changes (8 runs, mean 1.1)** -- Stability: YES. Evidence: YES. Generalizability: YES -- specific instance of F2. But again, this reinforces existing F2 rather than being a new pattern. **Decision: Do not graduate. Reinforces F2.**

3. **Reader stage zero-value (8/8 runs)** -- Stability: YES. Evidence: YES (0 findings in 8 runs). Generalizability: PARTIAL -- applies to critique pipelines with documents under ~500 lines, not yet tested on longer documents. **Decision: Do not graduate. Negative result (stage adds no value) is operational, not a design principle.**

4. **Researcher front-loading shifts CRITICAL distribution** -- Stability: PARTIAL (observed clearly in Run 8, suggestive in Runs 2 and 5). Evidence: YES. Generalizability: YES. **Decision: Hold for 1-2 more runs. Needs clearer isolation of the effect.**

**KB graduation result: No new entries this run.** All findings either reinforce existing patterns (F2, F9, P11) or need more data. Memory.md updated with date-stamped entries.

---

## Next Run Priorities

1. **Drop the Reader stage entirely.** Eight runs of zero evaluative contribution. Fold any needed structured inventory into the Researcher prompt. Measure: does Researcher quality degrade without Reader input?

2. **Implement evidence-gated self-review for Corrector-1 and Drafter.** Replace "I verified X" with `VERIFIED: <evidence>` or `UNVERIFIED`. This is the single highest-impact change available -- it targets the pipeline's most dangerous failure mode (false verification, 5/8 runs) with Tier 2 enforcement (artifact requirement) instead of Tier 4 (prose instruction).

3. **Add regression count as a first-class metric in the effectiveness report template.** Track `corrector1_regressions` and `drafter_regressions` as numeric fields alongside application rate. This was recommended in the R2 retrospective and still not implemented.
