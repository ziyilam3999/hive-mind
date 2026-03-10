# AI-Assisted Development Frameworks: An ELI5 Comparison

Six frameworks that help AI agents write better code — each with a very different philosophy. Three are **orchestrators** (they run agents for you), and three are **spec layers** (they structure your thinking before agents build).

## What Are They?

### Orchestrators — They Run the Show

**Hive Mind** is like a **factory with 21 specialist workers on an assembly line**. You hand it a product requirements document (PRD), and a foreman (the orchestrator) routes work through researchers, architects, coders, testers, and fixers — each doing one job well. A quality inspector (you, the human) signs off at every station before work moves forward.

**Superpowers** is like a **cookbook that any AI chef must follow**. It doesn't build things itself — instead, it's a library of "skills" (structured prompts and workflows) that teach AI agents how to brainstorm, plan, write tests first, review code, and finish branches properly. Any kitchen can use it: Claude Code, Cursor, Codex, or OpenCode.

**GSD (Get Shit Done)** is like a **project manager who grabs a fresh notepad for every task**. Its big insight: AI quality degrades as conversations get longer ("context rot"). So GSD spawns a brand-new AI worker with a clean 200K-token context for each task, while keeping a master binder of project state so nothing gets lost between tasks.

### Spec Layers — They Structure the Thinking

**OpenSpec** is like a **shared checklist before remodeling a room**. Before anyone picks up a hammer, you write down exactly what's being added, modified, or removed — agree on it — then start work. When done, file it away. It's the lightest-weight option, designed for iterating on code that already exists.

**Spec-Kit** (GitHub) is like a **universal blueprint format that any contractor can read**. First you write a "constitution" (project principles), then you spec the feature, plan the tech, break it into tasks, and build. The blueprints work whether you hire Claude, Copilot, Gemini, Cursor, or any of 18+ AI agents. It's the most portable option.

**Kiro** (AWS) is like an **architect who draws blueprints, picks materials, and schedules contractors automatically**. You describe what you want in plain English, and the IDE generates formal requirements (in EARS notation), designs the architecture, creates a task checklist, and builds it step by step. But you can only use this one architect — it's a full IDE, not a toolkit.

## How Do They Work?

### Hive Mind — 4 Stages

```
PRD → SPEC → PLAN → EXECUTE → REPORT
```

1. **SPEC**: A 7-step pipeline turns your PRD into a polished technical spec (research → draft → critique → refine → critique again → finalize). Critics are kept isolated — they only see the draft, not how it was made.
2. **PLAN**: Role-based agents (security, architecture, testing) analyze the spec. A synthesizer combines their reports into user stories with self-contained step files.
3. **EXECUTE**: Each story goes through build → test → fix loops (up to 3 attempts, escalating from quick-fix to root-cause diagnosis).
4. **REPORT**: A retrospective captures learnings and graduates mature patterns into a persistent knowledge base.

### Superpowers — 7 Stages

```
Brainstorm → Git Worktrees → Plan → Subagents → TDD → Review → Finish
```

1. **Brainstorm**: Explore the problem space before touching code.
2. **Git Worktrees**: Create isolated branches so experiments don't collide.
3. **Plan**: Write structured implementation plans.
4. **Subagents**: Delegate heavy work to parallel AI workers.
5. **TDD**: Mandatory RED-GREEN-REFACTOR cycle — tests before code.
6. **Review**: Two-stage code review (spec compliance, then code quality).
7. **Finish**: Clean up branches, finalize commits.

### GSD — 6 Stages

```
Initialize → Discuss → Plan → Execute → Verify → Complete
```

1. **Initialize**: Guided questions capture your vision; parallel research agents explore the problem.
2. **Discuss**: Identify gray areas and preferences before building.
3. **Plan**: Create atomic task plans (max 3 tasks per plan) in XML format.
4. **Execute**: Run tasks in dependency-aware "waves" — independent tasks run in parallel, dependent ones wait.
5. **Verify**: Walk through deliverables; auto-diagnose failures.
6. **Complete**: Tag a release, move to the next phase.

### OpenSpec — 3 Phases

```
Idea → Propose → Apply → Archive
```

1. **Propose**: `/opsx:propose "add dark mode"` creates a change folder with a proposal, specs, design doc, and task checklist. Uses **delta markers** (ADDED / MODIFIED / REMOVED) to track what changes relative to existing code — purpose-built for brownfield iteration.
2. **Apply**: `/opsx:apply` hands the spec to your AI coding assistant to implement the planned tasks.
3. **Archive**: `/opsx:archive` moves the completed change to a timestamped archive folder, keeping the workspace clean.

