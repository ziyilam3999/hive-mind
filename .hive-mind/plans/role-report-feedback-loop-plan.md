# Role-Report Feedback Loop Plan (ENH-16)

## Context

Role-reports (analyst, architect, reviewer, security, tester) are generated during planning but never consumed by execution agents. Each agent re-derives insights from scratch. This wastes tokens and risks missing specialist findings. Evidence from hm-e2e-run05 shows concrete cases where role-report intelligence would have accelerated diagnosis and prevented redundant work.

This plan implements both Part A (planning artifact enrichment) and Part B (execution agent context injection) from the design at `../../.hive-mind/design/role-report-feedback-loop.md`.

**User decisions:**
- Part A uses a **post-synthesis enrichment step** (separate agent patches step files after extraction)
- Part B uses **full content injection** (role-report content embedded directly in agent prompts)

---

## Files to Modify

| File | Change |
|------|--------|
| `src/types/agents.ts` | Add `"enricher"` to AgentType, add `roleReportContents` to AgentConfig |
| `src/types/execution-plan.ts` | Add `securityRisk`, `complexityJustification`, `dependencyImpact` to Story |
| `src/agents/prompts.ts` | Add ROLE_REPORT_MAPPING, `getRoleReportsForAgent()`, enricher job/rules, update `buildPrompt()` |
| `src/agents/model-map.ts` | Add `"enricher": "sonnet"` |
| `src/stages/plan-stage.ts` | Add `enrichStepFiles()` step, update schema, update AC consolidator inputs |
| `src/stages/execute-build.ts` | Accept `roleReportsDir`, inject role-reports into implementer + refactorer |
| `src/stages/execute-verify.ts` | Accept `roleReportsDir`, inject role-reports into tester + evaluator + diagnostician |
| `src/stages/execute-learn.ts` | Accept `roleReportsDir`, add all role-reports to learner inputFiles |
| `src/orchestrator.ts` | Thread `roleReportsDir` to execute-stage functions |
| `src/__tests__/stages/*.test.ts` | Update existing tests for new signatures and role-report injection |

---

## Implementation Steps

### Step 1: Extend Story type with new fields

**File:** `src/types/execution-plan.ts`

- Add optional `securityRisk?: "none" | "low" | "medium" | "high"` to Story
- Add optional `complexityJustification?: string` and `dependencyImpact?: string`
- Update `RoleName` to include `"tester-role"` (currently only `"tester"`)

### Step 2: Update synthesizer schema

**File:** `src/stages/plan-stage.ts` (lines 128-152)

- Add `securityRisk`, `complexityJustification`, `dependencyImpact` to the EXECUTION_PLAN_SCHEMA string so the synthesizer produces these fields

### Step 3: Add enricher agent type

**Files:** `src/types/agents.ts`, `src/agents/prompts.ts`, `src/agents/model-map.ts`

- Add `"enricher"` to AgentType union
- Add enricher to AGENT_JOBS: `"Enrich step files with relevant role-report findings"`
- Add enricher to AGENT_RULES with 4 rules:
  - `APPEND-ONLY`: Add new sections below existing content. Never modify existing AC, EC, OUTPUT, or SPEC REFERENCES sections.
  - `SELECTIVE`: Only include findings directly relevant to THIS story's scope. Skip generic findings.
  - `STRUCTURED`: Use exact section headings: ## Implementation Guidance, ## Spec Clarifications, ## Security Requirements, ## Edge Cases. Each finding as a bullet with source ref (e.g., "D2 from architect-report").
  - `PRESERVE`: Keep the step file self-contained. Enriched sections are supplementary, not replacements.
- Add `"enricher": "sonnet"` to model map

### Step 4: Add post-synthesis enrichment step (P3.5)

**File:** `src/stages/plan-stage.ts`

After `extractStepFiles()` (line 168), before AC consolidator (line 170):

1. New exported function `enrichStepFiles(stepsDir, roleReportsDir, memoryContent)`:
   - Lists step files in `stepsDir`
   - For each step file, spawns enricher agent with:
     - `inputFiles`: [stepFilePath, ...existingRoleReportPaths]
     - `outputFile`: same stepFilePath (overwrites with enriched version)
   - The enricher reads the step file + role reports, appends structured sections

2. Call `enrichStepFiles()` in `runPlanStage()` between extraction and AC consolidation

