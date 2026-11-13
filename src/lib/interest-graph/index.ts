/**
 * The interest graph: one interface for everything SigmaRead knows about what a student is into.
 *
 *   recordSignals  send what a student did to Compass
 *   getAffinities  their ranked topic scores, from Compass
 *   getRelated     neighbouring topics in the shared map
 *   resolveTopics  free text → topic slugs (exact match, then optionally Haiku)
 *
 * App code calls only these.
 *
 * Compass (app contract section 6) holds the only record of every learner's interests and the
 * topic map. SigmaRead keeps no copy: signals go to Compass, and reads (affinities, feed
 * ranking, horizon topics, the tutor's summary, the admin panel, the "still into these?"
 * history) come from it. What stays here is article state: which topics an article is about
 * (article_topics).
 *
 * When Compass is off or a call fails or takes over two seconds, SigmaRead does what an app
 * without interests does (contract 6.7): the feed is unranked, the batch plans from the profile
 * on the student's row, the tutor gets no summary and no check-in is asked. Articles are still
 * tagged, from the last topic map read or the one bundled in taxonomy.ts. See docs/interest-graph.md.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { tracked } from "../ai-usage";
import { parseJsonResponse } from "../claude-json";
import { MODELS, requestSettings } from "../models";
import { normalizeInterestProfile } from "../normalize-interests";
import { ratingKey, SIGNALS, type Affinity, type Signal, type SignalType } from "./affinity";
import { checkinDue, checkinTopics } from "./checkin";
import { matchKey, matchTopic } from "./resolve";
import { bundledMap, fromCompassMap, relatedIn, type RelatedTopic, type TopicMap } from "./topic-map";
import { mergeBatchInterests } from "./batch-interests";
import { CHAT_MENTIONS_SCHEMA, chatMentionTopics, chatMentionsPrompt, verifiedMentions, type ChatMention } from "./chat-mentions";
import * as compass from "./compass";
import { candidateScore, type Candidate, type Scoring } from "./serving";

export { SIGNALS, type Affinity, type SignalType } from "./affinity";
export { matchKey } from "./resolve";
export type { RelatedTopic } from "./topic-map";

/** Signals must never break what the student is doing: log and carry on */
export function quietly(work: Promise<unknown>, what: string): Promise<void> {
  return work.then(() => undefined, e => console.error(`Interest graph: ${what} failed:`, e));
}

// ─── Topic lookup ─────────────────────────────────────────────────────────────

let cached: (TopicMap & { at: number }) | null = null;
const INDEX_TTL_MS = 5 * 60_000;
/** After a failed read of the map, the one in hand is used this long before asking again */
const MAP_RETRY_MS = 60_000;

async function topicIndex(): Promise<TopicMap> {
  if (cached && Date.now() - cached.at < INDEX_TTL_MS) return cached;
  const map = await compass.fetchTopicMap();
  if (map) cached = { ...fromCompassMap(map), at: Date.now() };
  // Compass can't be reached: keep the map in hand (or the bundled one) and ask again in a minute
  else cached = { ...(cached ?? bundledMap()), at: Date.now() - INDEX_TTL_MS + MAP_RETRY_MS };
  return cached;
}

/** Display labels for slugs (unknown slugs are left out) */
export async function topicLabels(slugs: string[]): Promise<Map<string, string>> {
  const { labels } = await topicIndex();
  return new Map(slugs.filter(s => labels.has(s)).map(s => [s, labels.get(s)!]));
}

/**
 * Map phrases to topic slugs. Exact and alias matches are free; pass `ai` to send the rest to
 * Haiku in one call. A phrase that matches nothing maps to null (personal facts and unsafe text
 * always do). The result is keyed by each phrase exactly as passed (not normalized), so callers
 * look up with their own strings.
 */
