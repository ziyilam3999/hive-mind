import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { calculateBackoffDelay, sleep } from "../../utils/backoff.js";

describe("calculateBackoffDelay", () => {
  beforeEach(() => {
    // Fix Math.random for deterministic tests
    vi.spyOn(Math, "random").mockReturnValue(0.5); // jitter factor = 0.8 + 0.5*0.4 = 1.0 (no jitter)
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ~1000ms for attempt 0 with defaults", () => {
    const delay = calculateBackoffDelay(0, 1000, 16000);
    expect(delay).toBe(1000);
  });

  it("returns ~2000ms for attempt 1", () => {
    const delay = calculateBackoffDelay(1, 1000, 16000);
    expect(delay).toBe(2000);
  });

  it("returns ~4000ms for attempt 2", () => {
    const delay = calculateBackoffDelay(2, 1000, 16000);
    expect(delay).toBe(4000);
  });

  it("returns ~8000ms for attempt 3", () => {
    const delay = calculateBackoffDelay(3, 1000, 16000);
    expect(delay).toBe(8000);
  });

  it("caps at maxDelayMs for attempt 4", () => {
    const delay = calculateBackoffDelay(4, 1000, 16000);
    expect(delay).toBe(16000);
  });

  it("stays capped for very high attempt numbers (no overflow)", () => {
    const delay = calculateBackoffDelay(100, 1000, 16000);
    expect(delay).toBe(16000);
  });

  it("respects custom base and max from config", () => {
    const delay = calculateBackoffDelay(0, 500, 8000);
    expect(delay).toBe(500);
    const delay2 = calculateBackoffDelay(3, 500, 8000);
    expect(delay2).toBe(4000);
    const delay3 = calculateBackoffDelay(5, 500, 8000);
    expect(delay3).toBe(8000);
  });

  it("applies jitter within ±20% range", () => {
    vi.restoreAllMocks();

    // Run many samples and check bounds
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      samples.push(calculateBackoffDelay(0, 1000, 16000));
    }

    const min = Math.min(...samples);
    const max = Math.max(...samples);

    // Base delay 1000: jitter range is [800, 1200]
    expect(min).toBeGreaterThanOrEqual(800);
    expect(max).toBeLessThanOrEqual(1200);
    // With 200 samples, should have some spread
    expect(max - min).toBeGreaterThan(50);
  });

  it("applies jitter at max delay within ±20% of cap", () => {
    vi.restoreAllMocks();

    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      samples.push(calculateBackoffDelay(10, 1000, 16000));
    }

    const min = Math.min(...samples);
    const max = Math.max(...samples);

    // Max delay 16000: jitter range is [12800, 19200]
    expect(min).toBeGreaterThanOrEqual(12800);
    expect(max).toBeLessThanOrEqual(19200);
  });

  it("applies minimum jitter (random=0)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const delay = calculateBackoffDelay(0, 1000, 16000);
    expect(delay).toBe(800); // 1000 * 0.8
  });

  it("applies maximum jitter (random≈1)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9999);
    const delay = calculateBackoffDelay(0, 1000, 16000);
    expect(delay).toBe(1200); // 1000 * 1.2 (rounded)
  });
});

describe("sleep", () => {
  it("resolves after the specified delay", async () => {
    vi.useFakeTimers();
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await promise; // should resolve without timeout
    vi.useRealTimers();
  });
});
