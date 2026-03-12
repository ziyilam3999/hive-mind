# Hive Mind Persist Memory

## PATTERNS
- Use `options?.flagName ?? defaultValue` for optional config objects with boolean flags. Nullish coalescing handles explicit `false` correctly; `||` does not. (US-04)
- Pure type modules (no imports, type-only exports) carry zero runtime risk and should be isolated in standalone files as first-class components. (US-01)
- Refactor agent "do not" recommendations are as valuable as "do" recommendations — resist scope creep and style-only refactoring of working code. (US-01, US-04)
- Edge cases (empty input, delimiter-only input) should be handled at algorithm entry (Step 1) and exit (Step N), not scattered through core logic. (US-02, US-04)
- Security SPEC mitigations should be implemented as the first guards in a function before any business logic touches the input. (US-02 NaN guard, US-04 exhaustiveness guard)
- Execution-based tests using `npx tsx -e "..."` catch behavioral edge cases that grep and type-checking cannot detect. Use this for every acceptance criterion. (US-01, US-02, US-03, US-04)
- When story scope is held tight (single responsibility, minimal lines), refactoring overhead drops to zero and code ships clean on first attempt. (US-01, US-02, US-04)

## MISTAKES
- Code comment step numbers must match the SPEC exactly. Off-by-one numbering (jumping "Step 3" to "Step 5") creates confusion during review and costs a fix cycle. (US-04)
- A failing eval does not imply broken implementation. Manually run the function with `npx tsx -e "..."` as ground truth before changing any implementation code. (US-03)
- Duplicate test command files cause cascading fix failures: fixing one file while the evaluator reads from another leaves the bug alive. Always apply fixes to all copies atomically. (US-03)
- `grep -c` returns exit code 1 on zero matches (POSIX behavior). Never use `grep -c ... || echo 0` in shell test commands — it produces duplicate output. (US-03)

## DISCOVERIES
- Test infrastructure defects and code defects are orthogonal. US-03 implementation was correct in every run; all failures were test command bugs. Don't conflate them.
- Cross-story dependency imports should be verified at runtime, not assumed. Add at least one test that imports and uses symbols from dependent stories. (US-04 EC-16)
- Unambiguous spec + tight scope = zero surprises. Execution surprises trace back to spec gaps or test infrastructure bugs, not implementation complexity.

## GRADUATION LOG
