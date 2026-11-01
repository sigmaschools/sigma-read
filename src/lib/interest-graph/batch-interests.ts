/**
 * Which interests the morning batch plans articles for, per student: their profile list with
 * rejected topics taken out, plus their strongest graph topics the profile doesn't name (an
 * interest picked up from chat, a typed interest, a topic they keep choosing). Pure; see
 * batchInterestsFor in index.ts for the data.
 */

import type { Affinity } from "./affinity";

/** A graph topic needs at least this score to earn articles of its own */
export const BATCH_MIN_SCORE = 0.25;
/** At most this many graph topics are added on top of the profile */
export const BATCH_MAX_ADDED = 3;

export function mergeBatchInterests(
  profile: string[],
  /** Profile phrase → topic slug (null when it matches no topic) */
  profileSlugs: Map<string, string | null>,
  affinities: Affinity[],
  /** Topic slug → label */
  labels: Map<string, string>,
): string[] {
  const dropped = new Set(affinities.filter(a => a.status === "rejected" || a.score <= 0).map(a => a.topicSlug));
  const out: string[] = [];
  const covered = new Set<string>();
  const add = (phrase: string) => {
    const p = phrase.toLowerCase().trim();
    if (p && !out.includes(p)) out.push(p);
  };

  for (const phrase of profile) {
    const slug = profileSlugs.get(phrase) ?? null;
    if (slug && dropped.has(slug)) continue;
    if (slug) covered.add(slug);
    add(phrase);
  }

  let added = 0;
  for (const a of affinities) { // strongest first
    if (added === BATCH_MAX_ADDED || a.score < BATCH_MIN_SCORE) break;
    if (a.status === "rejected" || covered.has(a.topicSlug) || !labels.has(a.topicSlug)) continue;
    covered.add(a.topicSlug);
    add(labels.get(a.topicSlug)!);
    added++;
  }
  return out;
}
