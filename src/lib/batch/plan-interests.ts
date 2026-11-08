/**
 * Which interests the morning batch writes about today, and in what order. Articles go into a
 * shared pool, so one article on an interest serves every student who has it, but the plan
 * starts from each student and covers all of their candidate interests: a kid whose interests
 * nobody else shares (airsoft, StarCraft) gets their own stories every day.
 *
 * There is no cap on the number. From 2026-10-29 to 2026-11-08 the plan covered the most
 * students with the fewest articles, which wrote the broadest shared words (animals, cooking)
 * and gave every student the same generic feed; the user's standing decision (2026-11-08) is to
 * pay for specific, personal articles rather than save on generic ones.
 *
 * The order still matters: the batch has a time limit and resumes, so every student's first
 * interest is written before anyone's second, and an interest several students share goes first
 * within a rank.
 *
 * @param wants each student's candidate interests for today, best first (least recently
 *   featured); students who have waited longest for an article of their own come first
 * @returns every distinct interest, in the order to write them
 */
export function pickInterests(wants: string[][]): string[] {
  const picked: string[] = [];
  const maxRank = Math.max(0, ...wants.map(w => w.length));
  for (let rank = 0; rank < maxRank; rank++) {
    // Everyone's interest at this rank; one several students share goes first
    const count = new Map<string, { n: number; first: number }>();
    for (const w of wants) {
      const interest = w[rank];
      if (interest === undefined || picked.includes(interest)) continue;
      const c = count.get(interest) ?? { n: 0, first: count.size };
      c.n++;
      count.set(interest, c);
    }
    const ranked = [...count.entries()].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first).map(([i]) => i);
    picked.push(...ranked);
  }
  return picked;
}
