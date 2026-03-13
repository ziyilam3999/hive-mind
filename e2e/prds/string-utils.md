# PRD: String Utils Library

## Problem Statement
Need a minimal TypeScript string utility library for common text transformations.

## Requirements
- REQ-01: Export a `CaseType` union type (`"camel" | "snake" | "kebab"`) and a `CaseOptions` type (`{ preserveConsecutiveUppercase?: boolean }`) from `src/types.ts`
- REQ-02: Export a `toCase(input: string, target: CaseType, options?: CaseOptions): string` function from `src/convert.ts` that converts between camelCase, snake_case, and kebab-case. Import types from `src/types.ts`.
- REQ-03: Export a `truncate(input: string, maxLength: number, suffix?: string): string` function from `src/truncate.ts`. Default suffix is "...". If input fits within maxLength, return unchanged. If suffix itself exceeds maxLength, throw an Error.
- REQ-04: Export a `wordCount(input: string): number` function and a `charFrequency(input: string): Record<string, number>` function from `src/analyze.ts`. `wordCount` splits on whitespace, ignoring leading/trailing. `charFrequency` counts each character (case-sensitive).

## Success Criteria
- `toCase("helloWorld", "snake")` returns `"hello_world"`
- `toCase("hello_world", "camel")` returns `"helloWorld"`
- `toCase("hello-world", "snake")` returns `"hello_world"`
- `truncate("hello world", 8)` returns `"hello..."`
- `truncate("hi", 10)` returns `"hi"`
- `truncate("hello", 2)` throws Error (suffix "..." exceeds maxLength 2)
- `wordCount("  hello   world  ")` returns `2`
- `charFrequency("aab")` returns `{ a: 2, b: 1 }`

## Out of Scope
- No persistence, no CLI, no external dependencies
- No package.json or tsconfig.json (raw .ts files only)
- No Unicode/emoji handling beyond basic ASCII
