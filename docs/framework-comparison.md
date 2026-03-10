# AI-Assisted Development Frameworks: An ELI5 Comparison

Three frameworks that help AI agents write better code — each with a very different philosophy. Think of them as three ways to run a construction project: one hires a full crew of specialists, one hands out a rulebook, and one gives every worker a clean desk.

## What Are They?

**Hive Mind** is like a **factory with 21 specialist workers on an assembly line**. You hand it a product requirements document (PRD), and a foreman (the orchestrator) routes work through researchers, architects, coders, testers, and fixers — each doing one job well. A quality inspector (you, the human) signs off at every station before work moves forward.

**Superpowers** is like a **cookbook that any AI chef must follow**. It doesn't build things itself — instead, it's a library of "skills" (structured prompts and workflows) that teach AI agents how to brainstorm, plan, write tests first, review code, and finish branches properly. Any kitchen can use it: Claude Code, Cursor, Codex, or OpenCode.

**GSD (Get Shit Done)** is like a **project manager who grabs a fresh notepad for every task**. Its big insight: AI quality degrades as conversations get longer ("context rot"). So GSD spawns a brand-new AI worker with a clean 200K-token context for each task, while keeping a master binder of project state so nothing gets lost between tasks.

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

## Who Does the Work?

**Hive Mind** has **21 typed agents** organized into three tiers by model capability:
- *Opus* (smartest): Researcher, Spec-drafter, Architect, Analyst, Implementer, Synthesizer
- *Sonnet* (balanced): Critic, Reviewer, Refactorer, Diagnostician, Fixer, Retrospective
- *Haiku* (fastest): Tester, Evaluator, Learner, Reporter

Each agent sees only what it needs — implementers get a self-contained step file, critics get only the draft.

**Superpowers** has **no fixed agents**. Instead, it provides ~50 composable skills (structured prompts) that any AI tool can load. The AI agent picks the right skill for the moment. This makes it tool-agnostic but means there's no built-in orchestration.

**GSD** spawns **fresh subagents per task**. Each gets a clean 200K-token context loaded with only the relevant slice of project state. The main session stays lightweight and responsive because heavy work happens in throwaway subprocesses.

## How Do They Remember?

**Hive Mind** maintains a `memory.md` file capped at 400 words, organized into PATTERNS (reusable techniques), MISTAKES (pitfalls to avoid), and DISCOVERIES (project-specific findings). When memory fills up, mature entries "graduate" into a persistent `knowledge-base/` directory — like promoting notes from a scratch pad into a reference manual.

**Superpowers** relies on **git itself** as memory. Worktrees (isolated branch copies) preserve experiments. Plans and decisions live in commit history and branch structure. There's no cross-session learning system.

**GSD** keeps a family of state files: `PROJECT.md` (vision), `REQUIREMENTS.md` (scope), `ROADMAP.md` (phases), and `STATE.md` (decisions, blockers, current position). These persist across sessions and get loaded into each fresh subagent's context as needed.

## Where Do Humans Fit In?

**Hive Mind**: **Mandatory checkpoints at every stage.** You must approve the spec, approve the plan, verify execution results, and approve shipping. You can reject with feedback to rerun any stage. The system won't proceed without you.

**Superpowers**: **Lighter touch.** Skills enforce structural discipline (you can't skip TDD or code review), but there's no formal approval gate. Humans stay in control by reviewing branches and pull requests.

**GSD**: **Flexible involvement.** The Discuss stage captures your preferences upfront. Verify checks your work after execution. A "quick mode" lets you skip the full ceremony for small tasks.

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

## Summary Comparison Table

| Aspect | Hive Mind | Superpowers | GSD |
|--------|-----------|-------------|-----|
| **One-liner** | Factory with 21 specialists | Portable skills cookbook | Fresh-notepad project manager |
| **Workflow stages** | 4 (SPEC/PLAN/EXECUTE/REPORT) | 7 (Brainstorm through Finish) | 6 (Initialize through Complete) |
| **Agent model** | 21 typed agents, 3 model tiers | Composable skills, no fixed agents | Subagents with fresh 200K context |
| **Memory** | memory.md + knowledge base graduation | Git worktrees/branches | PROJECT.md + STATE.md family |
| **Human checkpoints** | Mandatory at every stage | Code review gates | Verify stage + quick mode |
| **TDD** | Tester + Evaluator agents | Mandatory RED-GREEN-REFACTOR | Task verification step |
| **Tool support** | Claude CLI | Claude Code, Cursor, Codex, OpenCode | Claude Code, OpenCode, Gemini CLI, Codex |
| **Parallelism** | Sequential stories | Git worktree parallelism | Wave-based dependency-aware |
| **Best for** | Complex multi-story projects with audit needs | Teams wanting portable dev habits | Solo builders wanting zero context rot |

## Which One Should You Pick?

- **Pick Hive Mind** if you want a full assembly line with specialist agents, mandatory human sign-off at every stage, and a system that learns from its own mistakes across projects.
- **Pick Superpowers** if you want portable development discipline (TDD, code review, structured planning) that works regardless of which AI tool your team uses.
- **Pick GSD** if you're a solo builder who wants fresh AI context on every task, minimal ceremony, and dependency-aware parallel execution.

Or mix and match — Superpowers' skills could complement either Hive Mind's or GSD's orchestration.

---

*Comparison reflects the state of these frameworks as of March 2026. See their repositories for the latest:*
- *[Superpowers](https://github.com/obra/superpowers)*
- *[GSD](https://github.com/gsd-build/get-shit-done)*