A fast-forward command (`/opsx:ff`) lets you skip ceremony for straightforward changes.

### Spec-Kit — 5 Phases

```
Constitution → Specify → Plan → Tasks → Implement
```

1. **Constitution**: Write a foundational document capturing your project's principles and constraints. This governs all future specs — like a company handbook that every contractor must follow.
2. **Specify**: `/speckit.specify` defines requirements and user stories for a specific feature.
3. **Plan**: `/speckit.plan` generates the technical architecture and tech stack choices.
4. **Tasks**: `/speckit.tasks` breaks the plan into granular, actionable work items linked back to requirements.
5. **Implement**: Execute tasks via your chosen AI agent.

### Kiro — 3 Phases (Two Workflow Variants)

```
Prompt → Requirements (EARS) → Design → Tasks → Implement
```

1. **Requirements**: Your natural language prompt becomes formal user stories with acceptance criteria in EARS notation ("WHEN [condition] THE SYSTEM SHALL [behavior]"). Edge cases and constraints that developers typically miss are surfaced automatically.
2. **Design**: Kiro analyzes your codebase and generates architecture, components, data models, and interface definitions.
3. **Tasks**: A dependency-sequenced implementation checklist with sub-tasks, each linked to requirements. Task-by-task execution is recommended over "execute all."

Two starting points: **requirements-first** (behavior → architecture) or **design-first** (architecture → requirements).

## Who Does the Work?

**Hive Mind** has **21 typed agents** organized into three tiers by model capability:
- *Opus* (smartest): Researcher, Spec-drafter, Architect, Analyst, Implementer, Synthesizer
- *Sonnet* (balanced): Critic, Reviewer, Refactorer, Diagnostician, Fixer, Retrospective
- *Haiku* (fastest): Tester, Evaluator, Learner, Reporter

Each agent sees only what it needs — implementers get a self-contained step file, critics get only the draft.

**Superpowers** has **no fixed agents**. Instead, it provides ~50 composable skills (structured prompts) that any AI tool can load. The AI agent picks the right skill for the moment. This makes it tool-agnostic but means there's no built-in orchestration.

**GSD** spawns **fresh subagents per task**. Each gets a clean 200K-token context loaded with only the relevant slice of project state. The main session stays lightweight and responsive because heavy work happens in throwaway subprocesses.

**OpenSpec** has **no agents of its own**. It's a spec layer — your existing AI coding assistant (Copilot, Claude Code, Cursor, etc.) does the work. OpenSpec just ensures it follows a spec before writing code. Works with 20+ assistants via slash commands.

**Spec-Kit** is the same model — **no built-in agents**. It provides slash commands that any of 18+ supported AI agents execute. The agent reads the spec artifacts and follows the process. This makes it the most portable format: write specs once, any agent can implement.

**Kiro** has **built-in agentic AI** powered by Claude. The IDE itself runs the agents — you don't bring your own. Uniquely, Kiro also has **agent hooks**: event-driven automations that trigger when you save or create files (e.g., save a React component → auto-update its test file; modify an API endpoint → auto-refresh the README; commit → scan for leaked credentials).

## How Do They Remember?

**Hive Mind** maintains a `memory.md` file capped at 400 words, organized into PATTERNS (reusable techniques), MISTAKES (pitfalls to avoid), and DISCOVERIES (project-specific findings). When memory fills up, mature entries "graduate" into a persistent `knowledge-base/` directory — like promoting notes from a scratch pad into a reference manual.

**Superpowers** relies on **git itself** as memory. Worktrees (isolated branch copies) preserve experiments. Plans and decisions live in commit history and branch structure. There's no cross-session learning system.

**GSD** keeps a family of state files: `PROJECT.md` (vision), `REQUIREMENTS.md` (scope), `ROADMAP.md` (phases), and `STATE.md` (decisions, blockers, current position). These persist across sessions and get loaded into each fresh subagent's context as needed.

**OpenSpec** persists change folders in `openspec/changes/` with full proposal, specs, design, and tasks. Completed changes archive with timestamps. But specs **don't self-update during implementation** — if the agent modifies its approach mid-task, the proposal doesn't automatically reflect the change. No cross-project learning.

**Spec-Kit** stores feature specs in `.speckit/` directories. The **constitution** document carries project-level principles across all features — the closest thing to institutional memory in the spec-layer category. But there's no cross-session learning beyond what's in the spec files.

