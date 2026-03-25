```

                                    #
                                    |
                             o      |      o
                              \    /|\    /
                         o-----\--/ | \--/-----o
                        /  ::--;-;--+--;-;--;:  \
                   o---/  ;--;  ;--;-+-;--;  ;--;  \---o
                      /  ;-;  ;--|  :+:  |--;  ;-;  \
                 o---/  ;-;  ;-|  ;-:+:-;  |-;  ;-;  \---o
                    /  ;-; ;-;  ;-; :+: ;-;  ;-; ;-;  \
           o-------+  ;  ;-;  ;-;  ;-+-;  ;-;  ;-;  ;  +-------o
                    \  ;-; ;-;  ;-; :+: ;-;  ;-; ;-;  /
                 o---\  ;-;  ;-|  ;-:+:-;  |-;  ;-;  /---o
                      \  ;-;  ;--|  :+:  |--;  ;-;  /
                   o---\  ;--;  ;--;-+-;--;  ;--;  /---o
                        \  ::--;-;--+--;-;--;:  /
                         o-----/--\ | /--\-----o
                              /    \|/    \
                             o      |      o
                                    |
                                    #

                           H I V E   M I N D
```

# Hive Mind

[![CI](https://github.com/ziyilam3999/hive-mind/actions/workflows/ci.yml/badge.svg)](https://github.com/ziyilam3999/hive-mind/actions/workflows/ci.yml)
[![AI Code Review](https://github.com/ziyilam3999/hive-mind/actions/workflows/code-review.yml/badge.svg)](https://github.com/ziyilam3999/hive-mind/actions/workflows/code-review.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Node](https://img.shields.io/badge/Node.js-18%2B-green)

PRD-driven orchestrator that turns a product requirements document into working code through a multi-stage AI pipeline with human checkpoints, a real-time browser dashboard, and a dedicated bug-fix pipeline.

> **Design iteration 3** -- ground-up redesign following two earlier prototypes. Currently at `v0.16.0`.

```
Start pipeline:

PRD --> NORMALIZE --> BASELINE --> SPEC --> PLAN --> EXECUTE --> REPORT
                  [ human approval at each checkpoint ]    [ scorecard ]

Bug-fix pipeline:

REPORT --> DIAGNOSE --> FIX --> VERIFY
```

## Features

- **PRD-to-code pipeline** -- Feed in a product requirements doc, get working code out
- **Multi-stage AI agents** -- Specialized agents for spec generation, planning, execution, and reporting
- **Human-in-the-loop** -- Approve, reject with feedback, or abort at every checkpoint
- **Parallel wave execution** -- Stories fan out into concurrent waves of non-overlapping work with bounded concurrency; smart file-overlap detection defers conflicting stories to the next wave
- **Live dashboard** -- Real-time browser UI with progress infographics and a swarm activity panel showing active parallel agents
- **Codebase-aware spec** -- Four specialized agent types analyze existing code before generating specs
- **Evidence-gating** -- SPEC pipeline validates claims with evidence, tracks regressions, and logs critiques
- **Pipeline hardening** -- BUILD retry, pre-flight checks, early gates, and registry enforcement for reliable e2e execution
- **Scorecard agent** -- Stage-aware report card that grades each pipeline phase
- **Session continuity** -- Resume interrupted pipelines without losing progress
- **Learning system** -- Agents capture and graduate learnings across runs

## Tech Stack

- **TypeScript** (ESM) -- Fully typed, npm-publishable CLI
- **Claude API** via Claude Code CLI -- Powers all AI agents
- **Vitest** -- Comprehensive test suite
- **Zod** -- Runtime config validation

## Quick Start

### Prerequisites

- Node.js >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-cli) installed and authenticated

### Install & Run

```bash
npm i -g hive-mind

# Start a pipeline
hive-mind start --prd ./my-project.md

# Start with a cost budget and stop after planning
hive-mind start --prd ./my-project.md --budget 20 --stop-after-plan

# Check status
hive-mind status

# Approve a checkpoint
hive-mind approve

# Reject with feedback
hive-mind reject --feedback "The spec is missing error handling requirements"

# Resume an interrupted pipeline
hive-mind resume

# Retry a single failed story
hive-mind retry S-003

# Run bug-fix pipeline
hive-mind bug --report ./bug-report.md

# Generate project manifest
hive-mind manifest
```

## CLI Reference

### Commands

| Command | Description |
|---|---|
| `start --prd <path>` | Run full pipeline (NORMALIZE -> SPEC -> PLAN -> EXECUTE -> REPORT) |
| `bug --report <path>` | Run bug-fix pipeline (DIAGNOSE -> FIX -> VERIFY) |
| `approve` | Approve current checkpoint and continue |
| `reject --feedback <text>` | Reject with feedback and re-run current stage |
| `resume` | Resume execution from saved plan |
| `retry <storyId>` | Retry a failed story (reset + re-execute) |
| `status` | Show current pipeline status |
| `abort` | Cancel active pipeline |
| `manifest` | Update MANIFEST.md in working directory |

### Options

| Flag | Scope | Description |
|---|---|---|
| `--silent` | all | Suppress desktop notifications |
| `--budget <dollars>` | start | Set cost budget limit |
| `--skip-baseline` | start, approve, bug | Skip pre-execution test baseline capture |
| `--stop-after-plan` | start | Run SPEC + PLAN only, then exit |
| `--skip-normalize` | start | Skip PRD normalize stage |
| `--greenfield` | start | New project with no existing code |
| `--no-dashboard` | start | Disable the real-time dashboard |
| `--from <storyId>` | resume | Resume from specific story |
| `--skip-failed` | resume | Skip failed stories on resume |
| `--retry-failed` | resume | Reset failed stories and retry them |
| `--clean` | retry | Delete report directory before retry |

## How It Works

1. **NORMALIZE** -- Detects PRD format compliance and normalizes `/prd`-generated documents into the expected structure (skippable with `--skip-normalize`)
2. **BASELINE** -- Captures a test baseline from the existing codebase so regressions can be tracked (skippable with `--skip-baseline` or `--greenfield`)
3. **SPEC** -- Codebase-aware agents read your PRD and existing code, then generate a detailed technical specification with evidence-gating and critique logs
4. **PLAN** -- A planner agent breaks the spec into user stories with execution order; a plan-validator agent checks the result
5. **EXECUTE** -- Stories fan out into parallel waves of non-overlapping work; each story goes through build (with retry), verify, compliance check, commit, and learn sub-stages
6. **REPORT** -- A reporter agent summarizes what was built, test results, and learnings; a double-critique pass validates the report
7. **SCORECARD** -- A scorecard agent grades each pipeline stage and produces a final report card

Each stage pauses for human review before continuing to the next.

A live browser dashboard (port 9100) shows real-time progress, infographics, and active agent swarm activity throughout the pipeline.

## Project Structure

```
src/
  stages/       # Pipeline stages (normalize, baseline, spec, plan, execute, report, scorecard, diagnose)
  agents/       # Agent spawner, prompts, model mapping, tool permissions
  state/        # Execution plan, checkpoints, logs
  config/       # Schema and loader
  memory/       # Learning system and graduation
  reports/      # Parser and templates
  dashboard/    # Live browser dashboard (server + launcher)
  tooling/      # Project type detection and setup
  types/        # TypeScript type definitions
  manifest/     # MANIFEST.md generator
  utils/        # File I/O, shell, token counting, cost tracking
  __tests__/    # Vitest test suite
```

## License

MIT
