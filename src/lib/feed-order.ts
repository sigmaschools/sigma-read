/**
 * The order of a student's unread articles on the home screen, which shows the first five:
 * tutorial articles first, then the rest by the day they were served, newest day first, oldest
 * first within a day (createdAt is the time the article was served; id breaks ties). Newest day
 * first, so a story written for the student this morning isn't buried behind last week's queue,
 * and yesterday's unread story still comes before older ones; oldest first within a day, so a
 * same-day top-up never hides a starter article picked from the student's interests at
 * onboarding, and the morning's own-interest stories (served first) lead the day. Days are the
 * calendar days of the device's time zone.
 */
export function orderFeed<T extends { id: number; category: string | null; createdAt: string }>(unread: T[]): T[] {
  const time = (a: T) => { const t = new Date(a.createdAt).getTime(); return Number.isNaN(t) ? 0 : t; };
  // Local calendar day as a sortable number, e.g. 20261109
  const day = (a: T) => { const d = new Date(time(a)); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  const tutorial = (a: T) => (a.category === "tutorial" ? 0 : 1);
  return [...unread].sort((x, y) => tutorial(x) - tutorial(y) || day(y) - day(x) || time(x) - time(y) || x.id - y.id);
}
