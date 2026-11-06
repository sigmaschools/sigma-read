/**
 * Compass's interest graph (app contract section 6, "Interests", section version 1.0).
 *
 * Compass keeps one record of each learner's interests for every Compass app. SigmaRead sends
 * its evidence there and reads interests, rankings, exploration topics and the tutor's summary
 * back. This file is the HTTP client and the pure mapping between the two shapes; index.ts
 * decides when to use it.
 *
 * Rules from the contract that this file keeps:
 *   - The key stays on the server (COMPASS_INTERESTS_KEY, never a NEXT_PUBLIC_ variable).
 *   - Every read has a 2-second timeout; on any error, timeout or 503 the caller does what it did
 *     before Compass (6.7), so these functions return null instead of throwing.
 *   - A learner's own words are never logged (6.5): errors log the path and status only.
 *   - Learners are named only by their Compass learner id, kept as students.external_id (6.1).
 */

import type { Affinity, SignalType } from "./affinity";
import type { InterestSummary } from "./summary";
import { SHOWN_MIN } from "./summary";

const READ_TIMEOUT_MS = 2_000;
/** Writes get a little longer; they run after the student's own work is saved */
const WRITE_TIMEOUT_MS = 3_000;
/** After a failed call, Compass is skipped for this long, so an outage doesn't slow every request */
const COOLDOWN_MS = 60_000;
let downUntil = 0;
/** Compass takes up to 500 events or learners per call */
export const BATCH_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Compass is used only when both settings are present; otherwise SigmaRead runs on its own graph */
export function compassConfigured(): boolean {
  return !!(process.env.COMPASS_URL && process.env.COMPASS_INTERESTS_KEY);
}

/** A student's Compass learner id, or null when they aren't linked (or the id isn't one) */
export function learnerIdFrom(externalId: string | null | undefined): string | null {
  const id = externalId?.trim();
  return id && UUID.test(id) ? id.toLowerCase() : null;
}

// ─── Shapes (schema/openapi.yaml, tag `interests`) ───────────────────────────

export interface EvidenceEvent {
  learnerId: string;
  topicId?: string;
  phrase?: string;
  phraseBy?: "learner" | "model";
  type: string;
  sourceRef: string;
  occurredAt?: string;
  /** Import only (and "halve" types) */
  weight?: number;
  replaceKey?: string;
}

export interface EvidenceOutcome { status: "new" | "duplicate" | "refused"; topicId?: string; reason?: string }

export interface CompassInterest {
  topicId: string;
  label: string;
  score: number;
  confidence: number;
  status: "declared" | "inferred" | "rejected" | "removed";
  trend: "new" | "rising" | "steady" | "fading";
  firstSeen?: string;
  lastSeen?: string;
}

export interface LearnerInterests { learnerId: string; scoringVersion: string; interests: CompassInterest[] }

export interface RankedItem {
  id: string;
  score: number;
  excluded: boolean;
  reason: { code: "match" | "near" | "explore" | "none" | "avoid" | "excluded"; topicId?: string; via?: string; text: string };
}

export interface ExploreTopic { topicId: string; label: string; score: number; near: string[] }

export type ControlAction = "remove" | "restore" | "not_anymore";
export type ControlRole = "guide" | "guardian" | "admin" | "learner";

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = READ_TIMEOUT_MS): Promise<T | null> {
  if (!compassConfigured() || Date.now() < downUntil) return null;
  const url = process.env.COMPASS_URL!.replace(/\/+$/, "") + "/api/v1/interests" + path;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.COMPASS_INTERESTS_KEY}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      // Path without the query, and the status: never the body, which may hold a learner's words
      console.error(`Compass interests: ${method} ${path.split("?")[0]} answered ${res.status}`);
      if (res.status >= 500) downUntil = Date.now() + COOLDOWN_MS;
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error(`Compass interests: ${method} ${path.split("?")[0]} failed: ${e instanceof Error ? e.name : "error"}`);
    downUntil = Date.now() + COOLDOWN_MS;
    return null;
  }
}

const enc = encodeURIComponent;

/** Record evidence (or, with `importing`, the one-time history load), in batches of 500 */
export async function sendEvidence(events: EvidenceEvent[], opts: { importing?: boolean } = {}): Promise<EvidenceOutcome[] | null> {
  const out: EvidenceOutcome[] = [];
  for (let i = 0; i < events.length; i += BATCH_MAX) {
    const res = await call<{ results: EvidenceOutcome[] }>(
      "POST", opts.importing ? "/import" : "/evidence", { events: events.slice(i, i + BATCH_MAX) },
      opts.importing ? 30_000 : WRITE_TIMEOUT_MS,
    );
    if (!res) return null;
    out.push(...res.results);
  }
  return out;
}

export async function fetchInterests(learnerId: string, limit = 100): Promise<LearnerInterests | null> {
  return call<LearnerInterests>("GET", `/learners/${enc(learnerId)}?limit=${limit}`);
}

/** Many learners at once (the morning batch), in batches of 500 */
export async function fetchManyInterests(learnerIds: string[], limit = 100, timeoutMs = 10_000): Promise<Map<string, LearnerInterests> | null> {
  const out = new Map<string, LearnerInterests>();
  for (let i = 0; i < learnerIds.length; i += BATCH_MAX) {
    const res = await call<{ learners: LearnerInterests[] }>("POST", "/learners", { learnerIds: learnerIds.slice(i, i + BATCH_MAX), limit }, timeoutMs);
    if (!res) return null;
    for (const l of res.learners) out.set(l.learnerId.toLowerCase(), l);
  }
  return out;
}

