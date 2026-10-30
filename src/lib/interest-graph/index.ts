/**
 * The interest graph: one interface for everything SigmaRead knows about what a student is into.
 *
 *   recordSignals  append what a student did (the log is the source of truth)
 *   getAffinities  their decayed, ranked topic scores, computed from the log on read
 *   getRelated     neighbouring topics in the shared map
 *   resolveTopics  free text → topic slugs (exact match, then optionally Haiku)
 *
 * App code calls only these, never the tables, so moving the graph into Compass later means
 * replacing this file's internals with HTTP calls. See the interest graph design doc.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { tracked } from "../ai-usage";
import { parseJsonResponse } from "../claude-json";
import { MODELS } from "../models";
import { normalizeInterestProfile } from "../normalize-interests";
import { computeAffinities, lessWeight, ratingKey, SIGNALS, type Affinity, type Signal, type SignalType } from "./affinity";
import { checkinDue, checkinTopics } from "./checkin";
import { summarizeInterests } from "./summary";
import { buildIndex, matchKey, matchTopic, normalizePhrase, type TopicIndex } from "./resolve";

export { SIGNALS, type Affinity, type SignalType } from "./affinity";
export { matchKey } from "./resolve";

/** Signals must never break what the student is doing: log and carry on */
export function quietly(work: Promise<unknown>, what: string): Promise<void> {
  return work.then(() => undefined, e => console.error(`Interest graph: ${what} failed:`, e));
}

// ─── Topic lookup ─────────────────────────────────────────────────────────────

let cached: { index: TopicIndex; labels: Map<string, string>; at: number } | null = null;
const INDEX_TTL_MS = 5 * 60_000;

async function topicIndex() {
  if (cached && Date.now() - cached.at < INDEX_TTL_MS) return cached;
  const [topics, aliases] = await Promise.all([
    db.select({ slug: schema.topics.slug, label: schema.topics.label }).from(schema.topics)
      .where(eq(schema.topics.safetyStatus, "approved")),
    db.select({ alias: schema.topicAliases.alias, topicSlug: schema.topicAliases.topicSlug }).from(schema.topicAliases),
  ]);
  const approved = new Set(topics.map(t => t.slug));
  cached = {
    index: buildIndex(topics, aliases.filter(a => approved.has(a.topicSlug))),
    labels: new Map(topics.map(t => [t.slug, t.label])),
    at: Date.now(),
  };
  return cached;
}

/** Display labels for slugs (unknown slugs are left out) */
export async function topicLabels(slugs: string[]): Promise<Map<string, string>> {
  const { labels } = await topicIndex();
  return new Map(slugs.filter(s => labels.has(s)).map(s => [s, labels.get(s)!]));
}

/**
 * Map phrases to topic slugs. Exact and alias matches are free; pass `ai` to send the rest to
 * Haiku in one call, which also saves each new match as an alias so it is free next time.
 * A phrase that matches nothing maps to null (personal facts and unsafe text always do).
 */
export async function resolveTopics(
  phrases: string[],
  ai?: { client: Anthropic; studentId?: number },
): Promise<Map<string, string | null>> {
  const { index, labels } = await topicIndex();
  const out = new Map<string, string | null>();
  const unmatched: string[] = [];
  for (const p of phrases) {
    const slug = matchTopic(index, p);
    out.set(p, slug);
    if (!slug && matchKey(p) && !unmatched.includes(p)) unmatched.push(p);
  }
  if (!ai || unmatched.length === 0) return out;

  try {
    const slugs = [...labels.keys()];
    const response = await tracked(ai.client, "interest_resolve", ai.studentId).messages.create({
      model: MODELS.light,
      max_tokens: 1024,
      messages: [{ role: "user", content: resolvePrompt(unmatched, labels) }],
      output_config: { format: { type: "json_schema", schema: {
        type: "object",
        properties: {
          matches: { type: "array", items: {
            type: "object",
            properties: { phrase: { type: "string" }, topic: { type: "string", enum: [...slugs, "none"] } },
            required: ["phrase", "topic"],
            additionalProperties: false,
          } },
        },
        required: ["matches"],
        additionalProperties: false,
      } } },
    });
    const parsed = parseJsonResponse<{ matches: { phrase: string; topic: string }[] }>(response);
    const learned: { alias: string; topicSlug: string; origin: string }[] = [];
    for (const m of parsed?.matches ?? []) {
      if (!unmatched.includes(m.phrase) || !labels.has(m.topic)) continue;
      out.set(m.phrase, m.topic);
      learned.push({ alias: normalizePhrase(m.phrase), topicSlug: m.topic, origin: "ai" });
    }
    if (learned.length > 0) {
      await db.insert(schema.topicAliases).values(learned).onConflictDoNothing();
      cached = null;
    }
  } catch (e) {
    console.error("Topic resolution failed:", e);
  }
  return out;
}

