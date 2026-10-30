/**
 * "Still into these?": when to ask, and about which topics. Pure.
 *
 * Asked about every two weeks, only on a day the student reaches their daily goal, in place
 * of the "anything you want to read about tomorrow?" question, and about at most three topics.
 */

import { latestRatings, type Signal, type SignalType } from "./affinity";

const DAY_MS = 86_400_000;
export const CHECKIN_EVERY_DAYS = 14;
/** A topic answered in a check-in isn't asked about again for this long */
const RECHECK_DAYS = 30;
const WINDOW_DAYS = 30;
export const MAX_CHECKIN_TOPICS = 3;

const POSITIVE: SignalType[] = ["chose_article", "liked", "favorite", "chat_mention", "strong_engagement", "checkin_keep"];
const DECLARING: SignalType[] = ["onboarding", "typed_interest"];
const CHECKIN: SignalType[] = ["checkin_keep", "checkin_less", "checkin_reject"];

/** Due when the last check-in (or, for a first one, the first signal) is at least two weeks old */
export function checkinDue(lastCheckinAt: Date | null, firstSignalAt: Date | null, now = new Date()): boolean {
  const since = lastCheckinAt ?? firstSignalAt;
  return since !== null && now.getTime() - since.getTime() >= CHECKIN_EVERY_DAYS * DAY_MS;
}

/**
 * Topics worth asking about, most pressing first:
 *   1. two dislikes in a row
 *   2. passed over 3+ times in the last 30 days
 *   3. declared a month or more ago, with no positive signal in the last 30 days
 *   4. served the most in the last 30 days (3+ articles)
 * Rejected topics and topics answered in the last 30 days are left out.
 *
 * @param servedCounts articles served per topic in the last 30 days
 */
export function checkinTopics(
  signals: Signal[],
  servedCounts: Map<string, number>,
  rejected: Set<string>,
  now = new Date(),
): string[] {
  const recent = (s: Signal, days: number) => now.getTime() - s.createdAt.getTime() < days * DAY_MS;
  const byTopic = new Map<string, Signal[]>();
  // One rating per article: tapping dislike twice is still one dislike
  for (const s of latestRatings(signals).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    byTopic.set(s.topicSlug, [...(byTopic.get(s.topicSlug) ?? []), s]);
  }
  const askable = (slug: string) =>
    !rejected.has(slug) && !(byTopic.get(slug) ?? []).some(s => CHECKIN.includes(s.signalType) && recent(s, RECHECK_DAYS));

  const tiers: string[][] = [[], [], [], []];
  for (const [slug, list] of byTopic) {
    if (!askable(slug)) continue;
    // Only ratings since the last check-in answer: once asked about, old dislikes don't count again
    const lastAnswer = list.filter(s => CHECKIN.includes(s.signalType)).pop()?.createdAt.getTime() ?? 0;
    const ratings = list.filter(s => (s.signalType === "liked" || s.signalType === "disliked") && s.createdAt.getTime() > lastAnswer);
    const lastTwo = ratings.slice(-2);
    if (lastTwo.length === 2 && lastTwo.every(s => s.signalType === "disliked")) { tiers[0].push(slug); continue; }
    if (list.filter(s => s.signalType === "passed_over" && recent(s, WINDOW_DAYS)).length >= 3) { tiers[1].push(slug); continue; }
    const declaredLongAgo = list.some(s => DECLARING.includes(s.signalType)) && !list.some(s => DECLARING.includes(s.signalType) && recent(s, WINDOW_DAYS));
    if (declaredLongAgo && !list.some(s => POSITIVE.includes(s.signalType) && recent(s, WINDOW_DAYS))) tiers[2].push(slug);
  }
  tiers[3] = [...servedCounts].filter(([slug, n]) => n >= 3 && askable(slug)).sort((a, b) => b[1] - a[1]).map(([slug]) => slug);

  const out: string[] = [];
  for (const slug of tiers.flat()) {
    if (!out.includes(slug)) out.push(slug);
    if (out.length === MAX_CHECKIN_TOPICS) break;
  }
  return out;
}
