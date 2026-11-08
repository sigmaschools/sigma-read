/**
 * Pure helpers for the on-topic check on search results (see onTopicResults in
 * morning-batch.ts). Kept apart so they can be tested without the database or the API.
 *
 * Until 2026-11-09 the check could also name the general encyclopedia page on a broad interest
 * ("animals" -> "Animal"), which turned interests into topic overviews; that is gone. A search
 * now runs on a specific story angle (story-angles.ts), and only pages about that story count.
 */

export interface SearchResult {
  title: string;
  url: string;
}

/**
 * Reads the model's reply: {"pages": [3, 1]} (or the old bare array [3, 1]), the numbered
 * results that are about the story, best first. Returns null when the reply can't be read or
 * names only pages that weren't listed, so the caller keeps the search order. An empty list
 * means none fit.
 */
export function parseSourcePick(text: string, candidates: SearchResult[]): SearchResult[] | null {
  const match = text.match(/\{[\s\S]*\}/) ?? text.match(/\[[\d,\s]*\]/);
  if (!match) return null;
  let reply: { pages?: unknown };
  try {
    const parsed = JSON.parse(match[0]);
    reply = Array.isArray(parsed) ? { pages: parsed } : parsed;
  } catch {
    return null;
  }
  if (!Array.isArray(reply.pages)) return null;
  const numbers = reply.pages as unknown[];
  const valid = numbers.filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= candidates.length);
  if (numbers.length > 0 && valid.length === 0) return null;
  const picked = valid.map(n => candidates[n - 1]);
  return [...new Map(picked.map(r => [r.url, r])).values()];
}
