/**
 * Claude API prices in USD per million tokens, for the admin cost view.
 * Check https://www.anthropic.com/pricing when adding a model or changing MODELS.
 * Cache writes are billed at 1.25x input (5-minute TTL; nothing here uses the 1-hour TTL); cache
 * reads at the listed rate, which is 0.1x input except Opus 5.5 (0.05x).
 */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
};

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Strip a date suffix so "claude-haiku-4-5-20251001" prices as "claude-haiku-4-5" */
function priceKey(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

/** Cost in USD, or null for a model with no listed price */
export function costUsd(model: string, usage: TokenUsage): number | null {
  const p = PRICES[priceKey(model)];
  if (!p) return null;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return (usage.input_tokens * p.input + cacheWrite * p.input * 1.25 + cacheRead * p.cacheRead + usage.output_tokens * p.output) / 1_000_000;
}
