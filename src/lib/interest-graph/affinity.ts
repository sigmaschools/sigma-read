/**
 * The signals SigmaRead sends Compass, and the shape of what Compass answers. Compass scores
 * them (its registered weight and half-life per type); the weights here go with a re-send of
 * past signals, which must say what was recorded at the time.
 */

export const SIGNALS = {
  onboarding: { weight: 0.6 },
  typed_interest: { weight: 0.6 },
  chose_article: { weight: 0.15 },
  passed_over: { weight: -0.03 },
  liked: { weight: 0.3 },
  disliked: { weight: -0.3 },
  favorite: { weight: 0.4 },
  show_different: { weight: -0.1 },
  chat_mention: { weight: 0.2 },
  strong_engagement: { weight: 0.1 },
  // "Still into these?" answers. Compass works out what "not as much" takes off; checkin_reject
  // carries no weight and only changes the status.
  checkin_keep: { weight: 0.3 },
  checkin_less: { weight: 0 },
  checkin_reject: { weight: 0 },
  // An adult took a topic off (removed) or put it back (restored), before Compass held the
  // record. Read back in the history only; today these go through Compass's controls call
  removed: { weight: 0 },
  restored: { weight: 0 },
} as const satisfies Record<string, { weight: number }>;

export type SignalType = keyof typeof SIGNALS;

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
