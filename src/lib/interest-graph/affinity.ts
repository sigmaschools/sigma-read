/**
 * Signal weights and the decayed affinity score. Pure, so the same rules can be replayed over
 * the signal log at any time (the log is the source of truth; scores are never stored).
 *
 *   affinity = clamp(Σ wᵢ · 0.5^(ageᵢ / h), −1, 1)
 *
 * h is 90 days for declared interests and 45 days for everything else. There is no floor: an
 * interest nobody renews fades away. See the interest graph design doc for the reasoning.
 */

export type SignalKind = "declared" | "behaviour" | "inferred";

export const SIGNALS = {
  onboarding: { weight: 0.6, kind: "declared" },
  typed_interest: { weight: 0.6, kind: "declared" },
  chose_article: { weight: 0.15, kind: "behaviour" },
  passed_over: { weight: -0.03, kind: "behaviour" },
  liked: { weight: 0.3, kind: "behaviour" },
  disliked: { weight: -0.3, kind: "behaviour" },
  favorite: { weight: 0.4, kind: "behaviour" },
  show_different: { weight: -0.1, kind: "behaviour" },
  chat_mention: { weight: 0.2, kind: "inferred" },
  strong_engagement: { weight: 0.1, kind: "behaviour" },
  // "Still into these?" answers. checkin_less carries a computed weight (minus half the score
  // at the time); checkin_reject and restored carry none and only change the status.
  checkin_keep: { weight: 0.3, kind: "behaviour" },
  checkin_less: { weight: 0, kind: "declared" }, // fades with the declared interest it offsets
  checkin_reject: { weight: 0, kind: "behaviour" },
  // A guide, parent or admin takes a topic off (removed) or puts it back (restored)
  removed: { weight: 0, kind: "behaviour" },
  restored: { weight: 0, kind: "behaviour" },
} as const satisfies Record<string, { weight: number; kind: SignalKind }>;

export type SignalType = keyof typeof SIGNALS;

export const HALF_LIFE_DAYS: Record<SignalKind, number> = { declared: 90, behaviour: 45, inferred: 45 };

const DAY_MS = 86_400_000;

export interface Signal {
  topicSlug: string;
  signalType: SignalType;
  weight: number;
  sourceRef?: string | null;
  createdAt: Date;
}

export type AffinityStatus = "declared" | "inferred" | "rejected";

export interface Affinity {
  topicSlug: string;
  /** −1 to 1 */
  score: number;
  /** 0 to 1: how much recent evidence there is, not how strong it is */
  confidence: number;
  status: AffinityStatus;
  lastSignalAt: Date;
}

export function decay(signal: Pick<Signal, "signalType" | "createdAt">, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - signal.createdAt.getTime()) / DAY_MS);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS[SIGNALS[signal.signalType].kind]);
}

/** What the student told us. An adult's restore also lifts a rejection, but doesn't make a topic declared. */
const STUDENT_DECLARING: SignalType[] = ["onboarding", "typed_interest"];
const DECLARING: SignalType[] = [...STUDENT_DECLARING, "restored"];
const REJECTING: SignalType[] = ["checkin_reject", "removed"];

/** Affinities for one student from their signals, strongest first. Rejected topics are kept (score 0) so callers can exclude them. */
export function computeAffinities(signals: Signal[], now = new Date()): Affinity[] {
  const byTopic = new Map<string, Signal[]>();
  for (const s of latestRatings(signals)) {
    if (!(s.signalType in SIGNALS)) continue;
    const list = byTopic.get(s.topicSlug) ?? [];
    list.push(s);
    byTopic.set(s.topicSlug, list);
  }

  const out: Affinity[] = [];
  for (const [topicSlug, list] of byTopic) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const lastReject = lastAt(list, REJECTING);
    const lastDeclare = lastAt(list, DECLARING);
    const rejected = lastReject !== null && (lastDeclare === null || lastDeclare < lastReject);
    const start = freshStart(list);
    const counted = list.filter(s => s.createdAt.getTime() >= start);

    let sum = 0, evidence = 0;
    for (const s of counted) {
      const d = decay(s, now);
      sum += s.weight * d;
      evidence += d;
    }
    const declared = counted.some(s => STUDENT_DECLARING.includes(s.signalType));
    out.push({
      topicSlug,
      score: rejected ? 0 : round(Math.max(-1, Math.min(1, sum))),
      confidence: round(1 - Math.pow(0.5, evidence / 2)),
      status: rejected ? "rejected" : declared ? "declared" : "inferred",
      lastSignalAt: list[list.length - 1].createdAt,
    });
  }
  return out.sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.topicSlug.localeCompare(b.topicSlug));
}

/** The weight a "Not as much" answer records: minus half the topic's current score (never positive) */
export function lessWeight(currentScore: number): number {
  return currentScore > 0 ? round(-currentScore / 2) : 0;
}

/**
 * A student can change a like to a dislike and back. Each change is a new signal whose ref is
 * "<rating ref>:<time>", and only the latest per rating counts.
 */
export function latestRatings(signals: Signal[]): Signal[] {
  const latest = new Map<string, Signal>();
  const rest: Signal[] = [];
  for (const s of signals) {
    if ((s.signalType !== "liked" && s.signalType !== "disliked") || !s.sourceRef) { rest.push(s); continue; }
    const key = ratingKey(s.sourceRef);
    const prev = latest.get(key);
    if (!prev || prev.createdAt <= s.createdAt) latest.set(key, s);
  }
  return [...rest, ...latest.values()];
}

/** The rating a like/dislike ref belongs to: the ref without its trailing ":<time>" */
export function ratingKey(sourceRef: string): string {
  return sourceRef.replace(/:\d+$/, "");
}

/**
 * A topic the student names again after it was turned off starts over: only signals from then
 * on count. An adult's restore undoes a removal instead, keeping the history since that start.
 */
function freshStart(list: Signal[]): number {
  let start = 0, off = false;
  for (const s of list) {
    if (REJECTING.includes(s.signalType)) off = true;
    else if (s.signalType === "restored") off = false;
    else if (off && STUDENT_DECLARING.includes(s.signalType)) { start = s.createdAt.getTime(); off = false; }
  }
  return start;
}

function lastAt(list: Signal[], types: SignalType[]): number | null {
  for (let i = list.length - 1; i >= 0; i--) if (types.includes(list[i].signalType)) return list[i].createdAt.getTime();
  return null;
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