### Step 5: Enrich AC consolidator

**File:** `src/stages/plan-stage.ts` (lines 170-182)

- Add role-report paths to AC consolidator's `inputFiles` (currently only `stepsDir`)
- Update rule: `"CONSOLIDATE: Collect all ACs and ECs from step files. Also append a ## Gap Cases section with edge cases from analyst-report, gap test cases from tester-role-report, and minor findings from reviewer-report that imply missing ACs."`

### Step 6: Add role-report-to-agent mapping

**File:** `src/agents/prompts.ts`

New constant and helper:

```typescript
const ROLE_REPORT_MAPPING: Record<string, string[]> = {
  implementer:   ["architect", "security", "analyst"],
  "tester-exec": ["tester-role", "analyst", "security"],
  refactorer:    ["architect", "reviewer"],
  diagnostician: ["architect", "security", "tester-role"],
  evaluator:     ["analyst"],
  learner:       ["analyst", "reviewer", "security", "architect", "tester-role"],
};

export function getRoleReportsForAgent(
  agentType: AgentType,
  roleReportsDir: string,
): string[]
// Returns existing file paths matching the mapping for agentType
```

### Step 7: Update AgentConfig and buildPrompt()

**Files:** `src/types/agents.ts`, `src/agents/prompts.ts`

- Add `roleReportContents?: Array<{ role: string; content: string }>` to AgentConfig
- In `buildPrompt()`, if `roleReportContents` is non-empty, append after INPUT:
  ```
  ## ROLE REPORT REFERENCES
  ### Architect Report
  [full content]
  ### Security Report
  [full content]
  ```

### Step 8: Wire role-reports into execute-build.ts

**File:** `src/stages/execute-build.ts`

- `runBuild()` accepts new `roleReportsDir` parameter
- For implementer: read architect + security + analyst reports, pass as `roleReportContents`
- For refactorer: read architect + reviewer reports, pass as `roleReportContents`
- Use `getRoleReportsForAgent()` + `readFileSafe()` to build the content array

### Step 9: Wire role-reports into execute-verify.ts

**File:** `src/stages/execute-verify.ts`

- `runVerify()` accepts new `roleReportsDir` parameter
- tester-exec (E.3): inject tester-role + analyst + security
- evaluator (E.5): inject analyst
- diagnostician (E.4a): inject architect + security + tester-role
- Fixer does NOT receive role-reports (follows diagnosis)

### Step 10: Wire role-reports into execute-learn.ts

**File:** `src/stages/execute-learn.ts`

- `runLearn()` accepts new `roleReportsDir` parameter
- Add all 5 role-report file paths to `inputFiles` (learner needs broad context for planned-vs-actual comparison)

### Step 11: Update orchestrator

**File:** `src/orchestrator.ts`

- Thread `roleReportsDir` (= `join(hiveMindDir, "plans", "role-reports")`) to `runBuild()`, `runVerify()`, `runLearn()`

### Step 12: Update tests

| Test File | Changes |
|-----------|---------|
| `__tests__/stages/plan-stage.test.ts` | Verify enricher agent spawned after step extraction; verify AC consolidator receives role-report paths |
| `__tests__/stages/execute-build.test.ts` | Update `runBuild()` calls with roleReportsDir; verify implementer/refactorer receive roleReportContents |
| `__tests__/stages/execute-verify.test.ts` | Update `runVerify()` calls; verify tester/evaluator/diagnostician get appropriate reports |
| `__tests__/stages/execute-learn.test.ts` | Update `runLearn()` calls; verify learner gets all 5 role-reports |
| `__tests__/agents/prompts.test.ts` (new) | Test `getRoleReportsForAgent()` mapping; test `buildPrompt()` with roleReportContents |

---

## Verification

1. **Type check:** `npx tsc --noEmit` — no type errors
2. **Unit tests:** `npx vitest run` — all existing + new tests pass
3. **Manual inspection:**
   - Step files contain enrichment sections (## Implementation Guidance, etc.) after plan stage
   - acceptance-criteria.md contains ## Gap Cases section
   - execution-plan.json contains securityRisk fields
4. **Prompt check:** Temporary `console.log` in `buildPrompt()` confirms role-report content in `## ROLE REPORT REFERENCES` per agent mapping
