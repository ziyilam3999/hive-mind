# Phase 1: Foundation — Implementation Plan

## Inputs Consulted

- [x] **Claude memory** (`.hive-mind/memory.md`):
  - P11 (write everything to files) — config must be file-based, not in-memory defaults
  - P15 (write test commands before implementation) — define test cases before coding
  - P16 (self-contained step files) — config loader should be independently testable
  - P6 (mechanical detection over judgment) — validation must produce clear error messages, not silent defaults
  - F19 (conversation summary erases context) — config values must be loaded from files each time, never cached in conversation memory
  - F31 (return-type changes without caller audit) — spawner rewrite must list every caller of current `spawnAgent` and `runShell`
  - F32 (hollow "grep for others" advice) — all hardcoded constants listed below with exact file:line refs
  - F33 (ambiguous file locations) — every change specifies exactly one target file and line

- [x] **Knowledge base** (`.hive-mind/knowledge-base/`):
  - **01-proven-patterns.md:** P19 (idempotent automation) — config loader must handle re-reads gracefully; P27 (tight scope) — keep RD-03 and spawner upgrade as independent items with clear boundaries
  - **02-anti-patterns.md:** F30 (in-memory tracking without atomic writes) — spawner must write results atomically; F37 (phantom test files) — tests must import real modules
  - **03-design-constraints.md:** C-ATOMIC-1 (tracking writes must be atomic) — applies to config writes; C-CONTRACT-1 (output contracts are mandatory) — `AgentResult` interface is a contract for all consumers
  - **06-process-patterns.md:** Plan-file-first, pre-written verification scripts, backup-before-destroy patterns all apply
  - **document-guidelines.md:** Referenced for standard document structure (not directly used in Phase 1 but noted for awareness)

- [x] **Previous phase learnings:** N/A (first phase)

- [x] **mvp-plan.md:** Phase 1 items (RD-03 + Spawner Upgrade), smoke test gate criteria (Tier 1 + Tier 2)

---

## Items

### RD-03: Config File Support

- **Goal:** Replace 12+ hardcoded constants with a config file (`.hivemindrc.json`) that provides defaults overridable per-project.

- **Files to create:**
  - `src/config/loader.ts` — Config loading, validation, and defaults. Single source of truth for all configurable values.
  - `src/config/schema.ts` — TypeScript interface + JSON schema for `.hivemindrc.json`. Separating schema from loader keeps validation testable independently.

- **Files to modify (hardcoded constants to replace):**

  | File | Line | Current Value | Config Key |
  |------|------|---------------|------------|
  | `src/agents/spawner.ts` | 8 | `600_000` | `agentTimeout` |
  | `src/agents/spawner.ts` | 49 | `maxRetries = 1` | `maxRetries` |
  | `src/utils/shell.ts` | 18 | `120_000` | `shellTimeout` |
  | `src/tooling/detect.ts` | 45 | `30_000` | `toolingDetectTimeout` |
  | `src/memory/memory-manager.ts` | 4 | `400` | `memoryWordCap` |
  | `src/memory/memory-manager.ts` | 5 | `300` | `memoryGraduationThreshold` |
  | `src/memory/graduation.ts` | 42 | `>= 1` | `graduationMinDates` |
  | `src/memory/graduation.ts` | 46 | `>= 2` | `graduationMinStoryRefs` |
  | `src/agents/model-map.ts` | 3-25 | 20 agent→model pairs | `modelAssignments` |
  | `src/stages/report-stage.ts` | 17 | `5000` | `kbSizeWarningWords` |
  | `src/stages/execute-verify.ts` | 83, 122 | `200` chars | `reportExcerptLength` |
  | `src/stages/plan-stage.ts` | 146 | `3` attempts | `maxAttempts` |

- **Function signatures:**
  ```typescript
  // src/config/schema.ts
  export interface HiveMindConfig {
    agentTimeout: number;          // default: 600_000
    shellTimeout: number;          // default: 120_000
    toolingDetectTimeout: number;  // default: 30_000
    maxRetries: number;            // default: 1
    maxAttempts: number;           // default: 3
    memoryWordCap: number;         // default: 400
    memoryGraduationThreshold: number; // default: 300
    graduationMinDates: number;    // default: 1
    graduationMinStoryRefs: number; // default: 2
    kbSizeWarningWords: number;    // default: 5000
    reportExcerptLength: number;   // default: 200
    modelAssignments: Record<string, string>; // default: current model-map
  }

  // src/config/loader.ts
  export function loadConfig(projectRoot: string): HiveMindConfig;
  export function getDefaultConfig(): HiveMindConfig;
  export function validateConfig(raw: unknown): { valid: boolean; errors: string[] };
  ```

