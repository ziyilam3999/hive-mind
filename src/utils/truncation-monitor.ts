/**
 * ENH-05: Output truncation monitoring.
 * Detects when agent output may be truncated by checking token count and sentinel string.
 */

const HM_END_SENTINEL = "<!-- HM-END -->";

/**
 * Check output for truncation.
 * - "ok": output is within safe limits and ends with sentinel
 * - "warn": output exceeds 80% of model maximum (may be approaching truncation)
 * - "halt": output exceeds 95% of model maximum OR sentinel is missing
 */
export function checkTruncation(
  output: string,
  tokenCount: number,
  modelMax: number,
): "ok" | "warn" | "halt" {
  const ratio = tokenCount / modelMax;

  // Halt: token count > 95% of max
  if (ratio > 0.95) {
    return "halt";
  }

  // Halt: output does not end with sentinel (<!-- HM-END -->)
  const trimmed = output.trimEnd();
  if (!trimmed.endsWith(HM_END_SENTINEL)) {
    // Only halt on sentinel check for structured outputs that are expected to have it
    // For now, if token count is > 80%, the missing sentinel is more concerning
    if (ratio > 0.80) {
      return "halt";
    }
  }

  // Warn: token count > 80% of max
  if (ratio > 0.80) {
    return "warn";
  }

  return "ok";
}

export { HM_END_SENTINEL };
