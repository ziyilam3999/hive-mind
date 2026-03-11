# Spawner Upgrade Plan: JSON Output, Spawn, Tool Permissions, Parallel

## Context

The current spawner (`src/agents/spawner.ts`) uses `child_process.exec` + `claude --print` with
shell-escaped prompts as command-line arguments. This has limitations:

- **10MB buffer cap** from `exec` — large agent outputs can be truncated
- **Shell escaping fragility** — prompts with quotes/newlines break
- **No structured output** — raw text only, no cost/model/session metadata
- **No tool restrictions** — every agent gets all tools
- **Sequential-only** — independent agents run one-by-one

All changes stay on the `claude` CLI (Max plan billing — no Agent SDK needed).

## CLI Flags Confirmed

From `claude --help`:
- `--allowedTools <tools...>` — comma or space-separated tool names (e.g. `"Bash(git:*) Edit"`)
- `--output-format json` — structured JSON output (works with `--print`)
- `--model <model>` — alias like `sonnet`/`opus` or full name
- `--tools <tools...>` — specify built-in tool list
- Prompt is a positional argument, not stdin

## Files to Modify

| File | Change |
|------|--------|
| `src/utils/shell.ts` | Add `spawnClaude()` using `child_process.spawn` |
| `src/types/agents.ts` | Extend `AgentResult` with optional metadata fields |
| `src/agents/spawner.ts` | Rewrite `spawnAgent` + add `spawnAgentsParallel` |
| `src/stages/plan-stage.ts` | Parallelize role agents (lines 71-90) |
| `src/stages/report-stage.ts` | Parallelize reporter + retrospective |
| **NEW** `src/agents/tool-permissions.ts` | `--allowedTools` mapping for all 21 agent types |

---

## Step 1: Create `src/agents/tool-permissions.ts`

Map each agent type to its allowed tools:

| Category | Agents | Tools |
|----------|--------|-------|
| Read-only | justifier, critic, analyst, reviewer, security, architect, tester-role | Read, Glob, Grep |
| Read + Web | researcher | Read, Glob, Grep, WebSearch, WebFetch |
| With Write | spec-drafter, spec-corrector, synthesizer, learner, reporter, retrospective | Read, Glob, Grep, Write |
| With Exec | tester-exec, evaluator, diagnostician | Read, Glob, Grep, Bash |
| Full Dev | implementer, refactorer, fixer, tooling-setup | Read, Glob, Grep, Write, Edit, Bash |

Export: `getToolsForAgent(agentType: AgentType): string[]`

---

## Step 2: Add `spawnClaude()` to `src/utils/shell.ts`

New function using `child_process.spawn` instead of `exec`:

**Signature:**
```typescript
interface ClaudeSpawnOptions {
  model: string;
  prompt: string;
  outputFormat?: "json" | "text";       // default "json"
  allowedTools?: string[];
  cwd?: string;
  timeout?: number;                     // default 600_000 (10min)
  onData?: (chunk: string) => void;     // streaming progress callback
}

interface ClaudeJsonResult {
  result: string;
  cost_usd: number;
  model: string;
  session_id: string;
  duration_ms: number;
  raw: Record<string, unknown>;
}

interface ClaudeSpawnResult {
  exitCode: number;
  stderr: string;
  stdout: string;
  json?: ClaudeJsonResult;
}
```

**Key decisions:**
- Prompt passed as **positional argument** to `spawn` (no shell escaping needed — `spawn`
  passes args directly to the process without shell interpretation)
- `--output-format json` for structured response with metadata
- `--allowedTools` passed as comma-separated string
- Timeout kills child process with SIGTERM
- `onData` callback enables real-time streaming progress
- Existing `runShell()` stays unchanged for non-Claude commands

**Build the args array like:**
```typescript
const args = ["--print", "--model", model, "--output-format", "json"];
if (allowedTools.length) {
  args.push("--allowedTools", allowedTools.join(","));
}
args.push("--", prompt);  // "--" prevents prompt from being parsed as flags
```

---

## Step 3: Extend `AgentResult` in `src/types/agents.ts`

Add optional metadata fields (backward-compatible):

```typescript
export interface AgentResult {
  success: boolean;
  outputFile: string;
  error?: string;
  // New — from JSON output
  costUsd?: number;
  modelUsed?: string;
  sessionId?: string;
  durationMs?: number;
}
```

---

## Step 4: Rewrite `src/agents/spawner.ts`

### `spawnAgent` changes:
1. Replace `runShell(claude --print ...)` with `spawnClaude()`
2. Pass `allowedTools` from `getToolsForAgent(config.type)`
3. Extract content from `result.json?.result`, fall back to `result.stdout.trim()`
4. Populate new `AgentResult` metadata fields from JSON response

### Add `spawnAgentsParallel`:
```typescript
export async function spawnAgentsParallel(
  configs: AgentConfig[],
  options?: { maxConcurrency?: number },
): Promise<AgentResult[]> {
  // Worker-pool pattern with Promise.all
  // Default concurrency = configs.length (all at once)
}
```

Keep `spawnAgentWithRetry` unchanged — it delegates to `spawnAgent`.

---

## Step 5: Parallelize plan-stage role agents

**File:** `src/stages/plan-stage.ts` lines 71-90

The role agents (analyst, reviewer, security, architect, tester-role) are fully independent —
each reads the SPEC and writes its own report file. Replace sequential `for` loop with:

```typescript
const roleConfigs = activeRoles.map(role => ({
  type: role as AgentType,
  model: (role === "analyst" || role === "architect") ? "opus" : "sonnet",
  inputFiles: [specPath],
  outputFile: join(roleReportsDir, `${role}-report.md`),
  rules: getAgentRules(role as AgentType),
  memoryContent: feedbackMemory,
}));

const results = await spawnAgentsParallel(roleConfigs);
const roleReportPaths = results
  .filter(r => r.success)
  .map(r => r.outputFile);
```

---

## Step 6: Parallelize report-stage agents

**File:** `src/stages/report-stage.ts` lines 34-56

Reporter (reads report files) and retrospective (reads learning files) have independent inputs.
Run both in parallel via `spawnAgentsParallel`.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `spawn` on Windows with `shell: "bash"` behaves differently | Test on Windows; fall back to no shell option if needed |
| `claude` CLI JSON output schema may differ from expected | Parse defensively with fallback to raw stdout |
| `--allowedTools` comma syntax may not work | Verified in `claude --help`: accepts comma or space-separated |
| Long prompts as positional args may hit OS arg length limits | Monitor — if hit, investigate `--system-prompt` from file or stdin |
| Parallel agents may overwhelm API rate limits | `maxConcurrency` option available to throttle |

## Verification

1. `npm run build` — TypeScript compiles cleanly
2. `npm run test` — update mocks, all tests pass
3. Manual test: `hive-mind start --prd <test-prd>` — agents spawn, produce output files
4. Verify `--allowedTools` restricts tools (e.g., critic can't write files)
5. Verify parallel plan-stage produces same reports as sequential
6. Check JSON metadata (cost, model, duration) appears in AgentResult
