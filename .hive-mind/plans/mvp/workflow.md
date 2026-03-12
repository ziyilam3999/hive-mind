# MVP Development Workflow — Phase Lifecycle Protocol

> The single reference an agent reads at session start to understand how MVP development works.

---

## Session Start Checklist

1. Read `progress.md` — find "Current Status" line
2. Read the active `phase-{N}-{slug}.md` — find next action
3. Execute

---

## Phase Lifecycle: Plan → Execute → Learn → Feed Forward

Every phase follows this complete cycle:

```
┌─────────────────────────────────────────────────────────┐
│  PRE-PHASE: Create Implementation Plan                  │
│                                                         │
│  Review inputs:                                         │
│  ├── Memory: ../.hive-mind/memory.md                    │
│  │     (shared, repo-level)                             │
│  │     → PATTERNS, MISTAKES, DISCOVERIES                │
│  │                                                      │
│  ├── Knowledge base: ../.hive-mind/knowledge-base/      │
│  │     (shared, repo-level — 7 files)                   │
│  │     → Proven patterns, anti-patterns, constraints,   │
│  │       essential core, compliance, process, metrics   │
│  │                                                      │
│  ├── Previous phase learnings:                          │
│  │     mvp/learnings/phase-{N-1}-learnings.md           │
│  │     → Calibrate estimates, pre-mitigate risks        │
│  │                                                      │
│  └── mvp-plan.md (high-level design)                    │
│        → Items, dependencies, smoke test criteria       │
│                                                         │
│  Output: phase-{N}-{slug}.md                            │
│  Must include: "Inputs Consulted" section               │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  EXECUTION: Implement per the phase plan                │
│                                                         │
│  - Follow execution order in phase-{N}-{slug}.md        │
│  - Update progress.md after each item completes:        │
│      npm run progress -- --item N --status done         │
│      npm run progress -- --metrics                      │
│  - Run Tier 1 tests on every code change                │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  SMOKE TEST GATE                                        │
│                                                         │
│  - Tier 1 (Unit): every code change                     │
│  - Tier 2 (Integration): phase boundary                 │
│  - Tier 3 (Live/Dogfood): Phase 2+ (see mvp-plan.md)   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  POST-PHASE: Learning Capture                           │
│                                                         │
│  1. Fill learnings/phase-{N}-learnings.md               │
│  2. Update knowledge base (if reusable patterns found)  │
│     → ../.hive-mind/knowledge-base/                     │
│  3. Update memory (if applicable)                       │
│     → ../.hive-mind/memory.md                           │
│  4. Update progress.md (mark learnings captured)        │
│  5. Create next phase's implementation plan             │
└─────────────────────────────────────────────────────────┘
```

---

## Input Locations

| Input | Path | Scope |
|-------|------|-------|
| Memory | `C:\Users\ziyil\coding_projects\.hive-mind\memory.md` | Shared (repo-level) |
| Knowledge base | `C:\Users\ziyil\coding_projects\.hive-mind\knowledge-base\` | Shared (repo-level) |
| Phase learnings | `hive-mind-v3/.hive-mind/plans/mvp/learnings/` | v3-specific |
| MVP plan | `hive-mind-v3/.hive-mind/plans/mvp-plan.md` | v3-specific |
| Progress tracker | `hive-mind-v3/.hive-mind/plans/mvp/progress.md` | v3-specific |
| Document guidelines | `C:\Users\ziyil\coding_projects\.hive-mind\document-guidelines.md` | Shared (repo-level) |
| Multi-repo design | `C:\Users\ziyil\coding_projects\.hive-mind\design\multi-repo-enhancements.md` | Shared (repo-level) |

---

## Standard Implementation Plan Template

Every `phase-{N}-{slug}.md` follows this structure:

```markdown
# Phase {N}: {Name} — Implementation Plan

## Inputs Consulted
- [ ] Claude memory: {what was found, what was applied — or "N/A (first phase)"}
- [ ] Knowledge base: {patterns reused — or "N/A (not yet created)"}
- [ ] Previous phase learnings: {key takeaways applied — or "N/A (first phase)"}
- [ ] mvp-plan.md: {items and smoke test criteria for this phase}

## Items
### {Item ID}: {Name}
- **Goal:** ...
- **Files to create:** with rationale
- **Files to modify:** with file:line references and what changes
- **Function signatures:** for new public APIs
- **Key decisions:** with reasoning

## Execution Order
Step-by-step sequence (not just file lists), noting dependencies between steps.

## Tests to Write
Per item, with expected behavior described.

## Smoke Test Gate (from mvp-plan.md)
Tier 1 / Tier 2 / Tier 3 criteria copied here for easy reference.

## Risk Mitigations
Informed by prior phase learnings (or first-principles for Phase 1).
```

---

## Learnings Template

Each `learnings/phase-{N}-learnings.md` follows this structure:

```markdown
# Phase {N} Learnings: {Phase Name}
**Completed:** {date} | **Sessions:** {count} | **Gate:** {pass/fail date}

## What Went Well
- ...

## What Was Harder Than Expected
- ...

## Patterns Discovered
- ...

## Mistakes / Rework
- ...

## Estimates vs Actuals
| Item | Estimated Effort | Actual | Notes |
|------|-----------------|--------|-------|

## Test Gaps Found
- ...

## Recommendations for Next Phase
- ...
```

---

## What Gets Captured Where

| Learning Type | Destination | Example |
|--------------|-------------|---------|
| Reusable code pattern | `.hive-mind/knowledge-base/` | "Atomic file write pattern for state files" |
| Architectural decision | Design doc or inline comment | "Why config is threaded, not global" |
| Process pattern/mistake/discovery | `.hive-mind/memory.md` | "Config threading avoids global state issues (P32)" |
| Effort calibration | `mvp/learnings/phase-N-learnings.md` | "Medium items took ~1.5 sessions on average" |
| Test gap | New test + learnings note | "Missing test for config with unknown keys" |

---

## Phase Completion Checklist

Before moving to Phase N+1, verify:

- [ ] All items in phase plan are implemented
- [ ] All Tier 1 + Tier 2 smoke tests pass
- [ ] Tier 3 (if required for this phase) passes
- [ ] `learnings/phase-{N}-learnings.md` is filled out
- [ ] Knowledge base updated (if reusable patterns found)
- [ ] Memory updated (if applicable)
- [ ] `progress.md` updated with completion dates and gate status
- [ ] Phase work committed to git (commit hash recorded in `progress.md`)
- [ ] Next phase's implementation plan created (consulting all inputs)

---

## Naming Convention

- Phase plans: `phase-{N}-{slug}.md` where slug matches the phase name from mvp-plan.md
- Learnings: `learnings/phase-{N}-learnings.md`
- Phases: foundation, reliability, visibility-dx, pipeline-quality, execution-power, multi-repo
