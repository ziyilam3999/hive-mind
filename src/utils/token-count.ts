export function estimateWordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function estimateTokens(text: string): number {
  return Math.ceil(estimateWordCount(text) * 1.3);
}
