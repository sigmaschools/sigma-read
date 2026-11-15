/**
 * Which interests the morning batch writes about today, and in what order. Articles go into a
 * shared pool, so one article on an interest serves every student who has it, but the plan
 * starts from each student and covers all of their candidate interests: a kid whose interests
 * nobody else shares (airsoft, StarCraft) gets their own stories every day.
 *
 * There is no cap on the number. From 2026-10-29 to 2026-11-08 the plan covered the most
 * students with the fewest articles, which wrote the broadest shared words (animals, cooking)
 * and gave every student the same generic feed; the user's standing decision (2026-11-08) is to
 * pay for specific, personal articles rather than save on generic ones. What limits the number
 * is need: a student gets a new story for each one they read (`storiesWanted`).
 *
 * The order still matters: the batch has a time limit and resumes, so every student's first
 * interest is written before anyone's second, and an interest several students share goes first
 * within a rank.
 *
 * @param wants each student's candidate interests for today, best first (least recently
 *   featured); students who have waited longest for an article of their own come first
 * @returns every distinct interest, in the order to write them
 */
/** A student gets at most this many stories of their own a morning */
export const STORIES_MAX = 3;
/** The home screen shows this many unread articles; a student with fewer gets stories whether or not they read */
export const HOME_SHOWS = 5;

/**
 * How many stories to write for a student this morning: one for each article they finished since
 * the last batch, up to STORIES_MAX. Stories are written to be read, so a student who did not
 * read (a day off, a weekend, a test account nobody is using) gets none, and their unread stories
 * wait for them. A student whose unread articles would not fill the home screen gets enough to
 * fill it regardless, so nobody opens the app to a short list.
 *
 * Until 2026-11-15 every student got three every day, read or not: 21 a week for a student whose
 * goal is 12, and as many again for an account nobody reads with.
 */
export function storiesWanted(readSince: number, unread: number): number {
  return Math.max(0, Math.min(STORIES_MAX, Math.max(readSince, HOME_SHOWS - unread)));
}

/**
 * The interests to write about for one student today: the `wanted` that have waited longest
 * (`lastFeatured`, 0 for never). An interest written earlier today takes one of the places, so a
 * run that resumes after its time limit does not move on to another interest.
 */
export function studentWants(interests: string[], wanted: number, lastFeatured: (interest: string) => number, writtenToday: Set<string>): string[] {
  const rank = (interest: string) => writtenToday.has(interest) ? -1 : lastFeatured(interest);
  return [...interests].sort((a, b) => rank(a) - rank(b)).slice(0, Math.max(0, wanted)).filter(i => !writtenToday.has(i));
}

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