**Kiro** keeps specs (requirements.md, design.md, tasks.md) version-controlled in-repo alongside code. Agent hook configurations persist. Specs are designed for team sharing. But there's no cross-project learning — each project starts from scratch.

## Where Do Humans Fit In?

**Hive Mind**: **Mandatory checkpoints at every stage.** You must approve the spec, approve the plan, verify execution results, and approve shipping. You can reject with feedback to rerun any stage. The system won't proceed without you.

**Superpowers**: **Lighter touch.** Skills enforce structural discipline (you can't skip TDD or code review), but there's no formal approval gate. Humans stay in control by reviewing branches and pull requests.

**GSD**: **Flexible involvement.** The Discuss stage captures your preferences upfront. Verify checks your work after execution. A "quick mode" lets you skip the full ceremony for small tasks.

**OpenSpec**: **Lightest touch.** Review the proposal before applying — that's it. You can iterate on specs freely, edit anything directly. No mandatory gates. The fast-forward command (`/opsx:ff`) lets you skip even the review for straightforward changes.

**Spec-Kit**: **Review at each phase transition** (specify → plan → tasks → implement). Most customizable — all artifacts live in your workspace and you can edit them directly. The constitution ensures project-level consistency without per-feature overhead.

**Kiro**: **Review at each phase** (requirements → design → tasks). Task-by-task execution is recommended for quality. Agent hooks automate routine oversight — e.g., auto-updating tests on component save, scanning for credentials on commit — reducing manual review burden.

## Strengths and Weaknesses

### Hive Mind
- **Strengths**: Deep specialization (21 agents), persistent learning across projects, full audit trail, iterative fix loops with escalation, human oversight at every stage
- **Weaknesses**: Only works with Claude models, heavier ceremony and setup, higher token cost per run (many agents = many API calls), sequential story execution

### Superpowers
- **Strengths**: Works across multiple AI tools, enforces good habits (TDD, code review), lightweight and composable, large community (50K+ stars), easy to adopt incrementally
- **Weaknesses**: No built-in orchestration (relies on the host tool), no persistent memory across sessions, skill quality can vary, less structured for complex multi-story projects

### GSD
- **Strengths**: Solves context rot elegantly, wave-based parallelism, atomic commits enable git bisect, low ceremony for solo builders, supports multiple AI tools
- **Weaknesses**: Max 3 tasks per plan limits complex work, markdown state files can drift out of sync, less agent specialization, no cross-project learning

### OpenSpec
- **Strengths**: Lightest spec ceremony (~250 lines per spec), brownfield-first with delta markers (ADDED/MODIFIED/REMOVED), works with 20+ AI assistants, free and MIT licensed, fast-forward mode for simple changes
- **Weaknesses**: Specs don't self-update during implementation, no orchestration or test/fix loops, no cross-project learning, no agent specialization, no built-in test verification

### Spec-Kit
- **Strengths**: Most portable format (18+ agents), constitution concept for project-level principles, cross-feature analysis and systems thinking, fully customizable artifacts, free and MIT licensed
- **Weaknesses**: Heavy spec output (~800 lines), best for greenfield only, no orchestration, no persistent learning, no test/fix loops, early stage (v0.1.4)

### Kiro
- **Strengths**: Full IDE integration, EARS notation for unambiguous requirements, agent hooks for automated routine tasks, automated spec generation, design-first or requirements-first flexibility
- **Weaknesses**: IDE lock-in (must use Kiro, can't use your own editor), Claude-only models, $20/month after preview, overkill for small tasks ("sledgehammer to crack a nut"), no cross-project learning

## Summary Comparison Table

### Orchestrators

| Aspect | Hive Mind | Superpowers | GSD |
|--------|-----------|-------------|-----|
| **One-liner** | Factory with 21 specialists | Portable skills cookbook | Fresh-notepad project manager |
| **Type** | CLI orchestrator | Prompt/skill library | CLI orchestrator |
| **Workflow stages** | 4 (SPEC/PLAN/EXECUTE/REPORT) | 7 (Brainstorm through Finish) | 6 (Initialize through Complete) |
| **Agent model** | 21 typed agents, 3 model tiers | Composable skills, no fixed agents | Subagents with fresh 200K context |
| **Memory** | memory.md + knowledge base graduation | Git worktrees/branches | PROJECT.md + STATE.md family |
| **Human checkpoints** | Mandatory at every stage | Code review gates | Verify stage + quick mode |
| **TDD / Testing** | Tester + Evaluator agents | Mandatory RED-GREEN-REFACTOR | Task verification step |
| **Tool support** | Claude CLI only | Claude Code, Cursor, Codex, OpenCode | Claude Code, OpenCode, Gemini CLI, Codex |
| **Parallelism** | Sequential stories | Git worktree parallelism | Wave-based dependency-aware |
| **Cost** | ~$3-15/story (API calls) | Free (MIT) | Free (MIT) |
| **Best for** | Complex multi-story projects with audit needs | Teams wanting portable dev habits | Solo builders wanting zero context rot |

### Spec Layers

| Aspect | OpenSpec | Spec-Kit (GitHub) | Kiro (AWS) |
|--------|---------|-------------------|------------|
| **One-liner** | Lightweight checklist before remodeling | Universal blueprint format | Auto-generating architect IDE |
| **Type** | CLI spec layer | CLI spec layer | Full IDE |
| **Workflow stages** | 3 (Propose/Apply/Archive) | 5 (Constitution through Implement) | 3 (Requirements/Design/Tasks) |
| **Agent model** | None — uses your existing AI assistant | None — uses your existing AI agent | Built-in Claude agents + hooks |
| **Memory** | Change folders + archive | .speckit/ + constitution doc | In-repo specs, version-controlled |
| **Human checkpoints** | Review proposal before apply | Review at each phase transition | Review at each phase |
| **TDD / Testing** | No built-in test verification | No built-in test verification | Optional test generation in tasks |
| **Tool support** | 20+ AI assistants | 18+ AI agents | Kiro IDE only (Claude models) |
| **Parallelism** | N/A (spec layer) | N/A (spec layer) | N/A (sequential tasks) |
| **Cost** | Free (MIT) | Free (MIT) | $20/month after preview |
| **Best for** | Brownfield iteration on existing code | Greenfield features, portable specs | Greenfield, AWS-native teams |

### Cross-Category Comparison

| Dimension | Hive Mind | Superpowers | GSD | OpenSpec | Spec-Kit | Kiro |
|-----------|-----------|-------------|-----|---------|----------|------|
| **Spec generation** | 7-agent pipeline | Manual planning skill | Discussion + plan stage | Manual with templates | Manual with constitution | Auto-generated (EARS) |
| **Code execution** | Build + test + fix loops | TDD cycle | Wave-based task execution | Delegated to AI assistant | Delegated to AI agent | Task-by-task via IDE |
| **Cross-project learning** | Yes (memory graduation) | No | No | No | No | No |
| **Vendor lock-in** | Claude only | None | None | None | None | AWS/Claude only |
| **Brownfield support** | Yes | Yes | Yes | Best (delta markers) | Weak (greenfield focus) | Weak (greenfield focus) |
| **Setup time** | 30 min | 5 min | 10 min | 5 min | 10 min | Download IDE |

## Which One Should You Pick?

### If you need an orchestrator (runs agents for you):

- **Pick Hive Mind** if you want a full assembly line with specialist agents, mandatory human sign-off at every stage, and a system that learns from its own mistakes across projects.
- **Pick Superpowers** if you want portable development discipline (TDD, code review, structured planning) that works regardless of which AI tool your team uses.
- **Pick GSD** if you're a solo builder who wants fresh AI context on every task, minimal ceremony, and dependency-aware parallel execution.

### If you need a spec layer (structures thinking before building):

- **Pick OpenSpec** if you're iterating on existing code and want the lightest possible spec ceremony — agree on what changes, build it, archive it. Delta markers make it brownfield-native.
- **Pick Spec-Kit** if you need a portable spec format that any of 18+ AI agents can follow, with a constitution document ensuring project-level consistency across features.
- **Pick Kiro** if you want an all-in-one IDE where specs are auto-generated in formal EARS notation and agent hooks automate routine tasks — and you don't mind being locked into the Kiro editor and Claude models.

### Mix and match

These categories complement each other. You could use **OpenSpec or Spec-Kit** for structured spec creation, then feed those specs into **Hive Mind** or **GSD** for orchestrated execution. Superpowers' skills could complement any combination.

---

## Where Hive Mind Has an Edge

These are things Hive Mind does that none of the other five frameworks offer — verified against the actual source code.

### 1. Memory That Learns and Graduates

Imagine a student who takes notes on a scratch pad (capped at 400 words). When a note has been proven useful across multiple projects, it gets "promoted" into a permanent reference book. That's Hive Mind's **memory graduation system**.

- Session memory (`memory.md`) is organized into PATTERNS, MISTAKES, and DISCOVERIES
- When memory fills up, entries that cite 2+ user stories and have been stable across runs automatically graduate to a persistent `knowledge-base/` directory
- Entries with hardcoded paths are filtered out (they wouldn't generalize)
- Graduated patterns get numbered series IDs (P25+, F31+) for tracking

None of the other five frameworks do anything like this. Superpowers has no persistent memory. GSD's state files persist but don't self-curate. OpenSpec archives change folders but doesn't learn from them. Spec-Kit's constitution is static — you write it, it doesn't grow. Kiro's specs are version-controlled but project-scoped. This is genuine **institutional learning** — the system gets smarter over time.

*Source: `src/memory/graduation.ts:42-51`, `src/memory/memory-manager.ts`*

### 2. Critics Who Can't Be Biased

In most AI pipelines, the reviewer sees everything the writer saw — so they tend to agree. Hive Mind deliberately **blindfolds its critics**. During the SPEC stage, the critic agent receives ONLY the draft document. It never sees the research report, the justification, or the PRD that produced the draft. This is labeled the "P5/F9 isolation" principle.

Think of it like a blind taste test. The chef (spec-drafter) knows the recipe. The food critic (critic agent) only tastes the dish. This prevents groupthink and catches issues that everyone upstream missed.

*Source: `src/stages/spec-stage.ts:86-96`, `src/agents/prompts.ts:68-73`*

### 3. Smart Fix Escalation (Don't Call the Doctor for a Paper Cut)

When code fails a test, Hive Mind doesn't immediately bring out the heavy artillery:

- **Attempt 1**: A lightweight "fixer" agent tries a quick patch (cheap, fast)
- **Attempt 2+**: A "diagnostician" agent performs root-cause analysis first, reading ALL prior fix attempts and failure reports. Only then does the fixer apply a diagnosis-guided fix

This is like going to the pharmacy for a headache (attempt 1) vs. getting a full diagnostic workup when the headache persists (attempt 2). It saves tokens on easy bugs and escalates intelligently on hard ones.

*Source: `src/stages/execute-verify.ts:166-206`*

### 4. Right Model for the Right Job

Hive Mind assigns AI models by task complexity, not uniformly:

| Tier | Model | Agents | Why |
|------|-------|--------|-----|
| Heavy thinking | Opus | Researcher, Implementer, Architect, Synthesizer | These need deep reasoning |
| Precise analysis | Sonnet | Critic, Diagnostician, Fixer, Refactorer | These need careful but focused work |
| Fast execution | Haiku | Tester, Evaluator, Reporter, Learner | These run commands and summarize — speed matters more than depth |

Superpowers, GSD, OpenSpec, and Spec-Kit all use whatever model the host tool provides — no tiering. Kiro uses Claude models but doesn't expose tier selection. Hive Mind's tiering means you spend Opus dollars only where Opus reasoning is needed.

*Source: `src/agents/model-map.ts`*

### 5. Self-Contained Step Files

Each user story produces a step file that contains EVERYTHING the implementer needs: spec references, acceptance criteria (as bash commands), exit criteria, inputs, and expected outputs. The implementer agent receives this file and memory — nothing else.

This is like giving a contractor a complete work order instead of saying "go read the blueprint yourself." It reduces hallucination risk because the agent can't misinterpret context it never sees.

### 6. Zero Runtime Dependencies

Hive Mind's `package.json` has zero production dependencies. It's pure TypeScript running on Node.js stdlib. No `axios`, no `lodash`, no supply-chain risk from transitive dependencies. Superpowers and GSD both operate as prompt collections (so dependencies aren't really applicable), but for a TypeScript CLI tool, zero deps is unusually clean.

---

## Hive Mind Pain Points (Honest Assessment)

These are real issues found in the actual codebase — not hypothetical concerns.

### 1. No Cost Controls or Rate Limiting

The agent spawner (`src/agents/spawner.ts`) fires API calls with zero budget checks, no token counting before spawning, and no exponential backoff on rate limits. If Claude's API throttles you, the pipeline just dies. There's no way to set a spending cap or estimate costs before a run.

**Impact**: A multi-story project could burn through significant API credits with no warning.

### 2. Expensive Per-Story API Calls

A single user story with one test failure requires roughly **25-35 API calls** across all agents (SPEC: 7, PLAN: 6-8, BUILD: 2, VERIFY with retries: 3-6, LEARN: 1, REPORT: 2). For a 10-story project, that's 250-350 API calls minimum.

**Impact**: Token costs add up fast, especially with Opus-tier agents in the critical path.

### 3. Fragile Output Parsing

The report parser (`src/reports/parser.ts`) uses a 5-level cascade of regex patterns to extract PASS/FAIL from agent outputs. If the agent formats its response slightly differently, the parser falls back to "FAIL" with "default" confidence. There's even a workaround in the verify stage that short-circuits this:

> *"If eval says FAIL with default confidence but the test already passed with matched confidence, treat it as PASS anyway."*

**Impact**: False failures from parsing errors, not code errors.

### 4. Hardcoded Everything

Memory cap (400 words), graduation threshold (300 words), agent timeout (10 minutes), max retry attempts (3) — all hardcoded constants with no config file or CLI flags to override them. Want a 600-word memory? Edit the source code.

**Impact**: Can't tune the system without forking.

### 5. No Error Recovery

If any non-critic agent fails, the entire pipeline halts with no way to resume. There's no "pick up where you left off" capability. You can't skip a failed story and continue with the rest. The `abort` command doesn't save partial progress.

**Impact**: A single API timeout at story 8 of 10 means rerunning the entire pipeline.

### 6. Claude-Only Vendor Lock-In

The spawner calls `claude --model <name>` directly. There's no LLM provider abstraction, no API key management, no way to swap in OpenAI, Gemini, or local models. The CLI even checks for the `claude` binary at startup and exits if it's missing.

**Impact**: If Claude's pricing changes or you need multi-provider fallback, you're stuck.

### 7. Sequential-Only Execution

Stories execute one at a time. Independent stories that could run in parallel don't. You can't cherry-pick which stories to run or skip a problematic one.

**Impact**: Slower execution, no workaround for blocked stories.

### 8. Limited Test Coverage

The codebase has a ~50% test-to-code ratio (1,555 test lines vs 3,093 source lines). The agent spawner — the most critical path — has zero tests. There are no integration tests and no end-to-end tests with a sample PRD.

**Impact**: Changes to core logic lack safety nets.

### 9. Unbounded Knowledge Base Growth

The knowledge base warns at 5,000 words but never enforces a cap. There's no deduplication — the same pattern can graduate twice. No automated cleanup or pruning.

**Impact**: Over many runs, the KB grows unbounded and eventually degrades context quality.

### 10. No CLI Help

Running `hive-mind --help` returns an error. The CLI has good error messages for wrong usage, but no discoverable documentation for new users.

---

## Do I Recommend Hive Mind?

### Yes, if:

- You want a **structured, auditable pipeline** where every decision is traceable through spec drafts, critique reports, fix attempts, and learnings
- You're building **complex multi-story features** that benefit from agent specialization (not just one-off scripts)
- You value **human oversight** and want mandatory approval gates before each stage proceeds
- You're comfortable with **Claude-only** and willing to **monitor costs manually**
- You appreciate **institutional learning** — the memory graduation system is genuinely novel and gets smarter over time

### Not yet, if:

- You need **production reliability** — no error recovery, fragile parsing, and sequential-only execution make it risky for critical workflows
- You need **multi-provider support** — Claude lock-in means no fallback if the API is down
- You need **cost predictability** — no budget controls or token estimation
- You're a **solo builder doing quick tasks** — the 4-stage pipeline with mandatory checkpoints is too much ceremony for small work

### Consider instead:

- **Superpowers** if you want portable development discipline (TDD, code review) that works across Claude Code, Cursor, Codex, and OpenCode
- **GSD** if you want fresh AI context on every task, wave-based parallelism, and minimal ceremony
- **OpenSpec** if you want lightweight spec agreement before iterating on existing code — lowest ceremony of all six
- **Spec-Kit** if you want a portable spec format with project-level principles that any of 18+ AI agents can follow
- **Kiro** if you want an all-in-one IDE that auto-generates formal specs and handles implementation with agent hooks

### Bottom Line

Hive Mind is **architecturally innovative** — memory graduation, critic isolation, and fix escalation are genuinely novel ideas that neither Superpowers nor GSD have. But it's **operationally fragile** — no cost controls, fragile parsing, no error recovery, and Claude-only lock-in.

Think of it as a **well-designed prototype**: the blueprints are excellent, the assembly line is clever, but the factory floor still needs guardrails, fire exits, and a budget office.

**Best suited for**: Controlled experiments on bounded projects where you'll watch the costs and can restart if something breaks.

**Not yet suited for**: Unsupervised, long-running production deployments.

---

## Hive Mind's Niche: Who It's For, Why It Matters, How Easy It Is

### The Niche — Structured Multi-Story Projects with Audit Requirements

Hive Mind's sweet spot is **teams building features that span 3-15 user stories, where traceability and oversight aren't optional**. Think:

- **Fintech/healthtech/govtech** — regulatory audit trails for every design decision
- **Agencies and consultancies** — shipping similar project types repeatedly, where institutional memory across engagements is transformative
- **Enterprise product teams** — where multiple specialist perspectives (security, architecture, testing) are required at every milestone, and human sign-off is mandated by process

**What these teams struggle with today:**

1. **Code review bottleneck** — getting security, architecture, and testing perspectives requires scheduling 3 different reviewers who all have calendar conflicts
2. **Knowledge loss between projects** — the team learns "always use parameterized queries for X" on project A, then makes the same mistake on project B
3. **Unstructured debugging** — when tests fail, developers context-switch between "what's broken?" and "how do I fix it?" with no separation of concerns
4. **PRD-to-code drift** — the spec says "implement auth flow" but the code implements something subtly different, and nobody catches it until QA

**What they currently use:** Manual processes, or other frameworks that solve *adjacent* problems. Superpowers enforces good dev habits but has no orchestration or memory. GSD keeps context fresh but has no specialist agents or audit trail. OpenSpec and Spec-Kit structure specs but don't orchestrate execution or learn. Kiro auto-generates specs but is greenfield-focused and doesn't learn across projects. None of these systems *get smarter over time*.

### Why Hive Mind Is Valuable for This Niche — 6 Capabilities Nobody Else Has

Each of Hive Mind's innovations maps directly to a pain point this niche faces:

**1. 21 specialist agents → replaces the multi-reviewer scheduling bottleneck**

Instead of waiting for security, architecture, and testing reviewers to find time on their calendars, Hive Mind spawns the right specialist agents automatically based on keywords in the spec. If the spec mentions "authentication" or "payment," a security analyst agent joins the plan stage. If it mentions "API" or "interface," an architect agent joins.

*Hours of reviewer coordination → minutes of automated analysis.*

**2. Memory graduation → solves cross-project knowledge loss**

The Learner agent captures patterns, mistakes, and discoveries after every story. When a pattern has been cited across 2+ stories and proven stable, it "graduates" from scratch-pad memory into a persistent knowledge base. Hardcoded paths are filtered out (they wouldn't generalize). Graduated patterns get numbered series IDs for tracking.

*No other framework in this comparison does this.* Superpowers has no persistent memory. GSD has state files that persist but don't self-curate. OpenSpec archives specs but doesn't learn from them. Spec-Kit's constitution is human-written and static. Kiro's specs are project-scoped. Hive Mind's knowledge base compounds — run 10 is genuinely better than run 1.

**3. Critic isolation → eliminates confirmation bias in review**

Reviewers who see how code was built are biased toward approving it. Hive Mind deliberately blindfolds its critics: during the SPEC stage, the critic agent receives ONLY the draft document. It never sees the research, justification, or PRD that produced it. This is like a blind taste test — the chef knows the recipe, the critic only tastes the dish.

*Independent review quality without coordination overhead.*

**4. Fix escalation pipeline → structured debugging instead of context-switching**

When tests fail, most teams throw a developer at it and hope. Hive Mind separates diagnosis from repair:

- **Attempt 1**: Lightweight fixer tries a quick patch (cheap, fast — like going to the pharmacy for a headache)
- **Attempt 2+**: Diagnostician performs root-cause analysis reading ALL prior fix attempts, THEN the fixer applies a diagnosis-guided repair (like getting a full diagnostic workup when the headache persists)

*Matches how experienced teams actually debug, without the human context-switching cost.*

**5. Mandatory human checkpoints → the `.hive-mind/` directory IS your audit trail**

Four approval gates (approve-spec, approve-plan, verify, ship) with structured artifacts at each:

```
.hive-mind/
├── spec/          ← 7 documents: research, drafts, critiques, final spec
├── plans/         ← execution plan, role reports, acceptance criteria
├── reports/       ← per-story: impl, refactor, test, diagnosis, fix, eval, learning
├── consolidated-report.md
├── retrospective.md
└── manager-log.jsonl   ← structured event log
```

When an auditor asks "why did you make this design decision?", you point them at `spec/research-report.md` and `spec/critique-1.md`. When they ask "was this tested?", you point at `reports/US-03/test-report.md`. Every decision is documented.

**6. Self-contained step files → spec-to-code traceability**

Each user story produces a step file containing SPEC REFERENCES, ACCEPTANCE CRITERIA (as executable bash commands), EXIT CRITERIA, inputs, and expected outputs. The implementer agent gets this file and nothing else — it can't drift because the spec section is embedded in its input.

*Verifiable traceability from requirement → spec → story → code → test. No other framework provides this chain.*

### How Easy Is It to Benefit? — An Honest Assessment

#### Setup (30 minutes) — Easy for the niche

These are dev teams. They already have Node.js.

```bash
npm i -g hive-mind     # one command
# Prerequisite: Claude CLI installed and authenticated
```

No config files, no database, no Docker. Zero production dependencies.

**One friction point**: Claude CLI must be authenticated with an API key that has Opus-tier access. This means an Anthropic account with billing.

#### First Run (30-60 minutes wall-clock) — Moderate learning curve

```bash
hive-mind start --prd ./my-feature.md   # kick off the pipeline
# ... wait 5-10 min for SPEC stage (7 agents) ...
hive-mind approve                        # approve the spec
# ... wait 5-8 min for PLAN stage (4-6 agents) ...
hive-mind approve                        # approve the plan
# ... wait 10-20 min per story for EXECUTE stage ...
hive-mind approve                        # approve shipping
```

**Cost**: ~$3-15 for a 1-story run (24-28 API calls across Opus/Sonnet/Haiku tiers). Multi-story features scale linearly.

**Where new users stumble**:

1. **PRD quality matters** — the 7-agent SPEC pipeline improves a mediocre PRD, but can't rescue a fundamentally unclear one. Use the `/prd` command in Claude Code for guided creation.
2. **4 approval checkpoints** — good for compliance, but interruptive for flow state. No "auto-approve" option exists yet.
3. **No progress bar** — you wait 5-10 minutes with console output but no structured progress indicator.
4. **Cost unpredictability** — no budget controls or pre-run cost estimation (see [roadmap](./hive-mind-roadmap.md) P1.1).
5. **No built-in PRD template** — the PRD workflow exists as a Claude Code slash command (`.claude/commands/prd.md`), not as a standalone template file you can copy.

#### Ongoing Use (where the niche *really* benefits) — Easy and compounding

This is where Hive Mind separates from the field:

- **Memory graduation compounds** — run 2 is better than run 1. Run 10 is significantly better. The knowledge base grows with project-specific patterns, mistakes, and discoveries.
- **Teams can share knowledge** — copy `.hive-mind/knowledge-base/` across repositories. An agency's learnings from Client A's project benefit Client B's.
- **Audit artifacts accumulate** — the `.hive-mind/` directory is ready for compliance review at any time.
- **None of the other five frameworks get better over time.** They all start at the same quality on project 100 as project 1.

#### Who Should (and Shouldn't) Adopt

| Team Profile | Ease of Adoption | Expected Value |
|---|---|---|
| **Agency shipping similar projects** | Easy (familiar with structured processes) | **Very High** — memory graduation is transformative |
| **Enterprise with compliance needs** | Easy (checkpoints = audit trail they already need) | **Very High** — built-in traceability |
| **Startup, moving fast** | Medium (checkpoints slow them down) | Medium — memory helps but cost and ceremony hurt |
| **Solo dev, small features** | Hard (too much ceremony for the task size) | Low — overkill |
| **Open source maintainer** | Hard (cost per run, Claude lock-in) | Low — community review is better than automated review |

**The niche verdict**: If you're a team that ships 3-15 story features, needs audit trails, and values institutional learning — Hive Mind is the only framework that addresses all three. Setup is easy, the first run has a moderate learning curve, and the value compounds with every subsequent run. The friction points (cost unpredictability, Claude lock-in, no config file) are real but solvable — see the [improvement roadmap](./hive-mind-roadmap.md) for the path forward.

---

*Comparison reflects the state of these frameworks as of March 2026. See their repositories for the latest:*
- *[Superpowers](https://github.com/obra/superpowers)*
- *[GSD](https://github.com/gsd-build/get-shit-done)*
- *[OpenSpec](https://github.com/Fission-AI/OpenSpec)*
- *[Spec-Kit](https://github.com/github/spec-kit)*
- *[Kiro](https://kiro.dev/)*