export async function resolveTopics(
  phrases: string[],
  ai?: { client: Anthropic; studentId?: number },
): Promise<Map<string, string | null>> {
  const { index, matchable: labels, parents } = await topicIndex();
  const out = new Map<string, string | null>();
  const unmatched: string[] = [];
  for (const p of phrases) {
    const slug = matchTopic(index, p, parents);
    out.set(p, slug);
    if (!slug && matchKey(p) && !unmatched.includes(p)) unmatched.push(p);
  }
  if (!ai || unmatched.length === 0) return out;

  try {
    const slugs = [...labels.keys()];
    const response = await tracked(ai.client, "interest_resolve", ai.studentId).messages.create({
      model: MODELS.light, ...requestSettings(MODELS.light, "light"),
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
    for (const m of parsed?.matches ?? []) {
      if (!unmatched.includes(m.phrase) || !labels.has(m.topic)) continue;
      out.set(m.phrase, m.topic);
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

/** Send signals to Compass. A repeat (same student, type and source ref) changes nothing there. */
export async function recordSignals(inputs: SignalInput[]): Promise<void> {
  await sendToCompass(signalRows(inputs));
}

/**
 * Send signals to Compass, for the students it knows. Never throws: a like, a favorite or a
 * declared interest that Compass misses is sent again by the morning batch (resendReadingState);
 * a smaller signal (a pick, a pass-over, a chat mention, a check-in answer) is lost, which the
 * contract allows (6.7). `importing` is for that re-send: it may carry any past time.
 */
async function sendToCompass(rows: ReturnType<typeof signalRows>, opts: { importing?: boolean } = {}): Promise<number> {
  try {
    if (!compass.compassConfigured() || rows.length === 0) return 0;
    const learners = await learnerIds([...new Set(rows.map(r => r.studentId))]);
    const events = rows.flatMap(r => {
      const learnerId = learners.get(r.studentId);
      const e = learnerId && compass.toEvidence(learnerId, { ...r, signalType: r.signalType as SignalType, createdAt: "createdAt" in r ? r.createdAt : undefined }, opts);
      return e ? [e] : [];
    });
    if (events.length === 0) return 0;
    const results = await compass.sendEvidence(events, opts);
    if (!results) { console.error(`Compass interests: ${events.length} events not sent`); return 0; }
    const refused = results.filter(o => o.status === "refused");
    // Reasons only: an event may carry the student's words
    if (refused.length > 0) console.error(`Compass interests: ${refused.length} of ${events.length} events refused: ${[...new Set(refused.map(o => o.reason))].join("; ")}`);
    return results.filter(o => o.status === "new").length;
  } catch (e) {
    console.error("Compass interests: sending evidence failed:", e instanceof Error ? e.message : e);
    return 0;
  }
}

// ─── Compass learners ─────────────────────────────────────────────────────────

/** Compass learner ids of the given students that are linked (none when Compass is off) */
async function learnerIds(studentIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!compass.compassConfigured() || studentIds.length === 0) return out;
  const rows = await db.select({ id: schema.students.id, externalId: schema.students.externalId })
    .from(schema.students).where(inArray(schema.students.id, studentIds));
  for (const r of rows) {
    const id = compass.learnerIdFrom(r.externalId);
    if (id) out.set(r.id, id);
  }
  return out;
}

async function learnerIdFor(studentId: number): Promise<string | null> {
  try {
    return (await learnerIds([studentId])).get(studentId) ?? null;
  } catch (e) {
    console.error("Compass interests: learner lookup failed:", e);
    return null;
  }
}

/** Interests read in bulk for the morning batch, kept briefly so per-student reads reuse them */
const prefetched = new Map<number, { at: number; interests: compass.CompassInterest[] }>();
const PREFETCH_TTL_MS = 30 * 60_000;

/**
 * Read many students' interests from Compass in one call (the morning batch plans for every
 * student). Students that aren't linked, or a failed call, simply leave nothing cached.
 */
export async function prefetchInterests(studentIds: number[]): Promise<number> {
  try {
    const learners = await learnerIds(studentIds);
    if (learners.size === 0) return 0;
    const many = await compass.fetchManyInterests([...new Set(learners.values())]);
    if (!many) return 0;
    const now = Date.now();
    let read = 0;
    for (const [studentId, learnerId] of learners) {
      const l = many.get(learnerId);
      if (l) { prefetched.set(studentId, { at: now, interests: l.interests }); read++; }
    }
    return read;
  } catch (e) {
    console.error("Compass interests: bulk read failed:", e);
    return 0;
  }
}

/** Drop the bulk-read interests (the morning batch calls this when it finishes) */
export function clearPrefetched() {
  prefetched.clear();
}

/** A student's interests from Compass, or null when Compass is off, can't be reached or doesn't know them */
async function compassInterests(studentId: number): Promise<compass.CompassInterest[] | null> {
  const hit = prefetched.get(studentId);
  if (hit && Date.now() - hit.at < PREFETCH_TTL_MS) return hit.interests;
  const learnerId = await learnerIdFor(studentId);
  if (!learnerId) return null;
  return (await compass.fetchInterests(learnerId))?.interests ?? null;
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

/**
 * A student's affinities, strongest first, including rejected topics (score 0, status "rejected").
 * Empty when Compass can't answer: the caller then serves or plans without them.
 */
export async function getAffinities(studentId: number): Promise<Affinity[]> {
  return (await readAffinities(studentId)).affinities;
}

/** Affinities with the labels Compass gave */
async function readAffinities(studentId: number): Promise<{ affinities: Affinity[]; labels: Map<string, string> }> {
  const remote = await compassInterests(studentId);
  if (!remote) return { affinities: [], labels: new Map() };
  return { affinities: compass.toAffinities(remote), labels: new Map(remote.map(i => [i.topicId, i.label])) };
}

/**
 * How to score feed candidates for a student: Compass's ranking (scores with spreading to related
 * topics, and topics turned off excluded). Candidates Compass didn't score, or every candidate
 * when the ranking can't be had, fall back to the affinities.
 */
export async function feedScoring(studentId: number, candidates: Candidate[], affinities: Map<string, Affinity>): Promise<Scoring> {
  try {
    const learnerId = await learnerIdFor(studentId);
    if (!learnerId || candidates.length === 0) return affinities;
    const ranked = await compass.rankItems(learnerId, candidates.map(c => ({ id: String(c.id), topicIds: c.topics })));
    if (!ranked) return affinities;
    // Nothing scored and nothing excluded: Compass has nothing on the student yet
    if (ranked.every(r => r.score === 0 && !r.excluded)) return affinities;
    const scores = compass.rankScores(ranked);
    return c => {
      const key = String(c.id);
      return scores.has(key) ? scores.get(key)! : candidateScore(c.topics, affinities);
    };
  } catch (e) {
    console.error("Compass interests: ranking failed, using the affinities:", e);
    return affinities;
  }
}

/**
 * The interest summary for the tutor's prompt, from Compass, as Compass wrote it (contract 6.6:
 * context, not an instruction). Null when Compass can't answer; the caller then uses what it
 * used before.
 */
export async function tutorInterestContext(studentId: number): Promise<string | null> {
  // Asked on every tutor turn, so kept for a few minutes rather than fetched each time
  const hit = contexts.get(studentId);
  if (hit && Date.now() - hit.at < CONTEXT_TTL_MS) return hit.text;
  const learnerId = await learnerIdFor(studentId);
  if (!learnerId) return null;
  const text = await compass.interestContext(learnerId, 400);
  if (text !== null) contexts.set(studentId, { at: Date.now(), text });
  return text;
}

const contexts = new Map<number, { at: number; text: string }>();
const CONTEXT_TTL_MS = 3 * 60_000;

/**
 * Every topic signal SigmaRead recorded for a student, oldest first, read back from Compass
 * (contract 6.2, the app's own evidence). Null when Compass can't answer.
 */
export async function getSignals(studentId: number): Promise<Signal[] | null> {
  const events = await ownEvidence(studentId);
  return events && compass.toSignals(events);
}

async function ownEvidence(studentId: number): Promise<compass.OwnEvent[] | null> {
  const learnerId = await learnerIdFor(studentId);
  return learnerId ? compass.fetchOwnEvidence(learnerId) : null;
}

// ─── Topic map ────────────────────────────────────────────────────────────────

/** Neighbours of a topic: explicit links first, then the tree (children, siblings, parent) */
export async function getRelated(slug: string): Promise<RelatedTopic[]> {
  return relatedIn(await topicIndex(), slug);
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

/**
 * Interests the student brought up in an article discussion: one Haiku call finds them, each
 * must quote the student's own words, and only those that resolve to a topic other than the
 * article's own are recorded (the article's topics already get chose_article). Returns what
 * was recorded, for logs and the simulator.
 */
export async function recordChatMentions(args: {
  client: Anthropic;
  studentId: number;
  articleId: number;
  articleTitle: string;
  articleText: string;
  conversationId: number;
  messages: { role: string; content: string }[];
}): Promise<{ topicSlug: string; phrase: string }[]> {
  const said = args.messages.filter(m => m.role === "user" && m.content.trim()).map(m => m.content);
  if (said.length === 0) return [];
  // Without the article's topics nothing would stop its subject being recorded as the student's,
  // so check them before paying for any model call
  const own = (await topicsForArticles([args.articleId])).get(args.articleId) ?? [];
  if (own.length === 0) return [];
  const response = await tracked(args.client, "chat_mentions", args.studentId).messages.create({
    model: MODELS.light, ...requestSettings(MODELS.light, "light"),
    max_tokens: 512,
    messages: [{ role: "user", content: chatMentionsPrompt(args.articleTitle, args.articleText, args.messages) }],
    output_config: { format: { type: "json_schema", schema: CHAT_MENTIONS_SCHEMA } },
  });
  const mentions = verifiedMentions(parseJsonResponse<{ mentions: ChatMention[] }>(response)?.mentions ?? [], said);
  if (mentions.length === 0) return [];

  // The subjects are Haiku's words, not the student's
  const resolved = await resolveTopics(mentions.map(m => m.topic), { client: args.client, studentId: args.studentId });
  // The article's topics and their parents ("space" on a space exploration article) are the article
  // talking, not the student. Children and siblings stay: "I ride horses" on an article tagged
  // "animals" is a real step outside it
  const near = (await Promise.all(own.map(slug => getRelated(slug)))).flat().filter(r => r.via === "parent").map(r => r.slug);
  const found = chatMentionTopics(mentions, resolved, [...own, ...near]);
  await recordSignals(found.map(f => ({
    studentId: args.studentId, type: "chat_mention", topicSlug: f.topicSlug, phrase: f.phrase,
    sourceRef: `chat:${args.conversationId}:${f.topicSlug}`,
  })));
  return found;
}

/**
 * The interests the morning batch should plan articles for: the profile list minus topics the
 * student or an adult rejected, plus up to 3 strong graph topics the profile doesn't name.
 * With `ai`, a profile phrase that matches no topic by name goes to Haiku (one call for a
 * student's unmatched phrases), so a rejected topic is dropped however the student worded it.
 * When Compass can't answer, this is the profile as it stands.
 */
export async function batchInterestsFor(studentId: number, profile: string[], ai?: { client: Anthropic }): Promise<string[]> {
  const { affinities, labels: remoteLabels } = await readAffinities(studentId);
  // Nothing to drop or add: don't pay for matching
  if (affinities.length === 0) return mergeBatchInterests(profile, new Map(), [], new Map());
  const profileSlugs = await resolveTopics(profile, ai && { ...ai, studentId });
  const labels = new Map([...await topicLabels(affinities.map(a => a.topicSlug)), ...remoteLabels]);
  return mergeBatchInterests(profile, profileSlugs, affinities, labels);
}

/**
 * Horizon topics for the morning batch: labels of up to `limit` topics next to the student's
 * strongest interests that they haven't shown a view on yet, best first (Compass's exploration).
 * Empty when Compass has none or can't answer (the batch then falls back to its model-suggested list).
 */
export async function horizonTopicsFor(studentId: number, limit = 6): Promise<string[]> {
  const learnerId = await learnerIdFor(studentId);
  if (!learnerId) return [];
  return ((await compass.exploreTopics(learnerId, limit)) ?? []).map(t => t.label.toLowerCase());
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
  // The student's history and what is turned off both come from Compass: without them, don't ask today
  const signals = await getSignals(studentId);
  if (!signals || !checkinDue(last?.at ?? null, signals[0]?.createdAt ?? null, now)) return [];
  const interests = await compassInterests(studentId);
  if (!interests) return [];

  const since = new Date(now.getTime() - 30 * 86_400_000);
  const served = await db.select({ id: schema.articles.id }).from(schema.articles)
    .where(and(eq(schema.articles.studentId, studentId), gte(schema.articles.createdAt, since)));
  const servedCounts = new Map<string, number>();
  for (const topics of (await topicsForArticles(served.map(a => a.id))).values()) {
    for (const t of topics) servedCounts.set(t, (servedCounts.get(t) ?? 0) + 1);
  }
  const rejected = new Set(compass.toAffinities(interests).filter(a => a.status === "rejected").map(a => a.topicSlug));
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

  const day = now.toISOString().slice(0, 10);
  // "Not as much" halves the score as it stands: Compass works that out when it records the answer
  const rows = signalRows(valid.map(a => ({
    studentId, type: CHECKIN_TYPES[a.answer], topicSlug: a.slug, sourceRef: `checkin:${day}:${a.slug}`,
  })));

  // The event marks the check-in as asked and keeps the answers; then they go to Compass
  await db.insert(schema.articleFeedEvents).values({ studentId, eventType: CHECKIN_EVENT, metadata: { answers: valid } });
  prefetched.delete(studentId);
  contexts.delete(studentId);
  await sendToCompass(rows);
  return true;
}

// ─── For admins ───────────────────────────────────────────────────────────────

/**
 * What a student is into, in plain words: current interests, fading ones, and removed ones.
 * `source` is "unavailable" (and the lists empty) when Compass can't answer.
 */
export async function interestSummaryFor(studentId: number) {
  const remote = await compassInterests(studentId);
  if (!remote) return { current: [], fading: [], removed: [], source: "unavailable" as const };
  const { labels, ...summary } = compass.toSummary(remote);
  const label = <T extends { slug: string }>(list: T[]) => list.filter(t => labels.has(t.slug)).map(t => ({ ...t, label: labels.get(t.slug)! }));
  return { current: label(summary.current), fading: label(summary.fading), removed: label(summary.removed), source: "compass" as const };
}

/**
 * An adult takes a topic off a student's interests, or puts it back. Compass holds the record,
 * with who did it (their Compass person id when they signed in as Compass staff); false when Compass didn't confirm it, so the panel never shows a removal the
 * feed and the tutor wouldn't follow.
 */
export async function setTopicRemoved(studentId: number, topicSlug: string, removed: boolean, by: { role: string; userId: number; compassId?: string }): Promise<boolean> {
  const learnerId = await learnerIdFor(studentId);
  const role = Object.hasOwn(CONTROL_ROLES, by.role) ? CONTROL_ROLES[by.role] : undefined;
  if (!learnerId || !role) return false;
  const sent = !!(await compass.sendControl(learnerId, topicSlug, removed ? "remove" : "restore", { role, id: by.compassId ?? String(by.userId) }));
  if (sent) { prefetched.delete(studentId); contexts.delete(studentId); }
  return sent;
}

/** SigmaRead's adult roles as Compass names them */
const CONTROL_ROLES: Record<string, compass.ControlRole> = { admin: "admin" };

// ─── Re-send ──────────────────────────────────────────────────────────────────

/**
 * Send Compass what it should already have and what SigmaRead still holds as reading state:
 * each interest-profile entry (as declared, dated at signup), likes and dislikes, and daily
 * favorites. The morning batch runs this, so a signal lost while Compass was unreachable is
 * made good the next morning. Only what Compass doesn't list among SigmaRead's own evidence is
 * sent, and every event has a source ref, so a repeat changes nothing. Exact matches only.
 * Returns how many events were new to Compass.
 */
export async function resendReadingState(studentIds: number[]): Promise<number> {
  let added = 0;
  if (!compass.compassConfigured() || studentIds.length === 0) return 0;
  const students = await db.select({ id: schema.students.id, interestProfile: schema.students.interestProfile, createdAt: schema.students.createdAt })
    .from(schema.students)
    .where(and(inArray(schema.students.id, studentIds), eq(schema.students.onboardingComplete, true), isNotNull(schema.students.externalId)));
  for (const s of students) {
    // Without Compass's list there is no telling what it has: leave this student for tomorrow
    const events = await ownEvidence(s.id);
    if (!events) continue;
    const refs = events.map(e => e.sourceRef);
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
    added += await sendToCompass(signalRows(inputs), { importing: true });
  }
  return added;
}
