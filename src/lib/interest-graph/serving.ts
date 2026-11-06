/**
 * Choosing which cached articles to serve, using the student's affinities. Pure.
 *
 * Every third slot is an exploration slot: a topic the student has no strong feeling about yet,
 * so the feed widens instead of narrowing. The other slots go to the best-matching articles,
 * avoiding two on the same topic in one serving. Rejected topics are never served. With no
 * signals at all, every article scores 0 and the choice is random, as before the graph.
 */

import type { Affinity } from "./affinity";

export interface Candidate { id: number; topics: string[] }

/**
 * How well a candidate suits the student (−1 to 1), or null when it must not be served. Either
 * the student's topic affinities (scored here) or a score per candidate from Compass's ranking.
 */
export type Scoring = Map<string, Affinity> | ((c: Candidate) => number | null);

function scorerFor(scoring: Scoring): (c: Candidate) => number | null {
  return typeof scoring === "function" ? scoring : c => candidateScore(c.topics, scoring);
}

/** Exploration picks come from articles whose best match is below this */
const EXPLORE_MAX_SCORE = 0.1;
/** ...and above this, so exploring never means serving something the student dislikes */
const EXPLORE_MIN_SCORE = -0.2;
/** Random spread added to scores, so near-equal articles take turns */
const JITTER = 0.05;

export const EXPLORE_EVERY = 3;

export function isExploreSlot(position: number): boolean {
  return position % EXPLORE_EVERY === EXPLORE_EVERY - 1;
}

/** The article's match: its best topic's score (0 if untagged), or null if any topic is rejected */
export function candidateScore(topics: string[], affinities: Map<string, Affinity>): number | null {
  let best = topics.length === 0 ? 0 : -Infinity;
  for (const t of topics) {
    const a = affinities.get(t);
    if (a?.status === "rejected") return null;
    best = Math.max(best, a?.score ?? 0);
  }
  return best;
}

/**
 * Pick one article for a slot. `avoid` holds topics already served in this round; an article
 * sharing one is used only when nothing else is left.
 */
export function pickOne<T extends Candidate>(
  pool: T[],
  scoring: Scoring,
  opts: { explore: boolean; avoid?: Set<string>; rng?: () => number },
): T | null {
  const rng = opts.rng ?? Math.random;
  const avoid = opts.avoid ?? new Set<string>();
  const score = scorerFor(scoring);
  const scored = pool
    .map(c => ({ c, score: score(c) }))
    .filter((s): s is { c: T; score: number } => s.score !== null);
  if (scored.length === 0) return null;

  const fresh = scored.filter(s => !s.c.topics.some(t => avoid.has(t)));
  const choices = fresh.length > 0 ? fresh : scored;

  if (opts.explore) {
    const open = choices.filter(s => s.score < EXPLORE_MAX_SCORE && s.score > EXPLORE_MIN_SCORE);
    if (open.length > 0) return open[Math.floor(rng() * open.length)].c;
  }
  let best = choices[0], bestValue = -Infinity;
  for (const s of choices) {
    const value = s.score + rng() * JITTER;
    if (value > bestValue) { best = s; bestValue = value; }
  }
  return best.c;
}

/** Pick up to n articles from one pool; `startPosition` keeps the exploration rhythm across pools */
export function pickForFeed<T extends Candidate>(
  pool: T[],
  scoring: Scoring,
  n: number,
  opts: { startPosition?: number; avoid?: Set<string>; rng?: () => number } = {},
): T[] {
  const remaining = [...pool];
  const avoid = opts.avoid ?? new Set<string>();
  const picked: T[] = [];
  for (let i = 0; i < n; i++) {
    const choice = pickOne(remaining, scoring, { explore: isExploreSlot((opts.startPosition ?? 0) + i), avoid, rng: opts.rng });
    if (!choice) break;
    picked.push(choice);
    remaining.splice(remaining.indexOf(choice), 1);
    choice.topics.forEach(t => avoid.add(t));
  }
  return picked;
}
