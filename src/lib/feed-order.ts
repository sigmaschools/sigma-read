/**
 * The order of a student's unread articles on the home screen, which shows the first five:
 * tutorial articles first, then the articles served today (the morning batch's stories for the
 * student's own interests lead that group), then the rest, each group oldest first (createdAt is
 * the time the article was served; id breaks ties). Oldest first within a group, so a same-day
 * top-up never hides a starter article picked from the student's interests at onboarding;
 * today's group ahead of older unread articles, so a story written for the student this morning
 * isn't buried behind last week's queue. `dayStart` is local midnight on the student's device.
 */
export function orderFeed<T extends { id: number; category: string | null; createdAt: string }>(unread: T[], dayStart: Date): T[] {
  const group = (a: T) => (a.category === "tutorial" ? 0 : new Date(a.createdAt) >= dayStart ? 1 : 2);
  const time = (a: T) => new Date(a.createdAt).getTime();
  return [...unread].sort((x, y) => group(x) - group(y) || time(x) - time(y) || x.id - y.id);
}