function resolvePrompt(phrases: string[], labels: Map<string, string>): string {
  return `You map a K-8 student's interests to topics in a fixed list, for choosing what articles they read.

Topics (slug: label):
${[...labels].map(([s, l]) => `${s}: ${l}`).join("\n")}

For each phrase, give the single closest topic, or "none" if no topic fits well. Use "none" for anything that is not a subject to read about: personal or family facts (illness, religion, home life, feelings), names of people the student knows, and anything unsafe for children.

Phrases:
${phrases.map(p => `- ${JSON.stringify(p)}`).join("\n")}`;
}

// ─── Signals ──────────────────────────────────────────────────────────────────

export interface SignalInput {
  studentId: number;
  type: SignalType;
  topicSlug?: string | null;
  /** The student's words, kept in the log alongside the resolved topic */
  phrase?: string | null;
  /** What produced the signal; the same (student, type, ref) is recorded once */
  sourceRef?: string | null;
  /** Defaults to the type's weight */
  weight?: number;
  at?: Date;
}

/** Append signals. Duplicates (same student, type and source ref) are skipped. */
export async function recordSignals(inputs: SignalInput[]): Promise<void> {
  const rows = signalRows(inputs);
  if (rows.length === 0) return;
  await db.insert(schema.interestSignals).values(rows).onConflictDoNothing();
}

function signalRows(inputs: SignalInput[]) {
  return inputs
    .filter(s => s.topicSlug || s.phrase)
    .map(s => ({
      studentId: s.studentId,
      topicSlug: s.topicSlug ?? null,
      phrase: s.phrase ?? null,
      signalType: s.type,
      weight: s.weight ?? SIGNALS[s.type].weight,
      sourceRef: s.sourceRef ?? null,
      ...(s.at ? { createdAt: s.at } : {}),
    }));
}

/** A student's affinities, strongest first, including rejected topics (score 0, status "rejected") */
export async function getAffinities(studentId: number, now = new Date()): Promise<Affinity[]> {
  return computeAffinities(await getSignals(studentId), now);
}

/** Every topic signal for a student, oldest first */
export async function getSignals(studentId: number): Promise<Signal[]> {
  const rows = await db.select({
    topicSlug: schema.interestSignals.topicSlug,
    signalType: schema.interestSignals.signalType,
    weight: schema.interestSignals.weight,
    sourceRef: schema.interestSignals.sourceRef,
    createdAt: schema.interestSignals.createdAt,
  }).from(schema.interestSignals)
    .where(and(eq(schema.interestSignals.studentId, studentId), isNotNull(schema.interestSignals.topicSlug)))
    .orderBy(schema.interestSignals.createdAt);
  return rows.map(r => ({ ...r, topicSlug: r.topicSlug!, signalType: r.signalType as SignalType }));
}

// ─── Topic map ────────────────────────────────────────────────────────────────

export interface RelatedTopic { slug: string; weight: number; via: "related" | "parent" | "sibling" | "child" }

/** Neighbours of a topic: explicit links first, then the tree (children, siblings, parent) */
export async function getRelated(slug: string): Promise<RelatedTopic[]> {
  const [self] = await db.select({ parentSlug: schema.topics.parentSlug }).from(schema.topics)
    .where(eq(schema.topics.slug, slug)).limit(1);
  if (!self) return [];

  const r = schema.topicRelations;
  const [links, tree] = await Promise.all([
    db.select({ fromSlug: r.fromSlug, toSlug: r.toSlug, weight: r.weight }).from(r)
      .where(or(eq(r.fromSlug, slug), eq(r.toSlug, slug))),
    db.select({ slug: schema.topics.slug, parentSlug: schema.topics.parentSlug }).from(schema.topics)
      .where(and(
        eq(schema.topics.safetyStatus, "approved"),
        self.parentSlug
          ? or(eq(schema.topics.parentSlug, slug), eq(schema.topics.parentSlug, self.parentSlug), eq(schema.topics.slug, self.parentSlug))
          : eq(schema.topics.parentSlug, slug),
      )),
  ]);

  const out = new Map<string, RelatedTopic>();
  const add = (t: RelatedTopic) => { if (t.slug !== slug && !out.has(t.slug)) out.set(t.slug, t); };
  for (const l of links) add({ slug: l.fromSlug === slug ? l.toSlug : l.fromSlug, weight: l.weight, via: "related" });
  for (const t of tree) {
    if (t.parentSlug === slug) add({ slug: t.slug, weight: 0.5, via: "child" });
    else if (t.slug === self.parentSlug) add({ slug: t.slug, weight: 0.3, via: "parent" });
    else add({ slug: t.slug, weight: 0.5, via: "sibling" });
  }
  return [...out.values()].sort((a, b) => b.weight - a.weight);
}

