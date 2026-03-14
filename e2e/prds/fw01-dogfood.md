# PRD: Quiz Game Engine

## Problem Statement
Build a TypeScript quiz game engine that manages question banks, runs quiz sessions, scores answers, and generates result reports.

## Requirements

- REQ-01: Core data model and question bank. Define `Question` type (id, text, options: string[], correctIndex: number, category: string, difficulty: "easy"|"medium"|"hard"), `QuizSession` type (id, questions: Question[], answers: Map<string, number>, startTime, endTime?), and `QuizResult` type (sessionId, totalQuestions, correct, wrong, skipped, score: number, categoryBreakdown: Map<string, {correct, total}>). Implement `QuestionBank` class in `src/question-bank.ts` with methods: `addQuestion(q)`, `getByCategory(cat): Question[]`, `getByDifficulty(d): Question[]`, `getRandom(count, opts?: {category?, difficulty?}): Question[]`. The random selection must not repeat questions within a session. Export types from `src/types.ts`.

- REQ-02: Quiz session management with scoring and result generation. Implement a complete quiz flow across multiple files: `QuizEngine` class in `src/engine.ts` that creates sessions (`startQuiz(questions): QuizSession`), records answers (`submitAnswer(sessionId, questionId, answerIndex): {correct: boolean, correctAnswer: string}`), ends sessions (`endQuiz(sessionId): QuizResult`), and computes detailed results. The engine must track per-category performance, handle skipped questions (unanswered at endQuiz), validate answer indices, prevent answering after quiz ends, and compute percentage scores. Scoring formula: `(correct / totalQuestions) * 100`, rounded to 1 decimal. The engine must use `QuestionBank` from `src/question-bank.ts` for question retrieval, types from `src/types.ts`, and result formatting from `src/formatter.ts`. Create `src/formatter.ts` with `formatResult(result: QuizResult): string` that produces a human-readable report with score, category breakdown table, and pass/fail indicator (≥70% = pass). Also create `src/validator.ts` with `validateQuestion(q: unknown): {valid: boolean, errors: string[]}` that validates question structure (non-empty text, 2-6 options, valid correctIndex, valid difficulty). The engine must validate all questions before starting a quiz.

- REQ-03: Quiz configuration and difficulty scaling. Implement `QuizConfig` type in `src/types.ts` (timeLimit?: number, shuffleOptions: boolean, adaptiveDifficulty: boolean) and `DifficultyScaler` class in `src/scaler.ts`. When adaptive difficulty is enabled, the scaler adjusts question difficulty based on running performance: if last 3 answers are all correct, increase difficulty; if last 3 are all wrong, decrease difficulty. The scaler maintains internal state and exposes `getNextDifficulty(): "easy"|"medium"|"hard"` and `recordAnswer(correct: boolean): void`.

## Success Criteria
- QuestionBank.getRandom returns non-repeating questions filtered by criteria
- QuizEngine.submitAnswer validates indices and returns correct/incorrect feedback
- QuizEngine.endQuiz computes accurate category breakdowns and scores
- formatResult produces readable report with pass/fail for ≥70% threshold
- validateQuestion catches all structural errors
- DifficultyScaler adjusts difficulty based on rolling 3-answer window
- QuizEngine rejects answers after quiz is ended
- Score calculation: (correct/total)*100 rounded to 1 decimal

## Out of Scope
- No external dependencies beyond Node.js built-ins
- No package.json or tsconfig.json (raw .ts files only)
- No persistence or CLI interface
- No timer enforcement (timeLimit is recorded but not enforced)
