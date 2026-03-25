# Plan: Hive Mind Improvement Roadmap -- Lessons from Anthropic's Harness

## Context
Anthropic published two engineering articles on harness design for long-running agents. We deep-dived into how their patterns compare to Hive Mind's architecture. This plan documents 8 areas of analysis with concrete improvement suggestions.

## File to create
- `/home/user/hive-mind/docs/harness-improvement-roadmap.md` -- the full analysis and recommendations

## Reference sources
- [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- `/home/user/hive-mind/docs/harness-comparison-anthropic.md` -- our comparison doc (already created)

---

## The 8 Questions -- Summary of Findings

### Q1: Full Context Reset in Hive Mind

**Current state:** Hive Mind already does context resets inherently -- each agent is spawned as a fresh subprocess via `spawnClaude()` in `src/agents/spawner.ts:19-27`. No agent carries conversation history from a prior agent. Context is passed explicitly via input files (memory.md, step files, role reports).

**What's NOT reset:** The memory.md file grows unboundedly throughout the pipeline and is passed in full to every agent. After 20 stories, this can become very large.

**Recommendation:** YES, add memory summarization at two boundaries:
1. Between major stages (after SPEC checkpoint, after PLAN checkpoint) -- summarize memory.md into a condensed handoff
2. Between execution waves -- summarize wave learnings before passing to next wave

**How to implement (steps):**
1. Add `summarizeMemory(memoryPath, maxWords)` to `src/memory/memory-manager.ts`
2. At stage boundaries in `src/orchestrator.ts`, call summarize before passing memory to next stage
3. Between waves in wave executor (~line 1070), optionally summarize after each wave completes
4. Keep full memory.md on disk for audit, pass only summary to agents

**Should we?** YES for memory summarization between waves. NO for full context reset between stages -- Hive Mind agents already get clean context per spawn. The real problem is memory.md bloat, not conversation history.

### Q2: Playwright-Based Verification

**Current state:** Hive Mind's verify stage (execute-verify.ts) uses shell command exit codes for binary PASS/FAIL. The tester-exec agent writes and runs shell commands to test ACs/ECs.

**How to add Playwright (steps):**
1. Add `playwright` as optional dependency in package.json
2. Create `src/tooling/playwright-setup.ts` -- detect if project has UI, install Playwright if needed
3. In `src/stages/execute-verify.ts`, add a `runPlaywrightTests()` path alongside shell-based testing
4. EC-generator (`src/agents/prompts.ts`) needs a new instruction block for UI projects: generate Playwright test scripts instead of shell commands
5. Add `--playwright` flag or auto-detect from project type (React/Vue/Svelte detected in `src/tooling/detect.ts`)

**Should we?** MEDIUM priority. Only valuable for frontend/full-stack projects. Make it opt-in via flag or auto-detection.

### Q3: GAN Pattern to Simplify Pipeline

**Current state:** Hive Mind has multiple checking layers:
- BASELINE CHECK (pre-pipeline)
- COMPLIANCE CHECK (post-BUILD, per story)
- VERIFY loop (tester -> diagnostician -> fixer, up to 3 attempts)
- INTEGRATION VERIFY (cross-module)
- SCORECARD (post-pipeline)

**The GAN pattern idea:** Replace complex multi-layer checking with simple generator-evaluator loops. Generator produces work, evaluator grades it, loop until passing. This collapses COMPLIANCE + VERIFY into one loop.

**Where GAN pattern can replace existing layers:**

| Current Layer | Replace with GAN? | Justification |
|---|---|---|
| BASELINE CHECK | NO | Pre-flight, runs once, not iterative |
| COMPLIANCE CHECK | YES | Currently: reviewer -> fixer -> re-reviewer (2 attempts). GAN: generator (fixer) + evaluator (reviewer), loop until PASS or max attempts. Same logic, simpler code |
| VERIFY (AC/EC) | ALREADY IS a GAN | tester -> diagnostician -> fixer -> re-test IS a generator-evaluator loop. Already implemented this pattern |
| INTEGRATION VERIFY | NO | Runs once per module boundary, not iterative |
| SCORECARD | NO | Read-only grading, no iteration needed |

**Recommendation:** The main simplification opportunity is **merging COMPLIANCE into the VERIFY loop**. Instead of running compliance as a separate stage, make compliance criteria part of the AC/EC set. The VERIFY GAN loop already handles iteration.

**Trade-off:** Cost/time increases with more GAN iterations, but pipeline code becomes simpler. The existing VERIFY loop already caps at maxAttempts (typically 3), so cost is bounded.

**Implementation:**
1. In `src/stages/plan-stage.ts`, have EC-generator include compliance criteria (instruction coverage) as additional ECs
2. Remove `src/stages/execute-compliance.ts` as a separate stage
3. VERIFY loop now covers both functional correctness AND compliance in one GAN loop
4. Saves one agent spawn per story (compliance-reviewer + compliance-fixer eliminated)

### Q4: Spec Granularity -- Technical Detail Level

**Current state:** Hive Mind's SPEC is moderately technical:
- SPEC-v1.0.md includes architecture decisions, inter-module contracts, data structures
- But AC/EC generation is deferred to PLAN stage (not in SPEC)
- This is already partially aligned with Anthropic's "avoid technical detail in spec"

**The dilemma:** If we deliberately avoid ALL technical detail in SPEC, how do we control whether the project uses Python or TypeScript?

**Resolution -- two levels of technical detail:**
1. **Strategic decisions** (KEEP in SPEC): language choice, framework choice, database choice, deployment model, API style (REST/GraphQL). These are WHAT decisions that constrain all downstream work.
2. **Implementation details** (REMOVE from SPEC): specific function signatures, file structure, class hierarchies, algorithm choices. These are HOW decisions the implementer should figure out.

**Should we drop SPEC entirely?** NO. The SPEC serves three critical purposes:
1. Defines the contract that AC/EC test cases are built against
2. Makes strategic technology choices explicit (Python vs TypeScript)
3. Gives the human a checkpoint to review before expensive EXECUTE phase

**Anthropic's planner also keeps strategic decisions** -- they specify "React, Vite, FastAPI, SQLite" stack in the planner output. They just avoid specifying function-level detail.

**Recommendation:** Keep SPEC but add a rule to spec-drafter prompt: "STRATEGIC-ONLY: Specify technology stack, API boundaries, data model, and deployment. Do NOT specify function signatures, class hierarchies, or file-level implementation details."

### Q5: Simple Tasks -- When to Skip the Harness

**Concept clarification:** A harness is NOT just for long-running tasks. It's the orchestration layer around agents. Even a simple "generate -> evaluate" loop is a harness. The Anthropic articles focus on long-running harnesses, but the concept applies at any scale.

**However, the user's intuition is correct:** For a 1-story task like "add a button to the navbar", running the full NORMALIZE -> BASELINE -> SPEC -> PLAN -> EXECUTE -> REPORT pipeline is overkill. That's 15+ agent spawns for what Claude Code could do in one shot.

**Recommendation -- complexity-based routing:**
1. Add a `--quick` flag (or auto-detect from PRD word count)
2. Quick mode: skip NORMALIZE, skip BASELINE, skip SCORECARD, single-story PLAN, simplified EXECUTE (no compliance, no waves)
3. Threshold: PRD < 200 words OR plan produces < 3 stories -> auto-suggest quick mode
4. This is NOT "skip the harness" -- it's "use a lighter harness"

### Q6: Agent Bias in Subjective Evaluation + GAN Loop Opportunities

**How Anthropic solves evaluation bias:**
1. **Separate evaluator agent** that never saw the generation process (eliminates self-praise)
2. **Concrete rubric** that turns subjective quality into gradable terms (eliminates vagueness)
3. **Penalize generic output** explicitly in the rubric ("is this template layouts and library defaults?")
4. **Weight creative dimensions** higher than competence dimensions (pushes beyond "good enough")

Their four rubric dimensions:
1. **Design Quality** -- "Does the design feel like a coherent whole rather than a collection of parts?"
2. **Originality** -- "Is there evidence of custom decisions, or is this template layouts and AI-generated patterns?"
3. **Craft** -- Typography hierarchy, spacing consistency, color harmony, contrast ratios
4. **Functionality** -- Can users find primary actions and complete tasks?

**Hive Mind's advantage:** Binary AC/EC evaluation has ZERO bias by design. Shell command exits 0 or non-zero. No room for subjective self-praise.

**Where GAN loops can replace complicated layers in Hive Mind:**

| Area | Current Flow | GAN Replacement |
|---|---|---|
| SPEC critique | Drafter -> Critic1 -> Corrector -> Critic2 -> Corrector2 (5 agents) | Generator (drafter) + Evaluator (critic), loop until critic says PASS. Max 3 iterations. Saves 1-2 agents when spec is good on first try |
| COMPLIANCE | Compliance-reviewer -> Compliance-fixer -> Re-review (3 agents) | Merge into VERIFY GAN loop as additional ECs (0 extra agents) |
| REPORT validation | Reporter -> Double-critique (2 agents) | Generator (reporter) + Evaluator (critic), loop until report quality passes. Currently only 1 critique pass |
| VERIFY (AC/EC) | Already a GAN loop | No change needed |

**Net effect:** SPEC stage drops from 9 agents to ~7 (GAN loop exits early when quality is good). COMPLIANCE stage eliminated entirely (merged into VERIFY). REPORT gets iterative improvement instead of fixed double-critique.

### Q7: RAG Memory with SQL Database MCP

**Current state:** Hive Mind uses flat-file memory (memory.md) with text-based graduation to knowledge-base markdown files. Retrieval is "load entire file" -- no semantic search, no filtering.

**Problems with current approach:**
1. Memory.md grows unboundedly -- all learnings dumped into one file
2. No semantic search -- agents get ALL learnings, even irrelevant ones
3. Graduation is simple (date count + story ref count) -- no relevance ranking
4. No way to query "what did we learn about React testing?" specifically

**RAG + SQL MCP recommendation:**

**Schema design:**
```sql
CREATE TABLE learnings (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,        -- 'pattern' | 'mistake' | 'discovery'
  content TEXT NOT NULL,          -- the learning text
  embedding BLOB,                 -- vector embedding for semantic search
  story_ids TEXT,                 -- JSON array of story IDs that evidenced this
  first_seen DATE,
  last_seen DATE,
  times_cited INTEGER DEFAULT 1,
  graduated BOOLEAN DEFAULT FALSE,
  graduated_to TEXT,              -- knowledge-base file path
  tags TEXT                       -- JSON array of tags (e.g., ["testing", "react", "api"])
);

CREATE TABLE graduation_log (
  id INTEGER PRIMARY KEY,
  learning_id INTEGER REFERENCES learnings(id),
  graduated_at TIMESTAMP,
  target_file TEXT,
  series TEXT                     -- P25, F31, etc.
);

CREATE TABLE pipeline_runs (
  id INTEGER PRIMARY KEY,
  prd_path TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_stories INTEGER,
  passed_stories INTEGER,
  failed_stories INTEGER,
  total_cost REAL,
  scorecard_grade TEXT
);
```

**How it integrates:**
1. Add SQLite MCP server as dependency
2. `src/memory/memory-manager.ts` writes to DB instead of (or alongside) memory.md
3. Before each agent spawn, query relevant learnings: `SELECT * FROM learnings WHERE tags MATCH ? ORDER BY times_cited DESC LIMIT 10`
4. Graduation becomes a DB query: `SELECT * FROM learnings WHERE times_cited >= 3 AND last_seen - first_seen >= 3 days AND NOT graduated`

**Surfacing graduation stats in REPORT/SCORECARD:**

Add to scorecard prompt inputs:
- Total learnings captured this run
- Learnings graduated this run (with details)
- Top 5 most-cited patterns across all runs
- Learning velocity (new learnings per story)

Add a "Learning System" section to the final report:
```markdown
## Learning System
- Learnings captured: 12 (8 patterns, 3 mistakes, 1 discovery)
- Graduated to knowledge base: 2
  - P27: "Always run TypeScript compiler before tests" -> 01-proven-patterns.md
  - F33: "Don't import from barrel files in test mocks" -> 02-anti-patterns.md
- Knowledge base size: 45 entries (28 patterns, 12 anti-patterns, 5 process patterns)
- Most-cited pattern: P25 "Validate Zod schemas at module boundaries" (cited 14 times)
```

### Q8: Multi-Dimensional Scorecard with Anthropic-Style Rubric

**Current state:** Hive Mind's scorecard (`src/stages/scorecard.ts`) accumulates per-stage metrics and assigns a single letter grade (A/B/C/D/F) based on pass rate at the REPORT stage.

**Anthropic's rubric approach:** Turn subjective quality into concrete gradable terms. Each dimension has a clear definition that tells the evaluator exactly what to look for.

**Proposed multi-dimensional scorecard:**

| Dimension | What It Measures | How to Grade | Source Data |
|---|---|---|---|
| **Correctness** | Do ACs and ECs pass? | % pass rate | VERIFY results |
| **Code Quality** | Is the code well-structured? | Critical/major/minor finding counts | Code-reviewer report |
| **Regression Safety** | Did we break existing functionality? | Baseline test delta | Baseline vs. post-execute test results |
| **Compliance** | Does implementation match spec instructions? | % instructions with implementations | Compliance-reviewer report |
| **Architecture** | Do module boundaries hold? | Contract violations count | Integration-verifier report |
| **Efficiency** | How many retries were needed? | Retry ratio (attempts / stories) | Manager log |
| **Learning Velocity** | Did agents capture useful insights? | Learnings per story, graduation count | Memory/graduation data |

**Rubric format (Anthropic-style concrete terms):**

```
CORRECTNESS (weight: 30%)
  A: 95%+ ACs/ECs pass on first attempt
  B: 85%+ pass, all eventually pass after retry
  C: 70%+ pass after retry
  D: 50%+ pass
  F: <50% pass

CODE QUALITY (weight: 20%)
  A: 0 critical, 0 major findings
  B: 0 critical, <=2 major findings
  C: 0 critical, <=5 major findings
  D: 1 critical OR >5 major findings
  F: >1 critical findings

REGRESSION SAFETY (weight: 20%)
  A: All baseline tests still pass, no new warnings
  B: All baseline tests pass, minor new warnings
  C: 1-2 baseline tests regressed but non-critical
  D: 3+ baseline tests regressed
  F: Build broken or >10% baseline regression

COMPLIANCE (weight: 15%)
  A: 100% spec instructions implemented
  B: 90%+ implemented, remainder marked UNCERTAIN
  C: 80%+ implemented
  D: 60%+ implemented
  F: <60% implemented

EFFICIENCY (weight: 10%)
  A: Average <1.2 attempts per story
  B: Average <1.5 attempts
  C: Average <2.0 attempts
  D: Average <2.5 attempts
  F: Average 2.5+ attempts

LEARNING (weight: 5%)
  A: 2+ graduations, >1 learning per story
  B: 1+ graduation, >0.5 learnings per story
  C: >0.3 learnings per story
  D: Some learnings captured
  F: No learnings captured
```

**Implementation:**
1. Update `src/stages/scorecard.ts` to pass dimension data to scorecard agent
2. Update scorecard agent prompt in `src/agents/prompts.ts` with the rubric above
3. Scorecard agent outputs per-dimension grades + weighted overall grade
4. Include in both report-card.md and live dashboard

---

## Appendix: Proven Ways to Save Token Cost in GAN Loops

### The Cost Problem

Every iteration of a GAN loop costs tokens on both sides:

```
generator prompt + context + output
   + evaluator prompt + full app context + criteria + output
      = one iteration cost

x 5-15 iterations = expensive fast
```

Anthropic's runs: $124-200, 4-6 hours. Most of that is generator time. The evaluator is relatively cheap per pass. The waste is in the generator re-reading the same context on every iteration.

### 1. Compress the Handoff Artifact (Highest Impact)

The biggest token sink between iterations is passing full context forward. Instead of feeding the entire previous conversation, pass a structured summary artifact only.

**What goes in the artifact:**
- What was built (feature list, file list)
- What failed (evaluator findings, specific criteria scores)
- What the next agent must do (concrete next steps)
- What not to repeat (explicit anti-patterns from this run)

**What stays out:**
- Full conversation history
- Intermediate thinking
- Passing criteria details (only failures matter for next iteration)

Anthropic's harness used this explicitly: structured handoff files written by one agent, read by the next. This is what made context resets viable -- the handoff artifact replaced the full conversation.

**Hive Mind gap:** Agents get input files (not conversation history), which is good. But memory.md grows unboundedly and is passed in full. Step files + full source files also passed each iteration. Needs: memory summarization + diff-only source files on retry.

### 2. Fail Fast on the Evaluator (High Impact)

Don't run the evaluator to completion if a hard-fail criterion is hit early.

**Standard flow:** evaluator grades all 4-6 criteria, writes full report, then generator retries.

**Optimized flow:** evaluator grades in priority order (functionality first, design last). If functionality fails hard, stop grading, return minimal feedback, trigger generator retry immediately.

This cuts evaluator token spend per failed iteration by 40-70% depending on where in the criteria list failures cluster. Most early iterations fail on functionality, not design -- so you pay for design grading only when the basics are already passing.

**Hive Mind gap:** tester-exec and evaluator run ALL ACs/ECs to completion every time. Should short-circuit on first hard fail. Implement by adding priority ordering to ACs and a `--fail-fast` mode to the tester prompt.

### 3. Differential Evaluation (High Impact)

On iteration 2+, the evaluator should only re-grade what changed -- not the full app.

**Standard:** evaluator re-tests everything every pass.
**Optimized:** generator declares what changed in a diff manifest. Evaluator re-tests only those features plus a regression sample.

This requires the generator to output a structured change manifest:

```json
{
  "changed": ["sprite editor", "level export"],
  "unchanged": ["project dashboard", "play mode"],
  "new": ["animation system"]
}
```

Evaluator then skips unchanged areas unless a regression check flags them. Halves evaluator cost on later iterations where most of the app is already passing.

**Hive Mind gap:** VERIFY re-runs ALL ACs/ECs every iteration. If 8/10 ACs passed on iteration 1, iteration 2 still re-tests all 10. This is the biggest low-hanging fruit -- track per-AC pass/fail state and only re-test failures + a regression sample.

### 4. Tiered Model Selection (Medium-High Impact)

Not every agent in the loop needs the most expensive model.

| Agent | Task | Recommended Model |
|---|---|---|
| Planner | Spec expansion, one-time | Sonnet -- structured, not creative |
| Generator | Coding, iterative | Opus -- needs full capability |
| Evaluator | Criteria scoring, structured | Sonnet or Haiku -- grading is pattern-matching, not reasoning |

Anthropic's own cost breakdown showed the evaluator (QA) at $3-4 per pass vs $36-71 for the generator. The evaluator is already relatively cheap. But if running 10+ iterations, even the evaluator adds up -- downgrading to sonnet saves real money without significant quality loss on structured criteria grading.

**Test this:** run 3 evaluator passes with opus, 3 with sonnet, compare score consistency. If scores agree >90%, switch permanently.

**Hive Mind status:** Already done well -- implementer=opus, tester/evaluator=haiku, diagnostician/fixer=sonnet. No gap here.

### 5. Criteria Gating -- Only Evaluate What the Model Struggles With (Medium Impact)

Anthropic noted that as models improve, some criteria become unnecessary overhead. Claude 4.6 passed functionality checks that 4.5 needed evaluator help with.

**Practical approach:**
- Run 10 generations without the evaluator
- Measure which criteria the generator passes consistently on its own
- Remove those criteria from the evaluator loop
- Keep only the criteria where the generator's solo score is below your threshold

This is the "only increase complexity when needed" principle applied in reverse -- strip out criteria that are no longer load-bearing.

**Hive Mind gap:** All AC/EC criteria evaluated every run regardless of model capability. Worth measuring -- some ECs may be consistently passing with opus implementer and could be skipped.

### 6. Cap Iterations with a Quality Floor Check (Medium Impact)

Don't run 15 iterations by default. Set a dynamic stopping rule:

```
after each iteration:
  if score >= threshold: stop
  if score_delta < minimum_improvement: stop (diminishing returns)
  if iterations >= hard_cap: stop
```

Anthropic observed that scores plateau before the iteration cap. Running to the cap after plateau is pure waste. A minimum improvement delta of 5-10 points per iteration is a reasonable stopping signal.

**Hive Mind gap:** maxAttempts cap exists, but no score_delta check or diminishing-returns detection. Could save 1-2 iterations when fixer is spinning on the same failure.

### 7. Prompt Caching (Medium Impact, Easiest to Implement)

Anthropic's API supports prompt caching for static prompt content. In a GAN loop, the evaluator's system prompt (criteria, grading rubric, few-shot examples) is identical every iteration.

Cache that. It's the highest cache-hit-rate content in the whole loop.

**Estimated savings:** 80-90% token cost reduction on the cached portion of evaluator prompts. The cache hit rate is high because the criteria don't change between iterations -- only the app content does.

Implement with: `cache_control: {"type": "ephemeral"}` on the static portions of your system prompt.

**Hive Mind gap:** Each `spawnClaude()` builds prompt fresh via CLI invocation. Need to restructure to use Claude API directly with cache_control, or structure CLI prompts so stable content benefits from automatic caching.

### 8. Scope the Generator Context Window per Sprint (Lower Impact, Situational)

If you retain a sprint structure (Hive Mind's story model), each sprint's generator should only see:
- The spec for its sprint/story
- The handoff artifact from the previous sprint
- The evaluator's findings for its sprint

Not the full spec, not all prior sprint histories. This keeps per-sprint context lean and avoids the context anxiety pattern.

**Hive Mind status:** Already done -- each story only receives its step file + relevant source files, not the full spec. No gap here.

### Cost Reduction Summary

| Technique | Complexity | Est. Savings | Proven? | Hive Mind Gap? |
|---|---|---|---|---|
| Compress handoff artifact | Medium | 30-50% on context | Yes -- Anthropic harness | YES -- memory.md bloat |
| Fail fast on evaluator | Low | 40-70% on failed evals | Yes -- first principles | YES -- no short-circuit |
| Differential evaluation | Medium | 30-50% on later iterations | Yes -- software QA pattern | YES -- re-tests everything |
| Tiered model selection | Low | 20-40% on evaluator | Yes -- Anthropic cost breakdown | No -- already done |
| Criteria gating | Medium | 10-30% per run | Yes -- Anthropic iteration | YES -- worth measuring |
| Dynamic stopping rule | Low | 10-30% on wasted iterations | Yes -- Anthropic plateau observation | YES -- no delta check |
| Prompt caching | Low | 80-90% on static prompts | Yes -- Anthropic API feature | YES -- not implemented |
| Sprint-scoped context | Medium | 10-20% on generator | Yes -- Hive Mind pattern | No -- already done |

### ELI5

Imagine paying a chef and food critic to iterate on a dish. The waste happens when: the critic re-reads the entire menu each visit instead of just the changed dish; the chef re-explains the whole restaurant concept every time; they keep iterating after the dish is already good enough; and you hired a michelin-starred critic just to check if salt was added. Fix all four and you cut the bill by more than half without changing the quality of the final dish.

### Priority for Hive Mind Implementation

| # | Technique | Where to Apply | Effort | Impact |
|---|---|---|---|---|
| 1 | Differential evaluation | VERIFY loop -- only re-test failed ACs/ECs | Medium | HIGHEST -- halves evaluator cost |
| 2 | Fail fast on evaluator | VERIFY loop -- short-circuit on hard fail | Small | HIGH -- 40-70% on failed evals |
| 3 | Prompt caching | spawner.ts -- cache_control on static content | Medium | HIGH -- 80-90% on static prompts |
| 4 | Compress handoff | Memory summarization between waves | Medium | HIGH -- 30-50% on context |
| 5 | Dynamic stopping | VERIFY loop -- add score_delta check | Small | MEDIUM -- saves wasted iterations |
| 6 | Criteria gating | Measure which ECs opus passes solo | Medium | MEDIUM -- data-driven removal |

---

## Implementation Priority

| # | Improvement | Effort | Impact | Priority |
|---|---|---|---|---|
| 3 | Merge compliance into VERIFY GAN loop | Small | Simplifies pipeline | HIGH |
| 6 | GAN loop for SPEC critique (early exit) | Medium | Saves cost on good specs | HIGH |
| 8 | Multi-dimensional scorecard with rubric | Medium | Better quality visibility | HIGH |
| 1 | Memory summarization between waves | Small | Prevents context bloat | HIGH |
| 7 | Surface graduation stats in REPORT | Small | Shows learning system value | MEDIUM |
| 4 | STRATEGIC-ONLY spec rule | Small | Avoids over-specification | MEDIUM |
| 5 | Quick mode for simple tasks | Medium | UX improvement | MEDIUM |
| 7 | RAG + SQL memory (full) | Large | Better retrieval | LOW (v2) |
| 2 | Playwright verification | Large | Only for UI projects | LOW |
| 6 | GAN loop for REPORT validation | Small | Better reports | LOW |

---

## Appendix B: Making Hive Mind Scalable -- Simple Tasks to Long-Running Tasks

### The Problem

Hive Mind currently has one pipeline shape: full NORMALIZE -> BASELINE -> SPEC -> PLAN -> EXECUTE -> REPORT. Whether the PRD says "add a logout button" or "build a full-stack SaaS platform", the same 15+ agent spawns run. This is like requiring a building permit to hang a picture frame.

### The Solution: Tiered Harness Depth

Think of harness complexity as a dial, not a switch. Three tiers:

### Tier 1: Quick Mode (1-3 stories, <200 word PRD)

**ELI5:** A quick errand. One person does the work, one person checks it.

```
PRD --> PLAN (1 story) --> BUILD --> VERIFY --> done
```

**What's skipped:** NORMALIZE, BASELINE, SPEC, COMPLIANCE, SCORECARD, REPORT, waves
**What's kept:** PLAN (even a simple task needs a step file with ACs), BUILD + VERIFY GAN loop
**Agent count:** 4-6 (planner, AC-gen, implementer, tester, maybe fixer)
**Cost:** ~$2-5
**Time:** 5-15 minutes

**When to use:**
- PRD < 200 words
- Plan produces 1-3 stories
- Bug fixes, small features, refactors
- `hive-mind start --prd ./task.md --quick`

### Tier 2: Standard Mode (3-15 stories, 200-1000 word PRD)

**ELI5:** A home renovation. Multiple workers, a foreman, and an inspector.

```
PRD --> SPEC --> PLAN --> EXECUTE (waves) --> REPORT
```

**What's skipped:** NORMALIZE (auto-detect if needed), SCORECARD (optional)
**What's kept:** Full pipeline minus optional stages
**Agent count:** 20-40 depending on story count
**Cost:** ~$10-40
**Time:** 30 min - 2 hours

**When to use:**
- Most PRDs
- Default mode
- `hive-mind start --prd ./project.md`

### Tier 3: Long-Running Mode (15+ stories, 1000+ word PRD)

**ELI5:** Building a skyscraper. Full project management, quality assurance, inspections.

```
PRD --> NORMALIZE --> BASELINE --> SPEC (with evidence-gating) --> PLAN (with validator)
    --> EXECUTE (parallel waves, compliance, integration verify)
    --> REPORT (double-critique) --> SCORECARD (multi-dimensional)
```

**What's added:** Everything. All verification layers, multi-dimensional scorecard, integration testing
**Agent count:** 50-100+
**Cost:** ~$40-200
**Time:** 2-8 hours

**When to use:**
- Large PRDs, multi-module projects
- Production-grade output required
- `hive-mind start --prd ./platform.md --thorough`

### How to Implement Tiered Scaling

**Step 1: Auto-detect complexity (no user input needed)**

```typescript
function detectTier(prd: string, plan: ExecutionPlan): Tier {
  const wordCount = estimateWordCount(prd);
  const storyCount = plan.stories.length;
  const moduleCount = plan.modules?.length ?? 1;

  if (storyCount <= 3 && wordCount < 200) return 'quick';
  if (storyCount > 15 || moduleCount > 1 || wordCount > 1000) return 'thorough';
  return 'standard';
}
```

**Step 2: Configure pipeline stages per tier**

```typescript
const TIER_CONFIG = {
  quick: {
    normalize: false,
    baseline: false,
    spec: false,          // skip spec, go straight to plan
    compliance: false,
    integration: false,
    scorecard: false,
    report: 'minimal',    // just a summary, no double-critique
    maxWaves: 1,          // no parallelism needed for 1-3 stories
    maxVerifyAttempts: 2,
  },
  standard: {
    normalize: 'auto',    // only if PRD looks non-compliant
    baseline: true,
    spec: true,
    compliance: false,    // merged into VERIFY GAN loop (Q3)
    integration: false,   // only for multi-module
    scorecard: false,     // optional
    report: 'standard',
    maxWaves: Infinity,
    maxVerifyAttempts: 3,
  },
  thorough: {
    normalize: true,
    baseline: true,
    spec: true,           // with evidence-gating
    compliance: true,     // or merged into VERIFY
    integration: true,    // cross-module contracts
    scorecard: true,      // multi-dimensional rubric
    report: 'full',       // double-critique + retrospective
    maxWaves: Infinity,
    maxVerifyAttempts: 5,
  },
};
```

**Step 3: Allow user override**

```bash
# Auto-detect (default)
hive-mind start --prd ./task.md

# Force quick mode
hive-mind start --prd ./task.md --quick

# Force thorough mode
hive-mind start --prd ./task.md --thorough

# Mix and match
hive-mind start --prd ./task.md --skip-normalize --no-scorecard
```

### Scaling Strategy for Each Pipeline Component

| Component | Quick | Standard | Thorough |
|---|---|---|---|
| NORMALIZE | Skip | Auto-detect | Always |
| BASELINE | Skip | Run | Run |
| SPEC | Skip (plan from PRD directly) | Full (strategic-only) | Full + evidence-gating |
| PLAN | 1-pass planner | Planner + AC/EC gen | Planner + validator + AC/EC gen |
| EXECUTE waves | Sequential (1 story at a time) | Parallel waves | Parallel waves + compliance |
| VERIFY | 2 attempts max | 3 attempts (GAN loop) | 5 attempts (GAN loop + differential eval) |
| INTEGRATION | Skip | Skip | Per-module boundary |
| REPORT | Minimal summary | Standard report | Double-critique + retrospective |
| SCORECARD | Skip | Optional | Multi-dimensional rubric |
| LEARNING | Basic (memory.md) | Standard (memory + graduation) | Full (RAG + SQL + graduation stats) |

### What Makes This Scalable (Not Just "3 Modes")

The key insight from Anthropic's evolution: **as models improve, the interesting harness complexity moves**. Opus 4.6 made sprints unnecessary. Future models may make SPEC unnecessary for simple tasks.

**Design principle:** Each pipeline stage should be independently toggleable, not hardcoded into tiers. Tiers are just sensible defaults. The underlying system is a set of composable stages that can be mixed and matched.

This means:
1. Every stage has a `shouldRun(tier, config, context)` gate
2. Stages are stateless -- they read input artifacts, write output artifacts
3. Adding a new stage doesn't require modifying existing stages
4. Removing a stage doesn't break the pipeline (downstream reads from the last available artifact)

### Backwards Compatibility

Current behavior (`hive-mind start --prd ./task.md`) maps to `standard` tier. No breaking change. New flags (`--quick`, `--thorough`) are additive. Existing flags (`--skip-normalize`, `--skip-baseline`, `--no-dashboard`) continue to work as stage-level overrides.

---

## Verification
1. Review the analysis doc for accuracy against source code
2. Validate recommendations against actual file references
3. No code changes in this plan -- this is a research/analysis document
