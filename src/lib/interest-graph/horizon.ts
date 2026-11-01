/**
 * Horizon topics: what a student might like next, chosen from the topic map around what they
 * already like. A topic next to several of their strong interests ranks higher; topics they
 * already know (liked, disliked or turned off) and broad groups are left out. Pure; see
 * horizonTopicsFor in index.ts for the data.
 */

import type { Affinity } from "./affinity";
import type { RelatedTopic } from "./index";

/** Grow from this many of the student's strongest topics */
export const HORIZON_SEEDS = 5;
/** A seed needs at least this score */
export const HORIZON_MIN_SEED = 0.15;
/** A topic with this much evidence either way is already known, not a horizon */
export const HORIZON_KNOWN = 0.1;

export function rankHorizonTopics(
  affinities: Affinity[],
  /** Seed slug → its related topics */
  related: Map<string, RelatedTopic[]>,
  /** Slugs that have children (domains and categories): too broad to read about */
  groups: Set<string>,
): { slug: string; score: number }[] {
  const known = new Set(affinities.filter(a => a.status === "rejected" || Math.abs(a.score) >= HORIZON_KNOWN).map(a => a.topicSlug));
  const scores = new Map<string, number>();
  for (const seed of horizonSeeds(affinities)) {
    for (const r of related.get(seed.topicSlug) ?? []) {
      if (known.has(r.slug) || groups.has(r.slug)) continue;
      scores.set(r.slug, (scores.get(r.slug) ?? 0) + seed.score * r.weight);
    }
  }
  return [...scores].map(([slug, score]) => ({ slug, score }))
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
}

/** The strongest non-rejected topics, strongest first */
export function horizonSeeds(affinities: Affinity[]): Affinity[] {
  return affinities
    .filter(a => a.status !== "rejected" && a.score >= HORIZON_MIN_SEED)
    .sort((a, b) => b.score - a.score || a.topicSlug.localeCompare(b.topicSlug))
    .slice(0, HORIZON_SEEDS);
}
