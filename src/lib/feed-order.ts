/**
 * The order of a student's unread articles on the home screen, which shows the first five:
 * tutorial articles first, then the articles served today (the morning batch's stories for the
 * student's own interests), then the rest, each group in the order given (oldest first from the
 * API). Oldest first within a group, so a same-day top-up never hides a starter article picked
 * from the student's interests at onboarding; today's group ahead of older unread articles, so a
 * story written for the student this morning isn't buried behind last week's queue.
 */
export function orderFeed<T extends { category: string | null; createdAt: string }>(unread: T[], dayStart: Date): T[] {
  const group = (a: T) => (a.category === "tutorial" ? 0 : new Date(a.createdAt) >= dayStart ? 1 : 2);
  return unread.map((a, i) => ({ a, i, g: group(a) }))
    .sort((x, y) => x.g - y.g || x.i - y.i)
    .map(x => x.a);
}
