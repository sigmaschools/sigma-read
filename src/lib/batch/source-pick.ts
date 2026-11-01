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

/** Lowercase words of 3+ letters, cut to their first 4 letters, so "games" and "Game" match */
function stems(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).map(w => w.slice(0, 4)));
}

/**
 * True when the named page shares a word with the student's interest. A general page is for a
 * broad word ("games" -> "Game"); for a named thing it would swap the topic ("SpaceX" -> "Company").
 */
export function generalFits(general: string, query: string): boolean {
  const q = stems(query);
  return [...stems(general)].some(s => q.has(s));
}

/**
 * Reads Haiku's reply: {"pages": [3, 1], "general": "Video game"}.
 * - pages: the numbered results that are about the topic, best first
 * - general: the title of the general page on the topic, when no listed page is that page
 * Returns null when the reply can't be read, or names only pages that weren't listed and no
 * general page, so the caller keeps the search order. An empty list (with no general page) means none fit.
 */
export function parseSourcePick(text: string, candidates: SearchResult[], query?: string): SearchResult[] | null {
  // The old reply shape, a bare array like [3, 1], still counts as the page list
  const match = text.match(/\{[\s\S]*\}/) ?? text.match(/\[[\d,\s]*\]/);
  if (!match) return null;
  let reply: { pages?: unknown; general?: unknown };
  try {
    const parsed = JSON.parse(match[0]);
    reply = Array.isArray(parsed) ? { pages: parsed } : parsed;
  } catch {
    return null;
  }
  if (!Array.isArray(reply.pages)) return null;
  const numbers = reply.pages as unknown[];
  const valid = numbers.filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= candidates.length);
  const rawGeneral = typeof reply.general === "string" ? reply.general.trim() : "";
  // A real title: short, with at least one letter or digit (not "." or "..")
  const general = rawGeneral.length <= 80 && /[\p{L}\p{N}]/u.test(rawGeneral)
    && (query === undefined || generalFits(rawGeneral, query)) ? rawGeneral : "";
  if (numbers.length > 0 && valid.length === 0 && !general) return null;

  const picked = valid.map(n => candidates[n - 1]);
  if (general) {
    const url = grokipediaPageUrl(general);
    if (!picked.some(r => r.url.toLowerCase() === url.toLowerCase())) picked.unshift({ title: general, url });
  }
  return [...new Map(picked.map(r => [r.url, r])).values()];
}
