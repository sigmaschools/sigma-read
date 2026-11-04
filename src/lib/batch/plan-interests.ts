/**
 * Which interests the morning batch writes about today. Articles go into a shared pool, so one
 * article on an interest serves every student who has it: the plan first covers as many students
 * as it can with as few articles as possible, then adds the most widely shared interests, up to a
 * daily cap that grows with the number of students more slowly than one article per student.
 */

/**
 * Interest articles a day: at least 3 (the mix for one student), then 4 per 10 students, at most 30.
 * Each is read by every student who shares the interest, and unread articles carry over, so a
 * student reading 3 a day still has a full feed. This cap is the main lever on writing cost.
 */
export function interestCap(students: number): number {
  return Math.min(30, Math.max(3, Math.ceil(students * 0.4)));
}

/**
 * @param wants each student's candidate interests for today, best first (least recently featured)
 * @param cap most interests to pick
 * @returns interests to write about, in the order they were chosen
 */
export function pickInterests(wants: string[][], cap: number): string[] {
  const picked: string[] = [];
  const has = (s: string[]) => s.some(w => picked.includes(w));

  // Pass 1: greedy cover. Take the interest wanted by the most students who have nothing yet;
  // ties go to the one ranked higher by those students (rank 0 = their best).
  while (picked.length < cap) {
    const uncovered = wants.filter(w => w.length > 0 && !has(w));
    if (uncovered.length === 0) break;
    const score = new Map<string, { students: number; rank: number; first: number }>();
    let order = 0;
    for (const w of uncovered) {
      w.forEach((interest, rank) => {
        const s = score.get(interest) ?? { students: 0, rank: 0, first: order++ };
        s.students++;
        s.rank += rank;
        score.set(interest, s);
      });
    }
    const [best] = [...score.entries()].sort((a, b) =>
      b[1].students - a[1].students || a[1].rank - b[1].rank || a[1].first - b[1].first);
    picked.push(best[0]);
  }

  // Pass 2: fill to the cap with the most widely wanted interests not yet picked
  const counts = new Map<string, { n: number; first: number }>();
  let order = 0;
  for (const w of wants) for (const interest of w) {
    if (picked.includes(interest)) continue;
    const c = counts.get(interest) ?? { n: 0, first: order++ };
    c.n++;
    counts.set(interest, c);
  }
  const rest = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first).map(([i]) => i);
  return [...picked, ...rest].slice(0, cap);
}
