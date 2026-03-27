# Release 1: "Open the Pipes"

**Theme:** Connect Hive Mind to the MCP ecosystem and grab low-hanging pipeline wins.
**Timeline:** 2-3 weeks
**Status:** Not started

## Design Principles

**1. Skills over hardcoded prompts.** Prompt-based items (few-shot examples, EC-generator rules, Context7 instructions) must be implemented as `.claude/skills/` files, not hardcoded in `prompts.ts`. Claude CLI auto-loads skills from the project's `.claude/skills/` directory via the `cwd` passed to `spawnClaude()`. This makes them editable without code changes and auto-improvable by skill-creator in R3.

Applies to: Story 3 (Context7 instructions), Story 4 (few-shot skepticism), Story 5 (compliance EC rules).
Does NOT apply to: Story 1 (MCP infra -- code), Story 2 (tool permissions -- code), Story 6 (timeout -- code).

**2. One PR per story.** Each story = one PR. No multi-story PRs. This keeps PRs reviewable, revertable, and CI-testable independently. For large stories, break into sub-PRs:
- Story 1 (MCP Phase 1) suggested sub-PRs:
  - PR 1a: config schema + loader changes
  - PR 1b: spawnClaude() MCP flag passing
  - PR 1c: deferred loading support
  - PR 1d: README docs

---

## Dependencies

```
Item 1 (MCP Phase 1) --> Items 2, 3 (WebSearch, Context7 need MCP)
Items 4, 5, 6 have no dependencies (can start immediately)
```

**Recommended order:** Start items 4, 5, 6 in parallel with item 1. Items 2, 3 after item 1 lands.

---

## Stories

### Story 1: MCP Phase 1 -- Consume MCP Servers

**Goal:** Agents can use MCP servers declared in `.hivemindrc.json`.

**Ref:** [Pillar 1 ss1.1](../roadmap-by-pillar.md) (lines 19-55)

**What to build:**
1. Add `mcpServers` field to config schema (`src/config/schema.ts`)
2. In `spawnClaude()` (`src/utils/shell.ts`), if config has mcpServers, write a temp MCP config JSON and pass `--mcp-config <path>` to the Claude CLI invocation
3. Add `defer_loading: true` support so tool schemas don't bloat context
4. Add `.hivemindrc.json` example to README

**Files to modify:**
- `src/config/schema.ts` -- add mcpServers to Zod schema
- `src/config/loader.ts` -- load mcpServers from config
- `src/utils/shell.ts` -- pass --mcp-config flag to spawnClaude()
- `README.md` -- document MCP config

**ACs:**
- `.hivemindrc.json` with `mcpServers` field is parsed without error
- `spawnClaude()` passes `--mcp-config` to Claude CLI when mcpServers configured
- Agents spawned with MCP config can use declared MCP tools
- `defer_loading: true` prevents tool schemas from filling context
- No behavioral change when mcpServers is absent (backwards compatible)

**Effort:** Medium (2-3 days)

---

### Story 2: WebSearch/WebFetch for Research & Fixer Agents

**Goal:** Research and fixer agents can search the web for docs, solutions, and API references.

**Ref:** [Pillar 1 ss1.5](../roadmap-by-pillar.md) (lines 146-163)

**What to build:**
1. Add "WebSearch" and "WebFetch" to tool permission sets for research-capable agents
2. Update agent tool permissions in `src/agents/tool-permissions.ts`

**Files to modify:**
- `src/agents/tool-permissions.ts` -- add WebSearch, WebFetch to RESEARCH_TOOLS and FIXER_TOOLS

**ACs:**
- Research agent (`researcher`) has WebSearch and WebFetch in allowed tools
- Fixer agent (`fixer`, `compliance-fixer`) has WebSearch in allowed tools
- Other agents (implementer, tester) do NOT get web tools
- Existing tests pass (no regressions)

**Effort:** Small (< 1 day)

**Depends on:** Story 1 (WebSearch/WebFetch are built-in Claude tools, but MCP infra should land first for clean integration)

---

### Story 3: Context7 MCP for Live Library Docs

**Goal:** Research and spec-drafter agents get current API docs instead of stale training data.

**Ref:** [Pillar 1 ss1.4](../roadmap-by-pillar.md) (lines 119-142)

**What to build:**
1. Add Context7 as a default MCP server in bundled config (or document as recommended config)
2. Update research agent prompt to mention Context7 tool availability
3. Update spec-drafter prompt to use Context7 for framework/library decisions

**Files to modify:**
- Default `.hivemindrc.json` template or bundled config
- `src/agents/prompts.ts` -- update researcher and spec-drafter prompts

**ACs:**
- Context7 MCP server starts when configured in `.hivemindrc.json`
- Research agent prompt instructs: "Use Context7 to fetch current docs for any library/framework"
- Spec-drafter prompt instructs: "Verify technology choices against current docs via Context7"

**Effort:** Small (< 1 day)

**Depends on:** Story 1 (needs MCP infra)

---

### Story 4: GAN Few-Shot Skepticism for Evaluators

**Goal:** Critic and evaluator agents are trained to be harsh-but-fair via few-shot examples.

**Ref:** [Pillar 3 ss3.4](../roadmap-by-pillar.md) (lines 507-516)

**What to build:**
1. Add 3-5 few-shot examples to critic agent prompts showing skeptical evaluation
2. Examples should demonstrate: catching hidden issues, rejecting "looks good" surface quality, demanding evidence
3. Add to spec-critic, code-reviewer, and compliance-reviewer prompts

**Files to modify:**
- `src/agents/prompts.ts` -- critic, code-reviewer, compliance-reviewer prompt sections

