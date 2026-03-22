# Double-Critique Pipeline -- Retrospective Report

**Date:** 2026-03-21
**Runs covered:** 6 (Run 1 through Run 6, 2026-03-08 to 2026-03-21)
**Based on:** effectiveness-2026-03-21.md
**Prior retrospectives:** None (this is the first)

---

## KEEP -- What's Working Well

- **Two-round critique architecture** -- Critic-1 and Critic-2 find fundamentally different bug classes (document logic vs. code-level correctness), with zero overlap in findings -- 6/6 runs show this separation; Run 6 is the clearest: Critic-1 found 0 CRITICALs, Critic-2 found all 3 -- Continue as-is, this is the pipeline's core value proposition

- **Researcher front-loading** -- Researcher catches architectural dead ends before the Drafter writes anything, preventing wasted downstream work -- 6/6 runs, zero false positives, 4-15 pre-critic findings per run; Run 6 killed the entire Claude Hooks approach saving all 5 downstream stages -- Continue as-is, no changes needed

- **Corrector-2 creative redesign capability** -- Corrector-2 does not just mechanically apply fixes; it redesigns flawed approaches when critic analysis reveals fundamental problems -- Run 6: replaced entire `git diff` approach with file content hashing, solving 3 problems simultaneously; Run 5: 3 self-catches -- Continue as-is, this stage is peak performing

- **Severity calibration consistency** -- CRITICAL/MAJOR/MINOR distribution stays in tight bands across 6 runs (16%/42%/42% mean), making severity meaningful and comparable -- Run 6 matched Run 1 distribution exactly (17/39/44); oscillation bands: CRITICAL 12-21%, MAJOR 39-47%, MINOR 32-47% -- Continue as-is, no recalibration needed

- **97% application rate** -- Findings that the pipeline produces are almost always applied to the document -- Mean 97% across 6 runs (range 93-100%); the rare skips have documented rationale -- Continue as-is

- **7-stage pipeline (no Justifier)** -- Dropping the Justifier saves tokens with zero quality cost -- 2 consecutive runs without Justifier, zero missed findings attributable to its absence -- Adopt 7-stage as the permanent default

---

## CHANGE -- What Should Be Modified

- **Critic-1 lacks codebase verification** -- Critic-1 reasons only about document logic and cannot verify claims against actual code, causing it to miss all CRITICALs when they require code-level reasoning -- Run 6: 0 CRITICALs (first time ever); accepted "retry loop handles it" at face value without checking if the loop exists -- Add codebase-verification instructions to Critic-1's prompt, matching what Critic-2 and Researcher already have

- **Corrector-1 adopts fixes without verifying them** -- Corrector-1 applies suggested fixes mechanically without checking whether they work in the actual codebase -- 5/6 runs have Corrector-1 or Drafter introducing defects; Run 6: adopted `git diff` approach with 3 hidden flaws (wrong directory, sync/async, concurrency) -- Add explicit instruction: "After applying each fix, verify it against the actual codebase, not just the document"

- **False safety claims propagate through 5+ stages before being caught** -- Claims like "the retry loop handles it" pass through Reader, Researcher, Drafter, Critic-1, and Corrector-1 unchallenged until Critic-2 catches them at stage 6 of 7 -- 3/6 runs (Runs 4, 5, 6) -- Add a "verify mitigation claims" checklist item to Critic-1's prompt specifically; catching these at stage 4 instead of stage 6 reduces rework

---

## ADD -- New Pipeline Stages or Modifications to Try

- **Codebase-verification prompt block for Critic-1** -- A reusable prompt section instructing Critic-1 to verify at least the top 3 most impactful claims against the actual codebase before finalizing findings -- Run 6: all 3 CRITICALs required code verification; Critic-1 found 0 because it lacked this capability -- Implement in next run and compare Critic-1 CRITICAL counts

- **Corrector-1 self-check step** -- After applying all fixes, Corrector-1 should run a "does my fix actually work?" pass, checking function signatures, file paths, and directory contexts against the codebase -- 5/6 runs with Corrector-introduced defects -- Add to Corrector-1 prompt and measure regression count in next run

