/**
 * One serving for a student: the stories written today for their own interests first (up to
 * `max`, even when the buffer is full), then the ranked fill up to the buffer target, the own
 * stories counting toward it. `excluded` ids (repeats found by the check) are left out of both,
 * and a rejected own story frees its slot for the fill. Own stories beyond `max` compete in the
 * fill like any other article. The own stories come first in the result, so they are inserted
 * first and the feed (oldest first within the day) shows them first. `own` is in priority order.
 */
export function pickServing<T extends { id: number }>(opts: {
  own: T[];
  candidates: T[];
  needed: number;
  max: number;
  excluded: Set<number>;
  fill: (rest: T[], n: number) => T[];
}): T[] {
  const { own, candidates, needed, max, excluded, fill } = opts;
  const ownPicks = own.filter(c => !excluded.has(c.id)).slice(0, max);
  const pickedIds = new Set(ownPicks.map(c => c.id));
  const rest = candidates.filter(c => !excluded.has(c.id) && !pickedIds.has(c.id));
  const n = needed - ownPicks.length;
  return n > 0 ? [...ownPicks, ...fill(rest, n)] : ownPicks;
}
