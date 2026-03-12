# Phase 2: Reliability — Learnings

**Completed:** 2026-03-12 | **Items:** RD-01 (Backoff), RD-04 (Structured Output), RD-02 (Error Recovery)

---

## Design Decisions & Rationale

### Backoff as pure functions (not class)
`calculateBackoffDelay()` and `sleep()` are standalone exports in `utils/backoff.ts`. Pure function for delay calculation makes testing trivial — mock `Math.random` for deterministic results, use `vi.useFakeTimers()` for sleep. No class instantiation overhead.

### Jitter: ±20% uniform random
Prevents thundering herd when parallel agents all retry simultaneously. The `0.8 + Math.random() * 0.4` formula is simple and testable — mock `Math.random` to test exact boundaries (0 → 0.8x, 0.5 → 1.0x, ~1 → 1.2x).

### Level 0 JSON status block as HTML comment
`<!-- STATUS: {"result": "PASS"} -->` format chosen because: (1) HTML comments don't render in markdown, (2) survive output formatting, (3) mechanically parseable with a single regex. The block is additive — regex cascade preserved as fallback with zero breakage risk.

### Three-tier parser confidence
Added `"structured"` confidence level (from JSON block) alongside existing `"matched"` (regex) and `"default"` (no match). This distinguishes "verified PASS/FAIL" from "parser couldn't determine" — addressing F35 (all-or-nothing verify) and F40 (misattributing pipeline failures to code).

### HiveMindError class for user-facing errors
Separates intentional error conditions (bad args, missing files) from internal bugs. `main()` is the single `process.exit()` point — everything else throws. Clean error messages for users, full stack traces for bugs.

### StoryStatus "skipped" for resume flows
`--from US-03` marks preceding stories as "skipped" (not "failed"). `--skip-failed` converts "failed" to "skipped". This preserves the distinction between "tried and failed" vs "intentionally bypassed".

### Error persistence on Story
`errorMessage` and `lastFailedStage` are optional fields on Story, written atomically via `saveExecutionPlan()` immediately in catch blocks — before any subsequent action (per C-ATOMIC-1, F30).

---

## Technical Challenges

### Windows PATH resolution for `spawnClaude` (cost: ~15min)
**Problem:** `spawn("claude", args)` without `shell: true` on Windows can't find `claude` on PATH. The ENOENT error is cryptic.

**Fix:** Added `shell: process.platform === "win32"` to the spawn options. This was already done for `runShell()` but was missed in `spawnClaude()`.

**Pattern:** All `spawn()` calls on Windows should use `shell: true` or `shell: "bash"` for PATH resolution.

### Agent output as raw JSON session logs (Tier 3 finding)
**Problem:** `spawnClaude()` with `--print` + `--output-format json` returns the full session conversation as JSON stdout. When agents don't use the Write tool to create their output file, the fallback in `spawnAgent()` writes the raw session JSON to disk as the file content. Parser can't extract status from JSON blobs → defaults to FAIL.

**Root cause:** Pre-existing architecture issue, not caused by Phase 2. The `--print` flag makes Claude output to stdout rather than using tools. Haiku agents are especially prone to this — they sometimes respond conversationally instead of executing the task.

**Impact on Tier 3:** Both stories failed because test reports were raw JSON. Parser correctly returned "default" confidence and warned. Pipeline didn't crash and continued — which is the correct behavior.

**Recommendation for Phase 3+:** Investigate whether `--print` should be removed (let agents write files naturally) or whether a post-spawn validation step should check if the output file contains valid markdown.

### Caller audit for StoryStatus changes (cost: ~10min)
**Problem:** Adding `"skipped"` to `StoryStatus` required updating 5 locations: `isValidStatus()`, `VALID_TRANSITIONS`, `getNextStory()`, and all test assertions referencing status values. Per F31, this was expected — but the audit took longer than anticipated because the locations were spread across `state/execution-plan.ts`, `orchestrator.ts`, `execute-verify.ts`, and `types/manager-log.ts`.

**Pattern:** When adding union type members, `grep` for the existing member list first to find all consumers.

### Existing tests expected `process.exit(1)` (cost: ~5min)
**Problem:** `cli-reject-flags.test.ts` and `cli-start-prd.test.ts` used `vi.spyOn(process, "exit")` and expected the spy to throw. After replacing `process.exit` with `HiveMindError`, these tests failed.

