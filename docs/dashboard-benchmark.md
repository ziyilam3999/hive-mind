# Dashboard Performance Benchmark Protocol

## Purpose

Verify the dashboard server introduces no measurable overhead to pipeline execution. The dashboard is a non-fatal observer that polls file-based state via `setInterval` every 2 seconds using async I/O. This benchmark confirms the polling and HTTP serving do not degrade pipeline throughput.

## Test Setup

1. Select a reproducible PRD with at least 3 stories (e.g., the String Utils Library PRD from run-05).
2. Ensure the environment is consistent: same machine, same Node.js version, no background CPU-intensive processes.
3. Run each configuration **3 times** minimum to account for variance.

## Configurations

| Run | Flag | Description |
|-----|------|-------------|
| A | (default) | Dashboard enabled (server starts, browser opens) |
| B | `--no-dashboard` | Dashboard disabled (no server, no polling) |

## Procedure

### Run A: Dashboard Enabled

```sh
node dist/index.js start path/to/prd.md
```

### Run B: Dashboard Disabled

```sh
node dist/index.js start path/to/prd.md --no-dashboard
```

## Measurement

Extract total wall-clock time from `manager-log.jsonl`:

```sh
# First entry timestamp
head -1 .hive-mind-working/manager-log.jsonl | jq -r '.timestamp'

# Last entry timestamp
tail -1 .hive-mind-working/manager-log.jsonl | jq -r '.timestamp'
```

Compute the difference in seconds for each run. Average across the 3 runs per configuration.

## Pass Criteria

The dashboard-enabled runs (A) must complete within **5%** of the dashboard-disabled runs (B):

```
avg(A) <= avg(B) * 1.05
```

If the overhead exceeds 5%, investigate:
- Polling interval (currently 2000ms) may need tuning
- File read contention during heavy write stages
- HTTP server event loop interference

## Expected Result

The dashboard uses async file reads on a 2-second polling interval with a lightweight `node:http` server. Expected overhead is < 1% of total pipeline time, well within the 5% threshold.
