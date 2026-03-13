export function wordCount(input: string): number {
  return input.split(/\s+/).filter(Boolean).length;
}

export function charFrequency(input: string): Record<string, number> {
  const freq: Record<string, number> = {};
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    freq[ch] = (freq[ch] || 0) + 1;
  }
  return freq;
}
