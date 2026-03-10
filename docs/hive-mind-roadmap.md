# Hive Mind Improvement Roadmap: What It Takes to Be Truly Recommendable

> An honest, code-verified assessment of what Hive Mind must fix to earn a genuine recommendation over Superpowers and GSD.

---

## 1. How the Others Achieve Production Reliability

### Superpowers: "Isolation + Discipline"

Superpowers achieves reliability through **structural enforcement** — it makes it physically difficult to ship bad code:

| Technique | How It Works | Why It's Reliable |
|---|---|---|
| **Git worktree isolation** | Each task runs in its own branch copy | If it fails, main is untouched. Zero blast radius |
| **Mandatory TDD** | RED-GREEN-REFACTOR enforced in every coding skill | Tests exist before code — failures caught at birth |
| **Two-stage code review** | Spec compliance first, then code quality | Catches requirement drift before polish begins |
| **Bite-sized tasks** | 2-5 minute granularity with exact file paths | Easy to rollback any individual change |
| **Clean baseline verification** | Verifies test suite passes before starting work | Never builds on a broken foundation |
| **"Evidence over claims"** | Verification-before-completion philosophy | Agents must prove work, not just assert it |

**Superpowers is production-reliable because it prevents problems from compounding.** Each isolation layer (worktrees, TDD, review gates) catches failures at a different altitude. A bug in code is caught by TDD. A drift from spec is caught by review stage 1. A conflicting change is caught by worktree isolation. This layered defense means individual failures rarely cascade.

### GSD: "Fresh Context + Atomic Safety"

GSD achieves reliability through **context hygiene** and **atomic reversibility**:

| Technique | How It Works | Why It's Reliable |
|---|---|---|
| **Fresh 200K context per task** | Each subagent starts clean, loaded only with relevant state | Zero accumulated garbage — quality can't degrade over time |
| **Plan verification loops** | Plans checked against requirements, loop until they pass BEFORE execution | Bad plans never reach execution |
| **Atomic commits per task** | Each task gets its own commit | `git bisect` finds the exact failing task. Independent revertability |
| **Wave-based parallelism** | Dependency-aware execution: independent tasks parallel, dependent tasks wait | Fast execution without race conditions |
| **Auto debug agents** | On failure, spawns dedicated debug agents for root cause analysis | Failures are diagnosed, not just retried |
| **Fix plan generation** | Failed tasks produce verified fix plans ready for re-execution | Failures become actionable inputs, not dead ends |
| **Low orchestrator utilization** | Main context stays at 30-40% while subagents do heavy lifting | Orchestrator never degrades from context pressure |

**GSD is production-reliable because it treats context degradation as the root cause of unreliability.** By giving every task a fresh 200K context window and keeping the orchestrator lean, quality stays consistent from task 1 to task 50. The atomic commit model means any failure can be surgically reverted without affecting other work.

### Hive Mind: "Checkpoint + Escalation" (Currently Incomplete)

Hive Mind has **strong foundations** but **critical gaps**:

| What Works | What's Missing |
|---|---|
| Stage-level checkpoints (approve-spec, approve-plan, verify, ship) | No error recovery within stages |
| Fix escalation (fixer → diagnostician → fixer on retry) | No cost controls or budget awareness |
| Memory graduation (session → knowledge base) | No parallelism (sequential story execution) |
| Execution plan persistence (story status tracking) | No provider abstraction (Claude-only) |
| Critic isolation (critics only see drafts, not research) | No configuration flexibility (12+ hardcoded constants) |

**Can Hive Mind achieve the same reliability?** Yes. The architecture supports it — the gaps are implementation gaps, not design gaps. The checkpoint system, story status tracking, and execution plan persistence are solid foundations. What's missing is the "last mile" of robustness.

---

## 2. P0 — Critical (Must Fix to Be Usable in Production)

### 2.1 Exponential Backoff + Retry

**File**: `src/agents/spawner.ts:47-57`

**Current behavior**:
```typescript
export async function spawnAgentWithRetry(
  config: AgentConfig,
  maxRetries: number = 1,  // Only 1 retry — 2 attempts total
): Promise<AgentResult> {
  let lastResult: AgentResult | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await spawnAgent(config);
    if (lastResult.success) return lastResult;
    // No delay between retries. No backoff. No jitter.
  }
  return lastResult!;
}
```