// ─── Article tags ─────────────────────────────────────────────────────────────

/** Tag a base cache article with the topics its phrases resolve to (the first is primary) */
export async function tagCacheArticle(articleCacheId: number, phrases: string[], ai?: { client: Anthropic }) {
  const resolved = await resolveTopics(phrases.filter(Boolean), ai);
  const slugs = [...new Set(phrases.map(p => resolved.get(p)).filter((s): s is string => !!s))];
  if (slugs.length === 0) return [];
  await db.insert(schema.articleTopics)
    .values(slugs.map((topicSlug, i) => ({ articleCacheId, topicSlug, role: i === 0 ? "primary" : "secondary" })))
    .onConflictDoNothing();
  return slugs;
}

/** Topics of cache articles (adaptations report their base article's tags) */
export async function topicsForCache(cacheIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (cacheIds.length === 0) return out;
  const c = schema.articleCache;
  const rows = await db.select({ id: c.id, tag: schema.articleTopics.topicSlug }).from(c)
    .innerJoin(schema.articleTopics, eq(schema.articleTopics.articleCacheId, sql`COALESCE(${c.baseArticleId}, ${c.id})`))
    .where(inArray(c.id, cacheIds));
  for (const r of rows) out.set(r.id, [...(out.get(r.id) ?? []), r.tag]);
  return out;
}

/**
 * Topics of a student's articles: the cache article's tags (shared by its level adaptations),
 * else an exact match on the article's topic label.
 */
export async function topicsForArticles(articleIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (articleIds.length === 0) return out;
  const rows = await db.select({
    id: schema.articles.id,
    topic: schema.articles.topic,
    tag: schema.articleTopics.topicSlug,
  }).from(schema.articles)
    .leftJoin(schema.articleCache, eq(schema.articleCache.id, schema.articles.sourceCacheId))
    .leftJoin(schema.articleTopics, eq(schema.articleTopics.articleCacheId, sql`COALESCE(${schema.articleCache.baseArticleId}, ${schema.articleCache.id})`))
    .where(inArray(schema.articles.id, articleIds));

  const untagged = new Map<number, string>();
  for (const r of rows) {
    if (r.tag) out.set(r.id, [...(out.get(r.id) ?? []), r.tag]);
    else if (!out.has(r.id)) untagged.set(r.id, r.topic);
  }
  const resolved = await resolveTopics([...new Set(untagged.values())]);
  for (const [id, topic] of untagged) {
    const slug = resolved.get(topic);
    if (slug && !out.has(id)) out.set(id, [slug]);
  }
  return out;
}

/** Signals for one article event (like, favorite, ...), one per topic of the article */
export async function recordArticleSignal(studentId: number, articleId: number, type: SignalType, sourceRef: string, refSuffix = "") {
  const topics = (await topicsForArticles([articleId])).get(articleId) ?? [];
  await recordSignals(topics.map(topicSlug => ({ studentId, type, topicSlug, sourceRef: `${sourceRef}:${topicSlug}${refSuffix}` })));
}

/** A like or dislike. Changing your mind adds a new signal; only the latest per article counts. */
export async function recordArticleRating(studentId: number, articleId: number, liked: boolean) {
  await recordArticleSignal(studentId, articleId, liked ? "liked" : "disliked", `article:${articleId}:rating`, `:${Date.now()}`);
}

/**
 * The student opened one article from their feed: a pick for its topics and a small pass-over
 * for the topics of the other unread articles they could have chosen.
 */
export async function recordArticleChoice(studentId: number, chosenId: number, otherIds: number[], readingSessionId: number) {
  const topics = await topicsForArticles([chosenId, ...otherIds]);
  const chosen = new Set(topics.get(chosenId) ?? []);
  const inputs: SignalInput[] = [...chosen].map(topicSlug => ({
    studentId, type: "chose_article", topicSlug, sourceRef: `session:${readingSessionId}:${topicSlug}`,
  }));
  for (const id of otherIds) {
    for (const topicSlug of topics.get(id) ?? []) {
      if (chosen.has(topicSlug)) continue;
      inputs.push({ studentId, type: "passed_over", topicSlug, sourceRef: `session:${readingSessionId}:${id}:${topicSlug}` });
    }
  }
  await recordSignals(inputs);
}

