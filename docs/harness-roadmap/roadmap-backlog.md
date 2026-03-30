# Harness Roadmap -- Backlog

Parking lot for new ideas that come up between releases. During release planning, pull items from here into the next release plan.

## Format
```
- BL-NNN [Pillar X] One-line description -- source/context
```

## Backlog Items

- BL-001 [P5] One PR per story in pipeline -- each story gets own branch/PR instead of one big branch (candidate for R2)
- BL-002 [P4] Evaluate which stages/prompts should be skills -- audit during R2 planning: Normalize (73 lines, 1 agent) is a strong candidate for full skill conversion; Spec/Plan too complex (orchestration logic) but their prompt text can be extracted into skills. Deferred to R2.
- BL-003 [P4] 3-tier memory model: persistent (brand voice, SOP), per-session (user query, chat history), searchable (knowledge-base, vector DB) -- aligns with R3 memory items (SQL DB, Claude-Mem)
- BL-004 [P6] Cost breakdown by agent and model type in pipeline run -- extend CostTracker to track model field per AgentCostEntry (candidate for R2)
- BL-005 [P2] Dashboard visible from Normalize stage -- show stage progress from pipeline start, not just EXECUTE; use frontend design skill for UI (candidate for R2)
- BL-006 [P2] Computer use + browser use for visual verification -- agents use computer use tool and /browser-use (Chrome extension) during VERIFY to see UI. Refs: [computer-use-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool), [let claude use your computer](https://code.claude.com/docs/en/desktop#let-claude-use-your-computer)
- BL-007 [P1] MCP vendor flexibility -- pipeline should work with any MCP tool provider, not hardcode specific vendors. Declare tool capabilities needed, resolve to available MCP servers at runtime
- BL-008 [P3] Chain-of-thoughts prompting in GAN loop -- extend current SPEC multi-role CoT to GAN pattern: evaluator reasons step-by-step before verdict, fixer reasons through diagnosis before fix. Systematize prompting techniques (temperature, think-first, output constraints, role/persona, few-shot) as skill library
- BL-009 [P5] Multi-instance coordination (cowork pattern) -- Claude Code multi-instance coordination for parallel agent sessions within pipeline. Agents coordinate like coworkers. Ref: Anthropic cowork feature
- BL-010 [P2] Google Stitch integration for AI design generation -- use Stitch's "vibe design" (intent+mood prompts) to generate UI mockups during SPEC/PLAN, feed into visual verification loop. Ref: Google Stitch March 2026 "vibe design" update