- **"Mitigation claim audit" micro-step in Critic-1** -- Specifically ask Critic-1 to list every claim of the form "X handles/prevents/mitigates Y" and verify each one -- 3/6 runs with false safety claims propagating -- Track whether false-safety-claim propagation drops below stage 6

---

## DROP -- Not Pulling Its Weight

- **Justifier stage** -- Added no value that Researcher doesn't already cover -- 2 consecutive runs without it, zero quality loss; Researcher naturally absorbs the justification-challenge role -- Permanently remove from pipeline configuration

- **Reader stage (candidate for rethinking, not full drop)** -- 6/6 runs with zero original findings; faithfully catalogs information but never evaluates it -- Run 6: cataloged `{ passed: false }` return-type mismatch but did not flag it; listed nonexistent test file paths without noticing -- Consider either (a) dropping Reader and letting Researcher handle extraction, or (b) adding evaluative instructions to Reader's prompt. Run a comparison in the next run.

---

## NEW PATTERNS -- Candidate Patterns Discovered

- **Researcher architectural redirect as highest-ROI contribution** -- When the Researcher changes the plan's fundamental approach (not just verifying claims), every downstream stage benefits -- Run 6: hooks-to-pipeline-gate redirect was the single biggest architectural change; Run 6 Drafter had zero regressions (best since Run 1), possibly because Researcher gave it better inputs -- Observe in next 2 runs to confirm correlation between Researcher redirects and Drafter regression rates

- **Corrector-2 as "architect of last resort"** -- When Critic-2 reveals a fundamentally flawed approach, Corrector-2 redesigns rather than patches -- Runs 5-6: file-content-hashing replacement, 3 self-catches -- Monitor whether this pattern holds when Critic-2 findings are less architecturally impactful

- **Severity distribution as pipeline health metric** -- Stable severity ratios (16/42/42) across 6 runs suggest the pipeline is neither inflating nor deflating severity -- If a future run deviates by more than 10 percentage points in any band, treat it as a signal worth investigating

---

## NEW ANTI-PATTERNS -- Candidate Anti-Patterns Discovered

- **"Adopt the critic's suggestion literally" trap** -- Correctors take the critic's proposed fix at face value and implement it without independent verification, inheriting hidden flaws -- Run 6: Corrector-1 adopted `git diff` with 3 hidden bugs; Run 2: `parseReportStatus` callers broken; Run 4: 2 regressions -- 5/6 runs affected, this is the pipeline's most persistent weakness

- **Document-logic-only critique misses integration defects** -- Critics that reason only about what the document says (not what the code does) systematically miss defects at the integration boundary -- Run 6: Critic-1 found 0 CRITICALs; all 3 required checking code (retry loop existence, function signatures, directory context) -- This is why two critique rounds with different verification scopes are essential

- **False safety claim propagation** -- When a document asserts "mechanism X handles failure Y," every stage assumes someone upstream verified it -- 3/6 runs (Runs 4, 5, 6); each time the claim survived 4-5 stages before being caught -- No stage currently owns "verify mitigation claims" as an explicit responsibility

---

## Next Run Priorities

1. **Add codebase-verification instructions to Critic-1's prompt.** Specific change: include a "Verify top claims against actual code" section in Critic-1's system prompt, mirroring what Critic-2 and Researcher already have. Success metric: Critic-1 finds at least 1 CRITICAL in the next run (breaking the Run 6 zero-CRITICAL result).

2. **Add self-check step to Corrector-1's prompt.** Specific change: after applying all fixes, Corrector-1 must verify function signatures, file paths, and directory contexts against the codebase. Success metric: Corrector-1 regression count drops from 1 to 0 in the next run.

3. **Decide Reader's fate: evaluate or drop.** Run a comparison: either add evaluative instructions to Reader ("flag claims that appear inconsistent or unverifiable") or skip Reader entirely and measure whether Researcher compensates. Decision deadline: after Run 7 results.