/** Declared interests (onboarding or typed), resolved in one batch */
export async function recordDeclaredInterests(
  studentId: number,
  interests: string[],
  type: "onboarding" | "typed_interest",
  ai?: { client: Anthropic },
) {
  const resolved = await resolveTopics(interests, ai && { ...ai, studentId });
  await recordSignals(interests.map(phrase => ({
    studentId, type, phrase, topicSlug: resolved.get(phrase) ?? null, sourceRef: `profile:${matchKey(phrase)}`,
  })));
}

/** Tag base cache articles that have no topics yet, by exact match on their topic label */
export async function tagUntaggedCache(limit = 500): Promise<number> {
  const c = schema.articleCache;
  const untagged = await db.select({ id: c.id, topic: c.topic }).from(c)
    .where(and(
      sql`${c.baseArticleId} IS NULL`,
      sql`NOT EXISTS (SELECT 1 FROM article_topics WHERE article_cache_id = ${c.id})`,
    ))
    .limit(limit);
  let tagged = 0;
  for (const a of untagged) if ((await tagCacheArticle(a.id, [a.topic])).length > 0) tagged++;
  return tagged;
}

// ─── "Still into these?" ──────────────────────────────────────────────────────

const CHECKIN_EVENT = "interest_checkin";

/**
 * The topics to ask about today, or [] when no check-in is due. Call only once the student has
 * reached the daily goal; the page shows this instead of the "tomorrow" question.
 */
export async function checkinFor(studentId: number, now = new Date()): Promise<{ slug: string; label: string }[]> {
  const [last] = await db.select({ at: schema.articleFeedEvents.createdAt }).from(schema.articleFeedEvents)
    .where(and(eq(schema.articleFeedEvents.studentId, studentId), eq(schema.articleFeedEvents.eventType, CHECKIN_EVENT)))
    .orderBy(desc(schema.articleFeedEvents.createdAt)).limit(1);
  const signals = await getSignals(studentId);
  if (!checkinDue(last?.at ?? null, signals[0]?.createdAt ?? null, now)) return [];

  const since = new Date(now.getTime() - 30 * 86_400_000);
  const served = await db.select({ id: schema.articles.id }).from(schema.articles)
    .where(and(eq(schema.articles.studentId, studentId), gte(schema.articles.createdAt, since)));
  const servedCounts = new Map<string, number>();
  for (const topics of (await topicsForArticles(served.map(a => a.id))).values()) {
    for (const t of topics) servedCounts.set(t, (servedCounts.get(t) ?? 0) + 1);
  }
  const rejected = new Set(computeAffinities(signals, now).filter(a => a.status === "rejected").map(a => a.topicSlug));
  const slugs = checkinTopics(signals, servedCounts, rejected, now);
  const labels = await topicLabels(slugs);
  return slugs.filter(s => labels.has(s)).map(slug => ({ slug, label: labels.get(slug)! }));
}

export type CheckinAnswer = "keep" | "less" | "reject";

const CHECKIN_TYPES: Record<CheckinAnswer, SignalType> = { keep: "checkin_keep", less: "checkin_less", reject: "checkin_reject" };

/**
 * Save a check-in (answered or skipped). It counts as asked either way, so the next is two weeks
 * out. Only a check-in that is due is saved, and only for the topics it offers (first answer per
 * topic wins), so a double-click or a replayed request changes nothing. Returns whether it saved.
 */
export async function saveCheckin(studentId: number, answers: { slug: string; answer: CheckinAnswer }[], now = new Date()): Promise<boolean> {
  const offered = new Set((await checkinFor(studentId, now)).map(t => t.slug));
  if (offered.size === 0) return false;
  const answered = new Set<string>();
  const valid = answers.filter(a => offered.has(a.slug) && !answered.has(a.slug) && answered.add(a.slug));

  const scores = new Map((await getAffinities(studentId, now)).map(a => [a.topicSlug, a.score]));
  const day = now.toISOString().slice(0, 10);
  const rows = signalRows(valid.map(a => ({
    studentId,
    type: CHECKIN_TYPES[a.answer],
    topicSlug: a.slug,
    // "Not as much" halves the score as it stands now
    weight: a.answer === "less" ? lessWeight(scores.get(a.slug) ?? 0) : undefined,
    sourceRef: `checkin:${day}:${a.slug}`,
  })));

  // The event marks the check-in as asked; it and the answers are written together
  const event = db.insert(schema.articleFeedEvents).values({ studentId, eventType: CHECKIN_EVENT, metadata: { answers: valid } });
  if (rows.length > 0) await db.batch([event, db.insert(schema.interestSignals).values(rows).onConflictDoNothing()]);
  else await event;
  return true;
}