- **Key decisions:**
  - **Config threading, not global singleton:** Config is loaded once at startup and threaded through function arguments (per P11, F19 — no global state). This avoids hidden coupling and makes testing straightforward.
  - **`.hivemindrc.json` at project root:** Follows established convention (`.eslintrc.json`, `.prettierrc.json`). Searched from CWD upward.
  - **Deep merge with defaults:** Missing keys use defaults. Unknown keys produce warnings (not errors) for forward-compatibility.
  - **Validation at load time:** Invalid values (negative timeout, unknown model name) produce clear error messages listing the problem key and value.

---

### Spawner Upgrade

- **Goal:** Replace `child_process.exec` with `child_process.spawn`, enable JSON output, tool permissions, and parallel spawning.

- **Files to create:**
  - `src/agents/tool-permissions.ts` — Maps each agent type to its allowed tools via `getToolsForAgent(agentType)`.

- **Files to modify:**

  | File | Change |
  |------|--------|
  | `src/utils/shell.ts` | Add `spawnClaude()` function using `child_process.spawn` |
  | `src/types/agents.ts` | Extend `AgentResult` with `costUsd?`, `modelUsed?`, `sessionId?`, `durationMs?` |
  | `src/agents/spawner.ts` | Rewrite `spawnAgent` to use `spawnClaude()`, add `spawnAgentsParallel()` |
  | `src/stages/plan-stage.ts` (lines 71-90) | Parallelize 5 role agents using `spawnAgentsParallel()` |
  | `src/stages/report-stage.ts` (lines 34-56) | Parallelize reporter + retrospective |

- **Function signatures:**
  ```typescript
  // src/utils/shell.ts
  export interface ClaudeSpawnOptions {
    model: string;
    prompt: string;
    outputFormat?: "json" | "text";
    allowedTools?: string[];
    cwd?: string;
    timeout?: number;
    onData?: (chunk: string) => void;
  }

  export interface ClaudeSpawnResult {
    exitCode: number;
    stderr: string;
    stdout: string;
    json?: {
      result: string;
      cost_usd: number;
      model: string;
      session_id: string;
      duration_ms: number;
      raw: Record<string, unknown>;
    };
  }

  export function spawnClaude(options: ClaudeSpawnOptions): Promise<ClaudeSpawnResult>;

  // src/agents/tool-permissions.ts
  export function getToolsForAgent(agentType: AgentType): string[];

  // src/agents/spawner.ts (new)
  export function spawnAgentsParallel(
    configs: AgentConfig[],
    options?: { maxConcurrency?: number },
  ): Promise<AgentResult[]>;
  ```

- **Key decisions:**
  - **Prompt as positional argument:** `spawn` passes args directly without shell interpretation — no escaping needed. Fixes shell escaping fragility.
  - **JSON output with fallback:** Parse `--output-format json` response. If JSON parse fails, fall back to raw stdout (defensive parsing per spawner-upgrade-plan.md).
  - **Keep `runShell()` unchanged:** `spawnClaude()` is additive. Non-Claude shell commands continue using `runShell()`.
  - **`spawnAgentsParallel` uses worker-pool pattern:** `maxConcurrency` defaults to batch size. Each worker calls `spawnAgent()` — retry logic stays in `spawnAgentWithRetry`.

---

## Execution Order

### Step 1: Create config schema and types
- Create `src/config/schema.ts` with `HiveMindConfig` interface and defaults
- No dependencies on other files

### Step 2: Create config loader
- Create `src/config/loader.ts` with `loadConfig()`, `getDefaultConfig()`, `validateConfig()`
- Depends on: Step 1 (schema)

### Step 3: Write config tests
- Test: defaults returned when no config file exists
- Test: `.hivemindrc.json` overrides specific defaults
- Test: invalid values produce clear error messages
- Test: unknown keys produce warnings, not crashes
- Depends on: Step 2

### Step 4: Thread config through entry point
- Modify `src/index.ts` to call `loadConfig()` at startup
- Pass config to `orchestrator.ts` as parameter
- Depends on: Step 2

### Step 5: Replace hardcoded constants with config values
- Modify all 8 files listed in the RD-03 table above
- Each file receives config values through function parameters (not imports from a global)
- Depends on: Step 4

### Step 6: Create tool-permissions module
- Create `src/agents/tool-permissions.ts` with agent→tools mapping
- No dependencies on other spawner changes

### Step 7: Add `spawnClaude()` to shell.ts
- Add new function to `src/utils/shell.ts`
- Keep existing `runShell()` unchanged
- Depends on: Step 5 (needs config for timeout)

### Step 8: Extend `AgentResult` type
- Add optional metadata fields to `src/types/agents.ts`
- Backward-compatible (all new fields optional)
- No dependencies

### Step 9: Rewrite spawner
- Rewrite `spawnAgent()` in `src/agents/spawner.ts` to use `spawnClaude()`
- Add `spawnAgentsParallel()`
- Pass `allowedTools` from `getToolsForAgent()`
- Depends on: Steps 6, 7, 8

### Step 10: Write spawner tests
- Test: `spawnAgent` calls `spawnClaude` with correct args
- Test: `spawnAgentsParallel` runs configs concurrently
- Test: JSON metadata populated in `AgentResult`
- Test: tool permissions passed correctly per agent type
- Depends on: Step 9

