import type { CaseType, CaseOptions } from "./types.ts";

// Note: Regex patterns use ASCII-only [a-z]/[A-Z] classes.
// Non-ASCII characters (é, ü, etc.) will not trigger camelCase boundaries.
// Do not modify these patterns without a ReDoS review — fixed-width lookbehinds are safe.

/**
 * Converts a string identifier between camelCase, snake_case, and kebab-case.
 */
export function toCase(
  input: string,
  target: CaseType,
  options?: CaseOptions
): string {
  // Step 1: empty guard
  if (input === "") return "";

  const preserveConsecutiveUppercase =
    options?.preserveConsecutiveUppercase ?? false;

  // Step 2: Phase 1 — boundary split on delimiters and camelCase boundaries
  let tokens = input.split(/[_\-]|(?<=[a-z])(?=[A-Z])/);

  // Step 3: Phase 2 — split consecutive uppercase within each token
  const phase2Regex = preserveConsecutiveUppercase
    ? /(?<=[A-Z])(?=[A-Z][a-z])/
    : /(?<=[A-Z])(?=[A-Z])/;

  tokens = tokens.flatMap((token) => token.split(phase2Regex));

  // Step 4: lowercase all tokens
  tokens = tokens.map((t) => t.toLowerCase());

  // Step 5: filter empties (handles delimiter-only input e.g. "---")
  tokens = tokens.filter((t) => t !== "");

  if (tokens.length === 0) return "";

  // Step 7: rejoin per target case
  if (target === "snake") {
    return tokens.join("_");
  } else if (target === "kebab") {
    return tokens.join("-");
  } else if (target === "camel") {
    return tokens
      .map((t, i) => (i === 0 ? t : t[0].toUpperCase() + t.slice(1)))
      .join("");
  }

  // Runtime exhaustiveness guard (CaseType is erased at runtime)
  throw new Error(`Unknown target case: ${target}`);
}
