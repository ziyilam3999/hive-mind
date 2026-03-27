# Harness Roadmap -- Backlog

Parking lot for new ideas that come up between releases. During release planning, pull items from here into the next release plan.

## Format
```
- [Pillar X] One-line description -- source/context
```

## Backlog Items

- [P5] One PR per story in pipeline -- each story gets own branch/PR instead of one big branch (candidate for R2)
- [P4] Evaluate which stages/prompts should be skills -- audit during R2 planning: Normalize (73 lines, 1 agent) is a strong candidate for full skill conversion; Spec/Plan too complex (orchestration logic) but their prompt text can be extracted into skills. Deferred to R2.
- [P4] 3-tier memory model: persistent (brand voice, SOP), per-session (user query, chat history), searchable (knowledge-base, vector DB) -- aligns with R3 memory items (SQL DB, Claude-Mem)
- [P6] Cost breakdown by agent and model type in pipeline run -- extend CostTracker to track model field per AgentCostEntry (candidate for R2)
- [P2] Dashboard visible from Normalize stage -- show stage progress from pipeline start, not just EXECUTE; use frontend design skill for UI (candidate for R2)
