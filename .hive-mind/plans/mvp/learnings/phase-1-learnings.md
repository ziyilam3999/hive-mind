# Phase 1: Foundation — Learnings

**Completed:** 2026-03-12 | **Items:** RD-03 (Config File Support), Spawner Upgrade

---

## Design Decisions & Rationale

### Config threading (not global singleton)
Config loaded once at startup in `index.ts`, passed as parameter through `orchestrator → stages → spawner`. Makes dependencies explicit and testing trivial — no hidden global state to reset between tests.

### Deep merge for modelAssignments
Partial overrides in `.hivemindrc.json` merge with defaults: `{ ...DEFAULT_MODEL_ASSIGNMENTS, ...userOverrides }`. New agents added in future don't require config file updates.

### spawn over exec for Claude CLI
`child_process.spawn` with prompt as positional arg (`--`, prompt) eliminates shell escaping bugs. On Windows, `shell: "bash"` ensures consistent behavior.

### JSON output with defensive fallback
`spawnClaude()` requests `--output-format json` but falls back to raw stdout if parsing fails. Consumer: `result.json?.result ?? result.stdout.trim()`.

### Tool permissions by agent type
Hardcoded `agentType → allowedTools[]` map in `tool-permissions.ts`. Critics get read-only; implementers get write+edit+bash. Simple, no runtime overhead, extensible.

### Bounded parallel spawning
`spawnAgentsParallel()` uses worker-pool pattern with configurable `maxConcurrency`. Falls back to `Promise.all()` when concurrency >= task count.

---

## Technical Challenges

### vi.mock hoisting (cost: ~30min debugging)
**Problem:** `vi.mock()` is hoisted above all `const` declarations. Referencing a `const mockImpl` defined outside the factory causes "Cannot access before initialization" (temporal dead zone).

**Fix:** Define mock implementation as `const impl` *inside* the `vi.mock()` factory. All stage tests now follow this pattern. Dynamic imports (`await import("node:fs")`) inside the factory work fine.

**Pattern to follow:**
```typescript
vi.mock("../../agents/spawner.js", () => {
  const impl = async (config: { outputFile: string; type: string }) => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    // ... implementation
    return { success: true, outputFile: config.outputFile };
  };
  return {
    spawnAgentWithRetry: vi.fn(impl),
    spawnAgentsParallel: vi.fn(async (configs) => Promise.all(configs.map(impl))),
  };
});
// imports AFTER vi.mock
import { runSpecStage } from "../../stages/spec-stage.js";
```

### Config validation granularity
Distinguishing "positive number" (timeout) from "non-negative integer" (maxRetries) required careful thought. `validateConfig()` returns `{ valid, errors[], warnings[] }` — warnings don't block loading.

### Windows root detection in upward config search
`findConfigFile()` walks up directories. Windows root detection uses `path.resolve("/")` comparison. Edge case handled but worth monitoring.

---

## Patterns Established

| Pattern | Where | Reuse in Phase 2+ |
|---------|-------|--------------------|
| Config threading via params | All stages, spawner | Every new stage/function |
| vi.mock with inline impl | All `__tests__/stages/` | Every new test with mocks |
| Integration test: config roundtrip | `spec-stage-with-config.test.ts` | Template for new integration tests |
| Atomic file writes | `writeFileAtomic()` in `file-io.ts` | All file mutations |
| `getDefaultConfig()` returns fresh copy | `loader.ts` | Prevents test pollution |

---

## Test Coverage Gaps to Address in Phase 2

1. **No real Claude CLI invocation** — all spawner tests mock `spawnClaude`. Need at least one live smoke test.
2. **Config search upward** — only tested in same directory, not parent directory lookup.
3. **Large prompt payloads** — no test for prompts exceeding OS argument length limits.
4. **Timeout under real latency** — mocked with 50ms delays; real spawns may expose edge cases.
5. **Cross-platform CI** — `spawn` shell option tested on Windows dev machine only.

---

## Metrics

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Test files | 25 | 28 | +3 |
| Total tests | 95 | 129 | +34 |
| Source files | 38 | 43 | +5 |
| TypeScript errors | 0 | 0 | 0 |

---

## Key Takeaway
Config-as-parameter and mock-inside-factory are the two patterns that saved the most time once established. Future phases should follow both strictly.
