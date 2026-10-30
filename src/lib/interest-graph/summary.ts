/**
 * The plain-words view of a student's interests for guides, parents and admins. Pure.
 */

import type { Affinity } from "./affinity";

const DAY_MS = 86_400_000;
/** Shown as an interest from this score up */
export const SHOWN_MIN = 0.15;
const MAX_SHOWN = 8;
/** "New": first seen in the last two weeks, and not something the student told us */
const NEW_DAYS = 14;

export interface InterestSummary {
  /** Strongest first */
  current: { slug: string; score: number; isNew: boolean; declared: boolean }[];
  /** Declared interests that have faded below the shown threshold */
  fading: { slug: string; score: number }[];
  /** Turned off by the student ("No more") or an adult */
  removed: { slug: string }[];
}

export function summarizeInterests(affinities: Affinity[], firstSeen: Map<string, Date>, now = new Date()): InterestSummary {
  const current = affinities
    .filter(a => a.status !== "rejected" && a.score >= SHOWN_MIN)
    .slice(0, MAX_SHOWN)
    .map(a => ({
      slug: a.topicSlug,
      score: a.score,
      declared: a.status === "declared",
      isNew: a.status !== "declared" && now.getTime() - (firstSeen.get(a.topicSlug)?.getTime() ?? 0) < NEW_DAYS * DAY_MS,
    }));
  const fading = affinities
    .filter(a => a.status === "declared" && a.score < SHOWN_MIN && a.score > -SHOWN_MIN)
    .map(a => ({ slug: a.topicSlug, score: a.score }));
  const removed = affinities.filter(a => a.status === "rejected").map(a => ({ slug: a.topicSlug }));
  return { current, fading, removed };
}