**ACs:**
- Spec-critic prompt includes at least 3 few-shot examples of skeptical critique
- Code-reviewer prompt includes at least 2 few-shot examples
- Examples demonstrate rejecting work that "looks fine" but has subtle issues
- Existing tests pass

**Effort:** Small (< 1 day)

**Depends on:** Nothing (can start immediately)

---

### Story 5: Merge Compliance into VERIFY GAN Loop

**Goal:** Eliminate the separate COMPLIANCE stage. Compliance criteria become additional ECs in the existing VERIFY loop.

**Ref:** [Pillar 3 ss3.1](../roadmap-by-pillar.md) (lines 373-402)

**What to build:**
1. Update EC-generator prompt to include compliance criteria (instruction coverage) as additional ECs
2. Remove compliance stage invocation from orchestrator
3. Remove or deprecate `src/stages/execute-compliance.ts`
4. Update execution plan types if compliance stage is referenced

**Files to modify:**
- `src/agents/prompts.ts` -- EC-generator prompt to include compliance ECs
- `src/orchestrator.ts` -- remove compliance stage call
- `src/stages/execute-compliance.ts` -- remove or mark deprecated
- `src/types/` -- update if compliance stage enum/type exists

**ACs:**
- EC-generator produces compliance-related ECs (e.g., "all SPEC instructions have corresponding implementations")
- VERIFY loop tests both functional ACs/ECs AND compliance ECs
- No separate compliance stage runs
- Pipeline produces same or better pass rates on test PRD
- One fewer agent spawn per story (compliance-reviewer + compliance-fixer eliminated)

**Effort:** Small-Medium (1-2 days)

**Depends on:** Nothing (can start immediately)

---

### Story 6: Dynamic Pipeline Timeout + Cost Velocity Alert

**Goal:** Prevent runaway pipelines with timeouts that scale to the task, not a fixed number.

**Ref:** [Pillar 6 ss6.3](../roadmap-by-pillar.md) (lines 1603-1677)

**What to build:**

1. **Dynamic timeout system (3 tiers):**
   - Pre-execute stages (NORMALIZE, SPEC, PLAN): 2hr fixed safety cap
   - Execute stage: rolling average of completed story durations * remaining stories * 1.5 buffer + 1hr grace. Recalculated after each story completion. Before first story completes, use 2hr initial safety cap.
   - Post-execute stages (REPORT, SCORECARD): 1hr fixed safety cap

2. **Hard cap:** 48 hours maximum regardless of calculation. User override via `--timeout <minutes>` always wins.

3. **Cost velocity alert:**
   - `checkCostVelocity()` projects total cost from progress after each story
   - Warn (not abort) when projected cost exceeds 2x budget
   - Uses same rolling average approach: actual cost per story * remaining stories

4. **Timeout calculation example:**
   ```
   After story 1 completes (took 12 min):
     avgPerStory = 12 min
     remaining = 9 stories
     executeTimeout = 12 * 9 * 1.5 + 60 = 222 min (~3.7 hr)

   After story 5 completes (avg now 18 min due to retries):
     avgPerStory = 18 min
     remaining = 5 stories
     executeTimeout = 18 * 5 * 1.5 + 60 = 195 min (~3.25 hr from now)
   ```

**Files to modify:**
- `src/config/schema.ts` -- add stageTimeouts config, remove fixed pipelineTimeout
- `src/orchestrator.ts` -- add per-stage timeout checks, rolling average tracker
- `src/utils/cost-tracker.ts` (or equivalent) -- add velocity projection + rolling avg duration tracker

**ACs:**
- Pre-execute stages abort after 2hr with clear message
- Execute stage timeout recalculates after each story using rolling average
- Post-execute stages abort after 1hr
- Hard cap at 48hr regardless of calculation
- `--timeout <minutes>` overrides all dynamic calculation
- Cost velocity warning fires when projected total > 2x budget
- Warning includes projected cost, avg story duration, and recommendation
- No timeout impact when pipeline runs within normal bounds (timeout always > actual)

**Effort:** Small-Medium (1-2 days)

**Depends on:** Nothing (can start immediately)

---

## Execution Plan

```
Week 1:
  [parallel] Story 4 (few-shot skepticism) -- 0.5 day
  [parallel] Story 5 (merge compliance)    -- 1-2 days
  [parallel] Story 6 (timeout + velocity)  -- 1 day
  [parallel] Story 1 (MCP Phase 1)         -- starts, takes 2-3 days

Week 2:
  Story 1 (MCP Phase 1)                    -- completes
  Story 2 (WebSearch/WebFetch)             -- 0.5 day (after Story 1)
  Story 3 (Context7)                       -- 0.5 day (after Story 1)
  Integration testing + bug fixes          -- 1-2 days

Week 3 (buffer):
  Fix issues found in integration
  Run full pipeline on test PRD
  Compare scorecard against pre-R1 baseline
```

## Exit Criteria

All must pass before R1 is considered done:

- [ ] MCP Phase 1: agents use MCP servers from `.hivemindrc.json`
- [ ] WebSearch: research agent searches web during SPEC research
- [ ] Context7: research agent fetches live library docs
- [ ] Few-shot skepticism: critic prompts include skeptical examples
- [ ] Compliance merged: no separate compliance stage, criteria are ECs
- [ ] Safeguards: dynamic timeouts (2hr pre-execute, rolling-avg execute, 48hr cap), cost velocity warning
- [ ] Regression: `npm run test` passes, `npm run build` succeeds
- [ ] Validation: full pipeline run on test PRD produces scorecard >= baseline

## Retrospective

(To be filled after R1 completion)

- What went well:
- What was harder than expected:
- What should change for R2:
- New ideas discovered:
- Items pulled from backlog:
