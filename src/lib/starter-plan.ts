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

/** A job still "pending" after this long died (deploy, crash, time limit) or ran over: stop waiting for it. Matches the onboarding page's own wait. */
export const STARTER_STALE_MS = 150_000;

/** True while the first articles are still being found or written */
export function starterPending(status: string | null, startedAt: Date | null, now = new Date()): boolean {
  if (status !== "pending") return false;
  return !!startedAt && now.getTime() - startedAt.getTime() < STARTER_STALE_MS;
}

/** What the onboarding screen shows: articles ready so far, and whether to stop waiting */
export function starterProgress(pending: boolean, ready: number, count = STARTER_COUNT): { ready: number; total: number; done: boolean } {
  const shown = Math.min(ready, count);
  return { ready: shown, total: count, done: !pending || shown >= count };
}