### Step 11: Parallelize plan-stage role agents
- Modify `src/stages/plan-stage.ts` (lines 71-90): replace sequential loop with `spawnAgentsParallel()`
- Depends on: Step 9

### Step 12: Parallelize report-stage agents
- Modify `src/stages/report-stage.ts` (lines 34-56): run reporter + retrospective in parallel
- Depends on: Step 9

### Step 13: Integration tests
- Test: full SPEC stage with mocked spawner using config-driven model assignments
- Test: roundtrip — write config → load config → spawn agent with correct model parameter
- Test: spawner produces JSON output with metadata fields
- Depends on: Steps 11, 12

### Step 14: Verification
- `npm run build` — TypeScript compiles cleanly
- `npm test` — all tests pass (existing + new)
- Depends on: Step 13

---

## Tests to Write

### RD-03 Config Tests

| Test | Expected Behavior |
|------|-------------------|
| `loadConfig` with no `.hivemindrc.json` | Returns all defaults, no error |
| `loadConfig` with partial config | Merges with defaults — only specified keys override |
| `loadConfig` with invalid values (negative timeout) | Returns `{ valid: false, errors: ["agentTimeout must be positive"] }` |
| `loadConfig` with unknown keys | Returns valid config + logs warning |
| `loadConfig` with full valid config | All values from config file, no defaults |
| Config threading | `orchestrator` receives config; `spawner` uses `config.agentTimeout` not hardcoded `600_000` |
| Model assignment override | Config `{ modelAssignments: { critic: "opus" } }` → critic spawns with opus |

### Spawner Upgrade Tests

| Test | Expected Behavior |
|------|-------------------|
| `spawnClaude` builds correct args array | `["--print", "--model", "sonnet", "--output-format", "json", "--", prompt]` |
| `spawnClaude` with `allowedTools` | `--allowedTools Read,Glob,Grep` in args |
| `spawnClaude` timeout kills process | Process receives SIGTERM after timeout ms |
| `spawnAgent` populates `AgentResult` metadata | `costUsd`, `modelUsed`, `durationMs` populated from JSON response |
| `spawnAgent` JSON parse failure fallback | Falls back to `stdout.trim()` for content, metadata fields undefined |
| `spawnAgentsParallel` concurrent execution | 3 configs with 100ms mock delay each → wall-clock < 300ms |
| `spawnAgentsParallel` with `maxConcurrency: 1` | Sequential execution — wall-clock ≈ 300ms |
| `getToolsForAgent("critic")` | Returns `["Read", "Glob", "Grep"]` (read-only) |
| `getToolsForAgent("implementer")` | Returns `["Read", "Glob", "Grep", "Write", "Edit", "Bash"]` (full dev) |
| `spawnAgentWithRetry` accepts config-driven parameters | `maxRetries` and `timeout` from config, not hardcoded |

---

## Smoke Test Gate (from mvp-plan.md)

### Tier 1 (Unit) — must pass before Phase 2

- [ ] `.hivemindrc.json` loads and overrides defaults (timeout, retries, model assignments)
- [ ] Missing config file gracefully uses defaults (no crash)
- [ ] Invalid config values produce clear error message
- [ ] `spawnAgentWithRetry` accepts config-driven parameters

### Tier 2 (Integration) — must pass before Phase 2

- [ ] Full SPEC stage with mocked spawner using config-driven model assignments
- [ ] Roundtrip: write config → load config → spawn agent with correct model parameter
- [ ] Spawner produces JSON output with metadata fields (cost, duration, model)

---

## Risk Mitigations

| Risk | Mitigation | Source |
|------|------------|--------|
| Config threading creates noisy diffs (passing config everywhere) | Use a focused `ConfigSlice` pattern — each module receives only the keys it needs, not the full config | First principles |
| `spawn` on Windows behaves differently from Unix | Test on Windows (dev environment is Windows); use `shell: true` only if needed | spawner-upgrade-plan.md |
| `claude` CLI JSON output schema differs from expected | Parse defensively with `try/catch`; fall back to raw stdout; type output as `Partial<ClaudeJsonResult>` | spawner-upgrade-plan.md, F34/F38 (don't assume format) |
| Long prompts hit OS argument length limits | Monitor in testing; if hit, investigate `--system-prompt` from file | spawner-upgrade-plan.md |
| Changing `spawnAgent` signature breaks callers | Audit all callers before changing (F31). Current callers: `spawnAgentWithRetry`, `plan-stage.ts`, `spec-stage.ts`, `execute-build.ts`, `execute-verify.ts`, `execute-learn.ts`, `execute-commit.ts`, `report-stage.ts` | F31 (return-type changes without caller audit) |
| Global config singleton creates hidden coupling | Thread config explicitly through function parameters (F19 — don't rely on global/conversation memory) | P11, F19 |
| Tests import mocks instead of real modules | Verify test imports point to real `src/` paths (F37 — phantom test files) | F37 |