**Problem**: Transient failures (network timeouts, rate limits, API blips) get only 1 immediate retry. No backoff means retries hit the same failure. No jitter means parallel retries all fire simultaneously.

**Fix**:
- Default `maxRetries` to 3 (4 attempts total)
- Add exponential backoff: 1s, 2s, 4s, 8s between retries
- Add ±20% jitter to prevent thundering herd
- Make all values configurable via config file (see 2.3)

**How GSD solves this**: Fresh context per retry — each retry is a clean slate, not a repeat of the same degraded context.

**Effort**: Small (spawner.ts only, ~30 lines changed)

---

### 2.2 Graceful Error Recovery

**File**: `src/orchestrator.ts:200-266`

**Current behavior**:
```typescript
try {
  await runBuild(story, hiveMindDir);
  const verifyResult = await runVerify(story, hiveMindDir, planPath);
  await runLearn(story, hiveMindDir);
} catch (err) {
  console.error(`Error executing story ${story.id}:`, err);
  plan = updateStoryStatus(plan, story.id, "failed");
  saveExecutionPlan(planPath, plan);
  // Continues to next story, but error details are LOST
}

// Later...
const allFailed = plan.stories.every((s) => s.status === "failed");
if (allFailed) {
  console.error("All stories failed. Halting.");  // Dead end
}
```

**Problems**:
1. Error details only go to console.error — not persisted in execution plan
2. No way to resume from a specific story (`hive-mind resume --from US-03`)
3. No option to skip failed stories (`--skip-failed`)
4. `process.exit(1)` in 5+ places (`index.ts:36,64,70,79,88`, `orchestrator.ts:36,90`) — no graceful shutdown

**Fix**:
- Add `errorMessage` and `lastFailedStage` fields to story type in `src/types/execution-plan.ts`
- Persist error details on catch, not just status change
- Add `--from <story-id>` and `--skip-failed` CLI flags in `src/index.ts`
- Replace `process.exit(1)` with thrown errors caught at top level

**How GSD solves this**: Failed tasks produce verified fix plans that become inputs for re-execution. Failures are structured data, not log noise.

**Effort**: Medium (orchestrator.ts + index.ts + execution-plan.ts)

---

### 2.3 Config File Support

**Currently hardcoded constants** (no config file exists):

| Constant | File | Line | Value |
|---|---|---|---|
| Agent timeout | `src/agents/spawner.ts` | 8 | `600_000` (10 min) |
| Shell timeout | `src/utils/shell.ts` | 18 | `120_000` (2 min) |
| Tool detect timeout | `src/tooling/detect.ts` | 45 | `30_000` |
| Max retries | `src/agents/spawner.ts` | 49 | `1` |
| Memory word cap | `src/memory/memory-manager.ts` | 4 | `400` |
| Graduation threshold | `src/memory/memory-manager.ts` | 5 | `300` |
| KB size warning | `src/stages/report-stage.ts` | 17 | `5000` words |
| Model assignments | `src/agents/model-map.ts` | 3-25 | Static map (20 agents) |
| Checkpoint filename | `src/state/checkpoint.ts` | 6 | `".checkpoint"` |
| Memory sections | `src/memory/memory-manager.ts` | 7-16 | Fixed 4 sections |
| Role keywords | `src/stages/plan-stage.ts` | 40-51 | Hardcoded arrays |

**Fix**: Create `src/config/loader.ts` that reads `.hivemindrc.json` from the project root. All hardcoded values become defaults overridable by config. Example:

```json
{
  "agents": {
    "timeout": 600000,
    "maxRetries": 3,
    "backoff": { "base": 1000, "factor": 2, "jitter": 0.2 }
  },
  "memory": {
    "wordCap": 400,
    "graduationThreshold": 300,
    "kbSizeWarning": 5000
  },
  "models": {
    "implementer": "opus",
    "critic": "sonnet",
    "tester": "haiku"
  }
}
```

**How GSD solves this**: Configuration lives in project-level state files, not source code.

**Effort**: Medium (new file + update all constant references across ~8 files)

---

### 2.4 Structured Output Parsing

**File**: `src/reports/parser.ts`

**Current behavior**: A 5-level regex cascade that tries increasingly desperate patterns to extract PASS/FAIL from agent output. When all fail, it defaults to FAIL with `"default"` confidence.

