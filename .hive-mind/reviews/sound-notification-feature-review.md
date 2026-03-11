# Feature Review: Sound Notification for Pending Human Review

**Date:** 2025-03-11
**Status:** Proposal
**Author:** Claude (AI review)

---

## Problem Statement

When hive-mind reaches a checkpoint (approve-spec, approve-plan, verify, ship), the pipeline exits silently after printing a console message. If the human is away from the terminal — which is likely given stages can take 10+ minutes — they have no way of knowing the pipeline is waiting for them. This creates idle time between stages.

## Proposed Solution

Play an audible notification sound immediately before the process exits at each checkpoint. Simple, zero-dependency, works out of the box.

---

## Implementation Options Compared

### Option A: Terminal Bell Character (`\x07`) — Recommended

**How it works:** Write the ASCII BEL character to stdout. Most terminal emulators play a system notification sound (or flash the taskbar/tab).

```typescript
// src/utils/notify.ts
export function notifyCheckpoint(): void {
  process.stdout.write("\x07");
}
```

**Insertion points** (4 locations in `src/orchestrator.ts`):
1. Line 65 — after SPEC stage checkpoint write
2. Line 119 — after PLAN stage checkpoint write
3. Line 136 — after EXECUTE+REPORT checkpoint write
4. Line 150 — after verify→ship checkpoint write

| Criteria | Rating |
|----------|--------|
| Zero dependencies | Yes |
| Cross-platform | Yes (macOS, Linux, Windows, WSL) |
| Lines of code | ~5 |
| Works in SSH sessions | Yes (bell forwarded) |
| User can mute | Yes (terminal bell settings) |
| Risk | None |

**Limitation:** Some terminals have bell disabled by default (e.g., some Linux distros mute the terminal bell). But most modern terminals (iTerm2, Windows Terminal, GNOME Terminal) support it.

---

### Option B: macOS `afplay` / Linux `paplay` with bundled sound

**How it works:** Ship a small .wav/.mp3 file and play it via OS audio commands.

```typescript
import { exec } from "node:child_process";

export function notifyCheckpoint(): void {
  const soundFile = new URL("../assets/notify.wav", import.meta.url).pathname;
  if (process.platform === "darwin") {
    exec(`afplay "${soundFile}"`);
  } else {
    exec(`paplay "${soundFile}" 2>/dev/null || aplay "${soundFile}" 2>/dev/null`);
  }
}
```

| Criteria | Rating |
|----------|--------|
| Zero dependencies | Yes (OS commands only) |
| Cross-platform | Partial (macOS + Linux with PulseAudio/ALSA) |
| Lines of code | ~15 |
| Works in SSH sessions | No (plays on remote, not local) |
| Custom sound | Yes |
| Risk | Low — fails silently if no audio |

**Limitation:** Does not work over SSH. Requires audio subsystem on the machine. Adds a binary asset to the repo.

---

### Option C: `node-notifier` (OS-level notification)

**How it works:** Use the `node-notifier` npm package to trigger a native OS notification (with optional sound).

```typescript
import notifier from "node-notifier";

export function notifyCheckpoint(checkpointType: string): void {
  notifier.notify({
    title: "Hive Mind",
    message: `Checkpoint: ${checkpointType} — awaiting your review`,
    sound: true,
  });
}
```

| Criteria | Rating |
|----------|--------|
| Zero dependencies | No — adds `node-notifier` |
| Cross-platform | Yes (macOS, Linux, Windows) |
| Lines of code | ~10 |
| Works in SSH sessions | No |
| Rich notification | Yes (title, message, icon) |
| Risk | Low — new dependency |

**Limitation:** Adds a dependency. Does not work headless or over SSH.

---

### Option D: `say` command (macOS) / `espeak` (Linux) — text-to-speech

**How it works:** Speak "Hive Mind is ready for your review" aloud.

```typescript
import { exec } from "node:child_process";

export function notifyCheckpoint(checkpointType: string): void {
  const msg = `Hive Mind checkpoint ${checkpointType} is ready for review`;
  if (process.platform === "darwin") {
    exec(`say "${msg}"`);
  } else {
    exec(`espeak "${msg}" 2>/dev/null`);
  }
}
```

| Criteria | Rating |
|----------|--------|
| Zero dependencies | Yes |
| Cross-platform | Partial |
| Novelty / fun factor | High |
| Works in SSH | No |
| Risk | Low — may startle people |

---

## Recommendation

**Start with Option A (terminal bell).** It is:

- **Zero lines of new dependencies** — no npm packages, no binary assets
- **5 lines of code** total (utility + 4 call sites)
- **Cross-platform** including SSH sessions
- **User-configurable** via terminal settings (mute/visual bell)
- **Zero risk** — worst case, nothing happens

If users want richer notifications later, Option C (`node-notifier`) can be added behind a `--notify` flag as a progressive enhancement.

## Proposed Implementation

```typescript
// src/utils/notify.ts
export function notifyCheckpoint(): void {
  process.stdout.write("\x07");
}
```

Then in `src/orchestrator.ts`, add `notifyCheckpoint()` after each checkpoint console.log:

```diff
  console.log("SPEC stage complete. Awaiting approval.");
  console.log(getCheckpointMessage("approve-spec"));
+ notifyCheckpoint();
```

Repeat for all 4 checkpoint locations.

### Optional: `--silent` flag

Add a `--silent` flag to suppress the bell for CI/scripted environments:

```typescript
if (!process.argv.includes("--silent")) {
  notifyCheckpoint();
}
```

### Testing

```typescript
// src/__tests__/notify.test.ts
import { notifyCheckpoint } from "../utils/notify.js";
import { vi, test, expect } from "vitest";

test("notifyCheckpoint writes BEL character to stdout", () => {
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  notifyCheckpoint();
  expect(spy).toHaveBeenCalledWith("\x07");
  spy.mockRestore();
});
```

---

## Summary

| Option | Deps | Cross-platform | SSH | Effort | Recommendation |
|--------|------|---------------|-----|--------|----------------|
| A: Terminal bell `\x07` | 0 | Full | Yes | 5 LOC | **Use this** |
| B: OS audio commands | 0 | Partial | No | 15 LOC | Fallback |
| C: node-notifier | 1 | Full | No | 10 LOC | Future enhancement |
| D: Text-to-speech | 0 | Partial | No | 10 LOC | Fun but impractical |