**Fix:** Updated tests to `expect(() => parseArgs(...)).toThrow(HiveMindError)`.

**Pattern:** When replacing `process.exit` with thrown errors, search for all tests that mock `process.exit` — they need updating.

---

## Patterns Established

| Pattern | Where | Reuse in Phase 3+ |
|---------|-------|-------------------|
| Pure backoff functions + mock sleep | `utils/backoff.ts`, spawner tests | Any retry logic |
| Level 0 JSON status block | `reports/parser.ts`, `agents/prompts.ts` | All status-producing agents |
| Three-tier confidence | `ParseResult`, `VerifyResult`, `ManagerLogEntry` | All parser consumers |
| `HiveMindError` for user-facing errors | `utils/errors.ts`, `index.ts`, `orchestrator.ts` | All new CLI commands |
| Error persistence on Story | `types/execution-plan.ts`, `orchestrator.ts` | Post-mortem tooling |
| `shell: process.platform === "win32"` for spawn | `utils/shell.ts` | All `spawn()` calls |

---

## Tier 3 Live Test Observations

- **Pipeline stability:** No crash across SPEC → PLAN → EXECUTE (2 stories × 3 attempts) → REPORT
- **Backoff verified:** Retries occurred with sleep between attempts
- **Error persistence verified:** `errorMessage` + `lastFailedStage` written to execution-plan.json
- **Pipeline continuity:** US-01 failed, US-02 still executed
- **Parser confidence warning:** "default confidence" logged when STATUS block missing
- **Synthesizer issue:** execution-plan.json contained raw session JSON (pre-existing, not Phase 2)
- **Report issue:** consolidated-report.md and retrospective.md contained raw session JSON (pre-existing `--print` architecture issue)
- **Cost:** ~$0.10 total for SPEC + PLAN + EXECUTE + REPORT stages

---

## Estimates vs Actuals

| Item | Estimated Steps | Actual Steps | Notes |
|------|----------------|-------------|-------|
| RD-01 (Backoff) | Steps 1-5 | Steps 1-5 | Clean — pure functions are fast to implement and test |
| RD-04 (Structured Output) | Steps 6-8 | Steps 6-8 | Clean — additive change, no breakage |
| RD-02 (Error Recovery) | Steps 9-13 | Steps 9-13 | Caller audit took extra time; existing test updates needed |
| Integration | Step 14 | Step 14 | One test fix for mock timing |
| Tier 3 | Step 15 | Step 15 + Windows shell fix | Unexpected `spawn` ENOENT on Windows |

---

## Test Gaps Found

1. **No test for `--print` fallback content quality** — `spawnAgent` writes raw stdout to file when agent doesn't create it. No validation that the content is markdown.
2. **No test for `resume` command end-to-end** — unit tests cover `parseArgs` and `updateStoryStatus`, but no integration test runs `main()` with `resume`.
3. **Synthesizer output validation** — no check that execution-plan.json is valid JSON after the synthesizer writes it.
4. **Parser on very large reports** — no test for reports exceeding `reportExcerptLength` (200 chars) with STATUS block at various positions.

---

## Recommendations for Next Phase

1. **Investigate `--print` vs tool-based output** — The Tier 3 finding shows `--print` mode causes agents to produce unusable output. Consider removing `--print` and letting agents use Write tool directly.
2. **Add output file validation** — After spawn, check that output file contains valid markdown (not JSON session log). Log warning and retry if invalid.
3. **Pre-validate execution-plan.json** — Before EXECUTE stage, validate the plan file is parseable. Currently the pipeline proceeds and discovers the issue at runtime.
4. **Cost tracking (RD-05)** — Tier 3 data shows each agent spawn costs $0.01-0.06. Phase 3 should add tracking to surface this.

---

## Key Takeaway

Level 0 structured output (JSON status block) is the right approach — it gives agents a mechanical way to report status that bypasses all regex parsing bugs. The Tier 3 test revealed that the bigger reliability bottleneck is actually the `--print` mode causing agents to produce raw session JSON instead of writing files. Phase 3+ should prioritize fixing the agent output pipeline before adding more features on top.
