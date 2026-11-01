/** Pure helpers for a new student's first articles (see starter-articles.ts). No DB access. */

import { normalizeInterestProfile } from "./normalize-interests";

export const STARTER_COUNT = 3;

/** The interests to find articles for: the first few, without repeats */
export function starterInterests(profile: unknown, count = STARTER_COUNT): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const interest of normalizeInterestProfile(profile).interests) {
    const key = interest.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(interest.trim());
    if (out.length === count) break;
  }
  return out;
}

/** What the onboarding screen shows: articles ready so far, and whether to stop waiting */
export function starterProgress(status: string | null, ready: number, count = STARTER_COUNT): { ready: number; total: number; done: boolean } {
  const shown = Math.min(ready, count);
  return { ready: shown, total: count, done: status !== "pending" || shown >= count };
}