export async function rankItems(learnerId: string, items: { id: string; topicIds: string[] }[], opts: { exploreEvery?: number; seed?: number } = {}): Promise<RankedItem[] | null> {
  if (items.length === 0) return [];
  const res = await call<{ items: RankedItem[] }>("POST", `/learners/${enc(learnerId)}/rank`, {
    items: items.slice(0, 1000).map(i => ({ id: i.id, topicIds: i.topicIds.slice(0, 20) })),
    ...opts,
  });
  return res?.items ?? null;
}

export async function exploreTopics(learnerId: string, limit = 5): Promise<ExploreTopic[] | null> {
  const res = await call<{ topics: ExploreTopic[] }>("GET", `/learners/${enc(learnerId)}/explore?limit=${limit}`);
  return res?.topics ?? null;
}

/** The interest summary for a model prompt; "" when the learner has no interests yet */
export async function interestContext(learnerId: string, maxChars = 600): Promise<string | null> {
  const res = await call<{ text: string }>("GET", `/learners/${enc(learnerId)}/context?maxChars=${maxChars}`);
  return res ? res.text : null;
}

export async function sendControl(learnerId: string, topicId: string, action: ControlAction, actor: { role: ControlRole; id?: string }): Promise<CompassInterest | null> {
  return call<CompassInterest>("POST", `/learners/${enc(learnerId)}/controls`, { topicId, action, actor }, WRITE_TIMEOUT_MS);
}

// ─── Mapping (pure) ───────────────────────────────────────────────────────────

/** SigmaRead's own signal, as it is written to interest_signals */
export interface LocalSignal {
  topicSlug: string | null;
  phrase: string | null;
  signalType: SignalType;
  weight: number;
  sourceRef: string | null;
  createdAt?: Date;
}

/** Types that go through the controls call live; only the import may carry them as evidence (6.3) */
const CONTROL_TYPES: SignalType[] = ["removed", "restored"];

/**
 * A SigmaRead signal as a Compass evidence event, or null when it can't be one (no source ref,
 * nothing to land on, or a control outside an import). Topic slugs are Compass topic ids: the
 * Compass seed keeps every SigmaRead slug.
 */
export function toEvidence(learnerId: string, s: LocalSignal, opts: { importing?: boolean } = {}): EvidenceEvent | null {
  if (!s.sourceRef || (!s.topicSlug && !s.phrase?.trim())) return null;
  if (!opts.importing && CONTROL_TYPES.includes(s.signalType)) return null;
  const event: EvidenceEvent = { learnerId, type: s.signalType, sourceRef: s.sourceRef.slice(0, 200) };
  if (s.topicSlug) event.topicId = s.topicSlug;
  else {
    event.phrase = s.phrase!.trim().slice(0, 200);
    // Interests found in a discussion are a model's words, not the student's
    if (s.signalType === "chat_mention") event.phraseBy = "model";
  }
  if (s.createdAt) event.occurredAt = s.createdAt.toISOString();
  // The recorded weight keeps imports exact ("not as much" weights are computed). Live events
  // send none: Compass applies the type's registered weight and computes "not as much" itself
  if (opts.importing) event.weight = s.weight;
  const rk = replaceKeyFor(s);
  if (rk) event.replaceKey = rk;
  return event;
}

/**
 * Likes and dislikes can change; only the newest per article and topic counts. SigmaRead's ref
 * is "article:<id>:rating:<topic>:<time>". The key keeps the topic because Compass applies a
 * replace key across a learner's whole log: "rating:<id>" alone would let one topic's rating of
 * an article cancel another topic's.
 */
export function replaceKeyFor(s: Pick<LocalSignal, "signalType" | "sourceRef" | "topicSlug">): string | null {
  if (s.signalType !== "liked" && s.signalType !== "disliked") return null;
  const m = s.sourceRef?.match(/^article:(\d+):rating:([^:]+)/);
  if (m) return `rating:${m[1]}:${m[2]}`;
  return null;
}

/** Compass's interests in SigmaRead's affinity shape; rejected and removed both mean "never serve" */
export function toAffinities(interests: CompassInterest[]): Affinity[] {
  return interests.map(i => ({
    topicSlug: i.topicId,
    score: i.status === "rejected" || i.status === "removed" ? 0 : i.score,
    confidence: i.confidence,
    status: i.status === "rejected" || i.status === "removed" ? "rejected" : i.status,
    lastSignalAt: i.lastSeen ? new Date(i.lastSeen) : new Date(0),
  }));
}

const MAX_SHOWN = 8;

/** The guide and parent panel (current, fading, removed) from Compass's interests */
export function toSummary(interests: CompassInterest[]): InterestSummary & { labels: Map<string, string> } {
  const off = (i: CompassInterest) => i.status === "rejected" || i.status === "removed";
  const current = interests
    .filter(i => !off(i) && i.score >= SHOWN_MIN)
    .slice(0, MAX_SHOWN)
    .map(i => ({ slug: i.topicId, score: i.score, declared: i.status === "declared", isNew: i.status !== "declared" && i.trend === "new" }));
  const shown = new Set(current.map(c => c.slug));
  const fading = interests
    .filter(i => !off(i) && !shown.has(i.topicId) && (i.status === "declared" || i.trend === "fading") && i.score < SHOWN_MIN)
    .map(i => ({ slug: i.topicId, score: i.score }));
  const removed = interests.filter(off).map(i => ({ slug: i.topicId }));
  return { current, fading, removed, labels: new Map(interests.map(i => [i.topicId, i.label])) };
}

/** Ranked items as a score per candidate id; excluded items score null (never served) */
export function rankScores(items: RankedItem[]): Map<string, number | null> {
  return new Map(items.map(i => [i.id, i.excluded || i.reason.code === "excluded" ? null : i.score]));
}
