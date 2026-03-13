/**
 * Concurrency utilities: Mutex and bounded-parallelism runner.
 *
 * Mutex provides FIFO-ordered exclusive access to a critical section.
 * runWithConcurrency executes tasks with a bounded worker pool,
 * returning PromiseSettledResult for each task (no single failure aborts the batch).
 */

export class Mutex {
  private _queue: Array<() => void> = [];
  private _locked = false;

  async acquire(): Promise<void> {
    if (!this._locked) {
      this._locked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this._queue.push(resolve);
    });
  }

  release(): void {
    if (this._queue.length > 0) {
      const next = this._queue.shift()!;
      next();
    } else {
      this._locked = false;
    }
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

/**
 * Runs tasks with bounded concurrency using a worker-pool pattern.
 * Returns PromiseSettledResult for each task, preserving input order.
 * One task failure does not abort others (Promise.allSettled semantics).
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  if (tasks.length === 0) return [];

  const effectiveLimit = Math.min(limit, tasks.length);
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      try {
        const value = await tasks[idx]();
        results[idx] = { status: "fulfilled", value };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: effectiveLimit }, () => worker());
  await Promise.all(workers);

  return results;
}
