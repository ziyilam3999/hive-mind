import { describe, it, expect } from "vitest";
import { Mutex, runWithConcurrency } from "../../utils/concurrency.js";

describe("Mutex", () => {
  it("allows immediate acquire when unlocked", async () => {
    const mutex = new Mutex();
    await mutex.acquire();
    // Should not hang — acquired immediately
    mutex.release();
  });

  it("blocks second acquire until release", async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    await mutex.acquire();

    const p2 = mutex.acquire().then(() => {
      order.push(2);
      mutex.release();
    });

    order.push(1);
    mutex.release();
    await p2;

    expect(order).toEqual([1, 2]);
  });

  it("maintains FIFO ordering", async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    await mutex.acquire();

    const p1 = mutex.acquire().then(() => { order.push(1); mutex.release(); });
    const p2 = mutex.acquire().then(() => { order.push(2); mutex.release(); });
    const p3 = mutex.acquire().then(() => { order.push(3); mutex.release(); });

    mutex.release();
    await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);
  });

  it("runExclusive serializes access", async () => {
    const mutex = new Mutex();
    const order: string[] = [];

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    await Promise.all([
      mutex.runExclusive(async () => { order.push("a-start"); await delay(20); order.push("a-end"); }),
      mutex.runExclusive(async () => { order.push("b-start"); await delay(10); order.push("b-end"); }),
    ]);

    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("runExclusive releases on error", async () => {
    const mutex = new Mutex();

    await expect(
      mutex.runExclusive(async () => { throw new Error("boom"); }),
    ).rejects.toThrow("boom");

    // Mutex should be free — next acquire should succeed immediately
    const result = await mutex.runExclusive(async () => "ok");
    expect(result).toBe("ok");
  });
});

describe("runWithConcurrency", () => {
  it("returns empty array for empty input", async () => {
    const results = await runWithConcurrency([], 3);
    expect(results).toEqual([]);
  });

  it("runs all tasks when limit >= tasks.length", async () => {
    const results = await runWithConcurrency(
      [() => Promise.resolve(1), () => Promise.resolve(2), () => Promise.resolve(3)],
      10,
    );
    expect(results).toEqual([
      { status: "fulfilled", value: 1 },
      { status: "fulfilled", value: 2 },
      { status: "fulfilled", value: 3 },
    ]);
  });

  it("respects concurrency limit", async () => {
    let maxConcurrent = 0;
    let current = 0;

    const task = () => new Promise<void>((resolve) => {
      current++;
      maxConcurrent = Math.max(maxConcurrent, current);
      setTimeout(() => { current--; resolve(); }, 10);
    });

    await runWithConcurrency([task, task, task, task, task], 2);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("preserves result order regardless of completion order", async () => {
    const results = await runWithConcurrency([
      () => new Promise<string>((r) => setTimeout(() => r("slow"), 30)),
      () => Promise.resolve("fast"),
    ], 2);

    expect(results[0]).toEqual({ status: "fulfilled", value: "slow" });
    expect(results[1]).toEqual({ status: "fulfilled", value: "fast" });
  });

  it("captures rejected tasks without aborting others", async () => {
    const results = await runWithConcurrency([
      () => Promise.resolve("ok"),
      () => Promise.reject(new Error("fail")),
      () => Promise.resolve("also-ok"),
    ], 3);

    expect(results[0]).toEqual({ status: "fulfilled", value: "ok" });
    expect(results[1].status).toBe("rejected");
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(results[2]).toEqual({ status: "fulfilled", value: "also-ok" });
  });

  it("runs sequentially with limit=1", async () => {
    const order: number[] = [];
    const results = await runWithConcurrency([
      async () => { order.push(1); return "a"; },
      async () => { order.push(2); return "b"; },
      async () => { order.push(3); return "c"; },
    ], 1);

    expect(order).toEqual([1, 2, 3]);
    expect(results.map((r) => (r as PromiseFulfilledResult<string>).value)).toEqual(["a", "b", "c"]);
  });
});
