export function truncate(
  input: string,
  maxLength: number,
  suffix?: string
): string {
  if (maxLength < 0 || !Number.isFinite(maxLength)) {
    throw new Error("maxLength must be non-negative");
  }

  suffix = suffix ?? "...";

  if (input.length <= maxLength) {
    return input;
  }

  if (suffix.length > maxLength) {
    throw new Error("Suffix length exceeds maxLength");
  }

  return input.slice(0, maxLength - suffix.length) + suffix;
}