```
Level 1: Explicit heading match (## Status: PASS)
Level 2: Inline "Status:" match
Level 3: Summary table heuristic
Level 4: Standalone PASS/FAIL word
Level 5: Default → FAIL (with "default" confidence)
```

**Problem**: Agents produce natural language. Regex parsing of natural language is inherently fragile. A report that says "this did NOT PASS" would match Level 4 as PASS.

**Fix**:
- Add a JSON status block requirement to agent prompts: `<!-- STATUS: {"result": "PASS", "details": "All 5 tests passing"} -->`
- Parse JSON block first (Level 0). Fall back to existing regex cascade only if JSON missing.
- Log a warning when falling back to regex, so operators know which agents need prompt updates.

**How Superpowers solves this**: Structured verification steps with explicit pass/fail criteria and shell commands that return exit codes.

**Effort**: Medium (parser.ts + agent prompt updates in prompts.ts)

---

## 3. P1 — High Priority (Needed for Production Confidence)

### 3.1 Cost/Token Tracking

**Files**: `src/agents/spawner.ts`, new `src/utils/cost-tracker.ts`

**Current state**: Zero token tracking. `estimateTokens()` exists in `src/utils/token-count.ts` but is only used for knowledge base size warnings — never for actual cost tracking.

**Fix**:
- Parse Claude CLI output for token usage (if available via `--output-format json`)
- Add `tokensUsed` field to `AgentResult` interface
- Log tokens to `manager-log.jsonl` with each agent invocation
- Calculate and display cumulative cost at end of each stage
- Add `--budget <dollars>` CLI flag to halt when threshold exceeded
- Add `--dry-run` flag to estimate cost without executing

**Competitive advantage**: Neither Superpowers nor GSD tracks costs — they're prompt libraries/meta-prompts, not orchestrators. A Hive Mind run spawns 25-35+ agent calls per story. Cost tracking would be a **unique differentiator** for production use.

**Effort**: Medium

---

### 3.2 Parallel Story Execution (Wave-Based)

**File**: `src/orchestrator.ts:193-269`

**Current behavior**: Stories execute one at a time in a sequential loop:
```typescript
let story = getNextStory(plan);  // Gets FIRST not-started story
while (story) {
  // ... execute story synchronously
  story = getNextStory(plan);
}
```

**Blockers to parallelism**:
1. **Shared memory.md** — `appendToMemory()` in `memory-manager.ts:30-44` reads entire file, modifies, writes. No locking.
2. **Shared execution-plan.json** — Concurrent reads/writes would corrupt the JSON.
3. **Unused dependencies field** — `execution-plan.ts:9` has `dependencies: string[]` but it's never read or validated.

**Fix**:
- Use the existing `dependencies` field to build a dependency graph
- Group stories into waves (topological sort): wave 1 = no dependencies, wave 2 = depends on wave 1, etc.
- Execute each wave with `Promise.all()`
- Add file-level mutex for memory.md writes (or queue writes to a single writer)
- Use atomic read-modify-write for execution plan updates

**How GSD solves this**: Wave-based parallelism with dependency tracking. Independent tasks run in parallel, dependent tasks wait. Exactly what Hive Mind's architecture already supports but doesn't implement.

**Effort**: Large (orchestrator.ts + memory-manager.ts + execution-plan.ts)

---

### 3.3 Provider Abstraction

**File**: `src/agents/spawner.ts:15-18`

**Current behavior**:
```typescript
const result = await runShell(
  `claude --print --dangerously-skip-permissions --model ${model} "${escapedPrompt}"`,
  { timeout: AGENT_TIMEOUT },
);
```

Hardcoded to Claude CLI. No way to use Anthropic API directly, OpenAI models, local models, or any other provider.

**Fix**:
```typescript
interface IAgentProvider {
  spawn(config: AgentConfig): Promise<AgentResult>;
  isAvailable(): Promise<boolean>;
}
```

Ship two implementations:
1. `ClaudeCLIProvider` — Current behavior, refactored
2. `AnthropicAPIProvider` — Direct API calls (no CLI dependency)

Config file selects provider:
```json
{ "provider": "anthropic-api", "apiKey": "${ANTHROPIC_API_KEY}" }
```

**How Superpowers solves this**: Tool-agnostic by design — skills work across Claude Code, Cursor, Codex, OpenCode.

**Effort**: Large (new interface + refactor spawner + provider implementations)

---

### 3.4 Mid-Story Checkpointing

**File**: `src/stages/execute-verify.ts:42-147`

