# E2E Smoke Tests

## Overview

End-to-end smoke tests validate the Hive Mind pipeline with real `claude --print` calls.

## PRD Templates

Reusable test PRDs in `prds/`:

| PRD | Stories | Complexity | Used In |
|-----|---------|-----------|---------|
| `hello-greeter.md` | 1 | Minimal (single function) | run-01 |
| `task-tracker.md` | 4 | Medium (types + state machine) | run-02, run-03 |
| `string-utils.md` | 4 | Medium (algorithms + edge cases) | run-04, run-05 |

## How to Run

```bash
# 1. Build the pipeline
cd hive-mind-v3 && npm run build

# 2. Set up test directory with a PRD
mkdir -p $TEMP/hm-e2e-runNN
cp e2e/prds/hello-greeter.md $TEMP/hm-e2e-runNN/PRD.md

# 3. Run stage by stage
cd $TEMP/hm-e2e-runNN
node /path/to/hive-mind-v3/dist/index.js start --prd PRD.md 2>&1  # SPEC
node /path/to/hive-mind-v3/dist/index.js approve 2>&1             # PLAN
node /path/to/hive-mind-v3/dist/index.js approve 2>&1             # EXECUTE
node /path/to/hive-mind-v3/dist/index.js approve 2>&1             # VERIFY
node /path/to/hive-mind-v3/dist/index.js approve 2>&1             # SHIP
```

## Results

Local results are stored in `results/` (.gitignored).
Archived results go to the design repo: `.hive-mind/e2e-smoke-test/run-XX/`.

See the design repo's `e2e-smoke-test/README.md` for full run history and troubleshooting.
