import { HiveMindError } from "./errors.js";

const CONSECUTIVE_HIT_THRESHOLD = 3;

export class UsageLimitError extends HiveMindError {
  constructor() {
    super(
      `Claude API usage limit detected: ${CONSECUTIVE_HIT_THRESHOLD} consecutive agents returned no output. ` +
      "Pipeline will pause so you can wait for the limit to reset.",
    );
    this.name = "UsageLimitError";
  }
}

export class UsageLimitTracker {
  private consecutiveHits = 0;

  recordHit(): void {
    this.consecutiveHits++;
  }

  recordSuccess(): void {
    this.consecutiveHits = 0;
  }

  shouldPause(): boolean {
    return this.consecutiveHits >= CONSECUTIVE_HIT_THRESHOLD;
  }

  /** Throws UsageLimitError if threshold reached. */
  enforceLimit(): void {
    if (this.shouldPause()) {
      throw new UsageLimitError();
    }
  }

  reset(): void {
    this.consecutiveHits = 0;
  }

  get count(): number {
    return this.consecutiveHits;
  }
}

export const usageLimitTracker = new UsageLimitTracker();
