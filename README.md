# Hive Mind

PRD-driven orchestrator that turns a product requirements document into working code through a multi-stage AI pipeline with human checkpoints.

## Prerequisites

- Node.js >= 18
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) installed and authenticated

## Install

```bash
npm i -g hive-mind
```

## Usage

### Start a pipeline

```bash
hive-mind start --prd ./my-project.md
```

The pipeline runs through four stages: **SPEC** (generates a technical spec), **PLAN** (creates an execution plan), **EXECUTE** (builds and verifies each story), and **REPORT** (produces a final summary). Human approval is required between stages.

### Check status

```bash
hive-mind status
```

### Approve a checkpoint

```bash
hive-mind approve
```

### Reject with feedback

```bash
hive-mind reject --feedback "The spec is missing error handling requirements"
```

### Abort the pipeline

```bash
hive-mind abort
```

## How it works

1. **SPEC** -- An AI agent reads your PRD and generates a detailed technical specification.
2. **PLAN** -- A planner agent breaks the spec into user stories with an execution order.
3. **EXECUTE** -- Each story goes through build, verify, commit, and learn sub-stages.
4. **REPORT** -- A final report summarizes what was built, test results, and learnings.

Each stage pauses for human review before continuing to the next.

## License

MIT