// ─── For guides, parents and admins ───────────────────────────────────────────

/** What a student is into, in plain words: current interests, fading ones, and removed ones */
export async function interestSummaryFor(studentId: number, now = new Date()) {
  const signals = await getSignals(studentId);
  const firstSeen = new Map<string, Date>();
  for (const s of signals) if (!firstSeen.has(s.topicSlug)) firstSeen.set(s.topicSlug, s.createdAt);
  const summary = summarizeInterests(computeAffinities(signals, now), firstSeen, now);
  const labels = await topicLabels([...summary.current, ...summary.fading, ...summary.removed].map(t => t.slug));
  const label = <T extends { slug: string }>(list: T[]) => list.filter(t => labels.has(t.slug)).map(t => ({ ...t, label: labels.get(t.slug)! }));
  return { current: label(summary.current), fading: label(summary.fading), removed: label(summary.removed) };
}

/** An adult takes a topic off a student's interests, or puts it back */
export async function setTopicRemoved(studentId: number, topicSlug: string, removed: boolean, by: { role: string; userId: number }) {
  await recordSignals([{
    studentId, topicSlug, type: removed ? "removed" : "restored",
    sourceRef: `adult:${by.role}:${by.userId}:${Date.now()}`,
  }]);
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

/**
 * Turn what SigmaRead recorded before the graph existed into signals: each interest-profile
 * entry (as declared, dated at signup), likes and dislikes, and daily favorites. Idempotent,
 * because every signal has a source ref. Exact matches only; the morning batch runs this.
 */
export async function backfillSignals(): Promise<number> {
  let added = 0;
  const students = await db.select({ id: schema.students.id, interestProfile: schema.students.interestProfile, createdAt: schema.students.createdAt })
    .from(schema.students).where(eq(schema.students.onboardingComplete, true));
  for (const s of students) {
    const refs = (await db.select({ ref: schema.interestSignals.sourceRef }).from(schema.interestSignals)
      .where(eq(schema.interestSignals.studentId, s.id))).map(r => r.ref).filter((r): r is string => !!r);
    // Rating refs carry a time suffix, so compare them without it
    const existing = new Set([...refs, ...refs.map(ratingKey)]);
    const interests = normalizeInterestProfile(s.interestProfile).interests
      .filter(i => matchKey(i) && !existing.has(`profile:${matchKey(i)}`));
    const resolved = await resolveTopics(interests);
    const inputs: SignalInput[] = interests.map(phrase => ({
      studentId: s.id, type: "onboarding", phrase, topicSlug: resolved.get(phrase) ?? null,
      sourceRef: `profile:${matchKey(phrase)}`, at: s.createdAt,
    }));

    const rated = await db.select({ id: schema.articles.id, liked: schema.articles.liked, createdAt: schema.articles.createdAt })
      .from(schema.articles)
      .where(and(eq(schema.articles.studentId, s.id), isNotNull(schema.articles.liked)));
    const favorites = await db.select({ id: schema.articleFavorites.id, articleId: schema.articleFavorites.articleId, createdAt: schema.articleFavorites.createdAt })
      .from(schema.articleFavorites).where(eq(schema.articleFavorites.studentId, s.id));
    const topics = await topicsForArticles([...rated.map(a => a.id), ...favorites.map(f => f.articleId)]);
    for (const a of rated) {
      for (const topicSlug of topics.get(a.id) ?? []) {
        const rating = `article:${a.id}:rating:${topicSlug}`;
        if (!existing.has(rating)) inputs.push({ studentId: s.id, type: a.liked ? "liked" : "disliked", topicSlug, sourceRef: `${rating}:0`, at: a.createdAt });
      }
    }
    for (const f of favorites) {
      for (const topicSlug of topics.get(f.articleId) ?? []) {
        const sourceRef = `favorite:${f.id}:${topicSlug}`;
        if (!existing.has(sourceRef)) inputs.push({ studentId: s.id, type: "favorite", topicSlug, sourceRef, at: f.createdAt });
      }
    }
    await recordSignals(inputs);
    added += inputs.length;
  }
  return added;
}
