# PRD: Multi-Repo Math Library

## Problem Statement
Need a two-module math library: a shared-lib providing core arithmetic utilities, and a consumer app that uses them to build a calculator.

## Modules

| id | path | role | dependencies |
|----|------|------|-------------|
| math-core | ./math-core | producer | |
| calc-app | ./calc-app | consumer | math-core |

## Requirements

### math-core (shared-lib)
- REQ-01: Export a `add(a: number, b: number): number` and `subtract(a: number, b: number): number` function from `src/arithmetic.ts`
- REQ-02: Export a `multiply(a: number, b: number): number` and `divide(a: number, b: number): number` function from `src/arithmetic.ts`. `divide` throws an Error if `b` is 0.

### calc-app (consumer)
- REQ-03: Export a `evaluate(expression: string): number` function from `src/evaluator.ts` that parses simple expressions like `"3 + 4"`, `"10 / 2"`, `"5 * 3"`. Supported operators: `+`, `-`, `*`, `/`. Throws Error on invalid expression. Uses the functions from math-core's `arithmetic.ts`.
- REQ-04: Export a `evaluateBatch(expressions: string[]): { expression: string; result: number; error?: string }[]` function from `src/batch.ts` that evaluates multiple expressions, catching errors per-expression instead of throwing. Uses `evaluate` from `src/evaluator.ts`.

## Inter-Module Contracts
- math-core exports: `add`, `subtract`, `multiply`, `divide` from `src/arithmetic.ts`
- calc-app imports: `add`, `subtract`, `multiply`, `divide` from `math-core/src/arithmetic.ts`

## Success Criteria
- `add(2, 3)` returns `5`
- `subtract(10, 4)` returns `6`
- `multiply(3, 7)` returns `21`
- `divide(10, 2)` returns `5`
- `divide(1, 0)` throws Error
- `evaluate("3 + 4")` returns `7`
- `evaluate("10 / 2")` returns `5`
- `evaluate("invalid")` throws Error
- `evaluateBatch(["3 + 4", "1 / 0"])` returns `[{ expression: "3 + 4", result: 7 }, { expression: "1 / 0", result: 0, error: "..." }]`

## Out of Scope
- No CLI, no persistence, no external dependencies
- No package.json or tsconfig.json (raw .ts files only)
- No parentheses or operator precedence (single-operator expressions only)
