/**
 * Pure helpers for the on-topic check on Grokipedia search results (see onTopicResults in
 * morning-batch.ts). Kept apart so they can be tested without the database or the API.
 */

export interface SearchResult {
  title: string;
  url: string;
}

/** Grokipedia page URL for a page title, e.g. "Video game" -> https://grokipedia.com/page/Video_game */
export function grokipediaPageUrl(title: string): string {
  return `https://grokipedia.com/page/${encodeURIComponent(title.trim().replace(/\s+/g, "_"))}`;
}

/**
 * Reads Haiku's reply: {"pages": [3, 1], "general": "Video game"}.
 * - pages: the numbered results that are about the topic, best first
 * - general: the title of the general page on the topic, when no listed page is that page
 * Returns null when the reply can't be read, or names pages that weren't listed, so the
 * caller keeps the search order. An empty list (with no general page) means none fit.
 */
export function parseSourcePick(text: string, candidates: SearchResult[]): SearchResult[] | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let reply: { pages?: unknown; general?: unknown };
  try {
    reply = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(reply.pages)) return null;
  const numbers = reply.pages as unknown[];
  const valid = numbers.filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= candidates.length);
  if (numbers.length > 0 && valid.length === 0) return null;

  const picked = valid.map(n => candidates[n - 1]);
  const general = typeof reply.general === "string" ? reply.general.trim() : "";
  if (general && general.length <= 80) {
    const url = grokipediaPageUrl(general);
    if (!picked.some(r => r.url.toLowerCase() === url.toLowerCase())) picked.unshift({ title: general, url });
  }
  return [...new Map(picked.map(r => [r.url, r])).values()];
}