**Current behavior**: Stories are all-or-nothing. If the pipeline crashes on attempt 2 of 3 during the VERIFY sub-stage, the entire story must restart from BUILD.

**Fix**:
- Add `currentAttempt`, `lastCompletedSubStage` fields to story type
- Persist after each sub-stage (BUILD, VERIFY, REFACTOR, COMMIT)
- On resume, skip completed sub-stages within a story

**How GSD solves this**: Atomic task-level progress tracking in STATE.md.

**Effort**: Medium

---

## 4. P2 — Medium Priority (Polish for Competitive Edge)

### 4.1 Knowledge Base Deduplication

**File**: `src/memory/graduation.ts`

**Current**: Entries graduate from memory.md to knowledge-base/ without checking if a similar pattern already exists. Over many runs, the KB accumulates duplicates.

**Fix**: Before graduating, fuzzy-match the first sentence against existing KB entries. Merge or skip duplicates.

**Effort**: Small

---

### 4.2 CLI Help & Discoverability

**File**: `src/index.ts`

**Current**: No `--help` flag, no `--version`, no usage documentation accessible from the CLI.

**Fix**: Add `--help` with usage docs, `--version` flag, `--dry-run` to estimate costs.

**Effort**: Small

---

### 4.3 Plan Stage Parallelism

**File**: `src/stages/plan-stage.ts:103-122`

**Current**: Role agents (analyst, architect, security, tester-role, reviewer) spawn sequentially in a for-loop, even though they are fully independent — each reads the spec and writes to its own report file.

**Fix**: Replace the sequential for-loop with `Promise.all()`. These agents don't depend on each other.

**Effort**: Small (plan-stage.ts only)

---

### 4.4 Test Coverage for Critical Paths

**File**: `src/agents/spawner.ts` (0 tests currently)

**Current**: The agent spawner — the most critical component in the entire system — has zero test coverage.

**Fix**: Unit tests for retry logic, integration tests with a mock Claude CLI, e2e test with a sample PRD.

**Effort**: Medium

---

## 5. After These Changes — Can Hive Mind Be Recommended?

### Maturity Progression

| Dimension | Today | After P0 | After P0+P1 | After All |
|---|---|---|---|---|
| **Reliability** | Fragile — halts on failures | Usable with monitoring | Production-grade | Production-grade |
| **Cost awareness** | None | Manual tracking | Budget controls + tracking | Budget + dry-run |
| **Parallelism** | Sequential only | Sequential only | Wave-based stories | Wave-based + plan stage |
| **Provider flexibility** | Claude CLI only | Claude CLI only | Multi-provider | Multi-provider |
| **Resumability** | Stage-level only | Stage + story-level | Stage + story + mid-story | Full |
| **Recommendation** | "Interesting, but not yet" | "Yes, with caveats" | "Yes, for complex projects" | "Recommend over others for audit-heavy work" |

### When to Recommend Each Framework (Post-Improvements)

| Scenario | Best Choice | Why |
|---|---|---|
| **Solo dev, quick feature** | GSD | Fresh context per task, minimal ceremony |
| **Portable dev habits across tools** | Superpowers | Tool-agnostic skills, works everywhere |
| **Complex multi-story project with audit needs** | **Hive Mind** | 21 specialists, memory graduation, full audit trail |
| **Team wanting to enforce TDD** | Superpowers | TDD baked into workflow, not optional |
| **Long-running autonomous pipeline** | **Hive Mind** (after P0+P1) | Checkpoints, escalation, cost controls |

### The Bottom Line

**After P0 only (4 changes)**: Hive Mind becomes usable for production with active monitoring. You can trust it not to silently fail, and you can configure it for your project's constraints.

**After P0+P1 (8 changes)**: Hive Mind becomes the strongest choice for complex, multi-story projects that need audit trails and institutional learning. Cost tracking and wave-based parallelism would be unique advantages no other framework offers.

**After all 12 changes**: Hive Mind would be genuinely recommendable over both Superpowers and GSD for its core use case — structured, multi-story, audit-heavy projects where institutional memory matters. It would still NOT be the best choice for quick solo tasks (GSD wins) or portable dev habits (Superpowers wins), but it would own its niche convincingly.

The architecture is sound. The innovations are real (memory graduation, critic isolation, fix escalation). What's missing is the production hardening that turns a promising prototype into a tool you'd bet your deploy pipeline on.
