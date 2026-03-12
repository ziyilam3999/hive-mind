/**
 * Exponential backoff with jitter for retry delays.
 */

/**
 * Calculate delay for a retry attempt using exponential backoff with ±20% jitter.
 * @param attempt - 0-indexed retry number (0 = first retry)
 * @param baseDelayMs - base delay in milliseconds (default 1000)
 * @param maxDelayMs - maximum delay cap in milliseconds (default 16000)
 * @returns delay in milliseconds with jitter applied
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, maxDelayMs);
  // ±20% uniform jitter
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.round(capped * jitterFactor);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
