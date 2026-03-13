# PRD: Task Tracker Library

## Problem Statement
Need a minimal TypeScript library for tracking tasks with status transitions.

## Requirements
- REQ-01: Export a `Task` type from `src/types.ts` with fields: `id: string`, `title: string`, `status: "todo" | "in-progress" | "done"`
- REQ-02: Export a `createTask(id: string, title: string): Task` function from `src/task.ts` that returns a Task with status "todo"
- REQ-03: Export a `transition(task: Task, to: Task["status"]): Task` function from `src/task.ts` that returns a new Task with updated status. Valid transitions: todo->in-progress, in-progress->done. Throw Error for invalid transitions.
- REQ-04: Export a `TaskList` class from `src/task-list.ts` with methods: `add(task: Task): void`, `getById(id: string): Task | undefined`, `listByStatus(status: Task["status"]): Task[]`

## Success Criteria
- `createTask("1", "Test")` returns `{ id: "1", title: "Test", status: "todo" }`
- `transition(todoTask, "in-progress")` returns task with status "in-progress"
- `transition(todoTask, "done")` throws Error
- `TaskList.add()` + `getById()` round-trips correctly
- `TaskList.listByStatus("todo")` filters correctly

## Out of Scope
- No persistence, no CLI, no external dependencies
- No package.json or tsconfig.json (raw .ts files only)
