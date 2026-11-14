/**
 * Morning Article Batch Generation — Source-First Pipeline
 *
 * Runs daily at 5 AM CT from Vercel Cron via /api/cron/morning-batch,
 * or by hand with: npx tsx scripts/morning-batch.ts
 *
 * Resumable: each finished unit (base article, adaptation, student served) is saved
 * as it completes, and a rerun picks up whatever is missing. Pass a deadline so a
 * call stops cleanly before the serverless time limit; the next call continues.
 *
 * Process:
 * 1. Analyze active students: interests, reading levels, aggregate interest pool
 * 2. Plan daily mix: 60% interest / 20% news / 20% horizon per student
 * 3. Source content: interest → story angles → web search → fetch → content filter and story gate
 * 4. Write: the writer model tells the story from the page at L4 (or from its own knowledge, marked for review, when no page fits)
 * 5. Adapt each article to all needed reading levels using Sonnet
 * 6. Fill each student's buffer to 5 unread articles
 * 7. Flag expired articles
 *
 * Almost every article is grounded in a real web source (source_url in article_cache); the rest carry a review_note.
 * Shared pool — one base article serves all students at a given level.
 * Students never see the same article twice (tracked via student_article_history).
 */

import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { normalizeInterestProfile } from "../normalize-interests";
import { tracked } from "../ai-usage";
import { backfillSignals, batchInterestsFor, clearPrefetched, feedScoring, getAffinities, horizonTopicsFor, prefetchInterests, quietly, syncToCompass, tagCacheArticle, tagUntaggedCache, topicsForCache } from "../interest-graph";
import { pickForFeed } from "../interest-graph/serving";
import { isIndexPage, isOlderThan } from "./search-filters";
import { parseSourcePick, type SearchResult } from "./source-pick";
import { MODELS, requestSettings } from "../models";
import { BASE_LEVEL, rewriteFromSource as writeBase, writeFromKnowledge as writeUnsourced, adaptArticleToLevel as writeAdaptation, reviseArticle, type BaseArticle, type SourcedTopic } from "./article-writer";
import { guidanceForLevel, landOnTarget, measureArticles, storedLevel, targetForLevel, type StoredLevel } from "../reading-level";
import { storyAngles, type StoryAngle } from "./story-angles";
import { findDuplicate, type ExistingArticle } from "./dedup";
import { writeGuideNotes } from "../tutor/guide-notes";
import { checkBudget, excerpt, findRepeats, pickWithoutRepeats, type ArticleGist } from "../repeats";
import { recentArticles, recentTopics } from "../recent-reading";
import { pickInterests } from "./plan-interests";
import { pickServing } from "./serve-picks";
import { probeLevelOf, probeServeCount, probeSlotOrder, type FeedMix } from "../level-progression-rules";
import { KID_NEWS_DOMAINS, NEWS_DOMAINS, NEWS_TOPICS, STORY_DOMAINS, isGrokipediaPagePath } from "./sources";

const DATABASE_URL = process.env.DATABASE_URL!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const BUFFER_TARGET = 10; // 2-day buffer in case batch fails
/** Stories written for a student's own interests go to that student even when the buffer is full: this many per run... */
const OWN_STORIES_MAX = 3;
/** ...from the last this many days (a full buffer or a failed serve step mustn't lose them) */
const OWN_STORIES_DAYS = 7;
/** How far back the duplicate check looks for articles on the same subject */
const DEDUP_DAYS = 60;

const sql = neon(DATABASE_URL);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
/** Model and settings for the mechanical steps: running a web search */
const LIGHT = { model: MODELS.light, ...requestSettings(MODELS.light, "light") };
/**
 * Model and settings for judgement calls: is this page about the story, is there a story in it,
 * what is next to a student's interests. These decide what kids read, so they get the standard
 * model, not the cheapest one (quality over cost, user decision 2026-11-08).
 */
const JUDGE = { model: MODELS.standard, ...requestSettings(MODELS.standard, "standard") };

/**
 * When no page about any of an interest's stories can be found, the article is written from the
 * model's own knowledge and marked for review. Set ARTICLE_KNOWLEDGE_FALLBACK=off to write
 * only from pages (the interest then gets nothing that day).
 */
const KNOWLEDGE_FALLBACK = process.env.ARTICLE_KNOWLEDGE_FALLBACK !== "off";
const UNSOURCED_NOTE = "No web page fit this story, so it was written from the model's own knowledge. Check the facts.";

/**
 * The base article for a sourced topic: a rewrite of its page, or, with no page, written from
 * knowledge. A page passed the content filter before it was used; an article written from
 * knowledge has no page, so the finished text goes through the same check instead.
 */
async function writeBaseArticle(topic: SourcedTopic): Promise<(BaseArticle & { level: StoredLevel }) | null> {
  const guidance = (await guidanceForLevel(BASE_LEVEL))?.summary;
  const written = topic.sourceUrl
    ? await writeBase(tracked(anthropic, "batch_rewrite"), topic, { guidance })
    : await writeUnsourced(tracked(anthropic, "batch_write"), topic, { guidance });
  if (!written) return null;
  // Measured (and rewritten once, if far off) before the content check, so the check reads the text that is stored
  const { article, level } = await toTarget(written, BASE_LEVEL, guidance);
  if (!topic.sourceUrl) {
    const kept = await filterSources([{ url: `knowledge:${topic.query}`, text: `${article.title}\n\n${article.bodyText}`, whole: true }]);
    if (kept.length === 0) { console.log(`     🚫 Article written from knowledge failed the content check: "${article.title}"`); return null; }
  }
  return { ...article, level };
}
async function adaptArticleToLevel(title: string, body: string, level: number) {
  const guidance = (await guidanceForLevel(level))?.summary;
  const adapted = await writeAdaptation(tracked(anthropic, "batch_adapt"), title, body, level, { guidance });
  if (!adapted) return null;
  const { article, level: measured } = await toTarget(adapted, level, guidance);
  return { ...article, level: measured };
}
/**
 * Compass's reading-level measure (src/lib/reading-level.ts): measure the finished article against
 * its level's target, and send a clear miss back to the writer once, keeping the closer of the
 * two. The title is kept. When Compass doesn't answer, the article goes on as written, unmeasured,
 * and measureUnmeasured picks it up on a later run.
 */
async function toTarget<T extends { title: string; bodyText: string }>(article: T, level: number, guidance: string | undefined): Promise<{ article: T; level: StoredLevel }> {
  const result = await landOnTarget({
    level,
    article,
    rewrite: async (advice, first) => {
      console.log(`     📏 L${level} measured ${first.level}L for a ${targetForLevel(level)}L target; rewriting once`);
      const revised = await reviseArticle(tracked(anthropic, "batch_revise"), article.title, article.bodyText, advice, { guidance });
      return revised ? { ...article, bodyText: revised.bodyText } : null;
    },
  }).catch(e => {
    console.error("Reading level check failed:", e instanceof Error ? e.message : e);
    return { article, measured: null, rewritten: false };
  });
  if (result.measured) console.log(`     📏 L${level}: ${result.measured.level}L (target ${targetForLevel(level)}L${result.rewritten ? ", after one rewrite" : ""}${result.measured.reliable ? "" : ", not reliable"})`);
  return { article: result.article, level: storedLevel(result.measured) };
}

/**
 * Measures cached articles that have no level yet (written while Compass was not answering, or
 * before the measure existed) or whose level came from an older model version. Measuring is
 * arithmetic on Compass's side, so this is cheap; nothing is rewritten here.
 */
async function measureUnmeasured(): Promise<number> {
  const version = (await guidanceForLevel(BASE_LEVEL))?.modelVersion;
  if (!version) return 0;
  const rows = await sql`
    SELECT id, body_text, reading_level FROM article_cache
    WHERE flagged = false AND (measured_level IS NULL OR level_model_version IS DISTINCT FROM ${version})
    ORDER BY id DESC LIMIT 300
  `;
  if (rows.length === 0) return 0;
  const results = await measureArticles(rows.map(r => ({ text: r.body_text as string, level: r.reading_level as number })));
  let stored = 0;
  for (let i = 0; i < rows.length; i++) {
    const m = results[i];
    if (!m) continue;
    await sql`UPDATE article_cache SET measured_level = ${m.level}, level_model_version = ${m.modelVersion}, level_reliable = ${m.reliable} WHERE id = ${rows[i].id}`;
    stored++;
  }
  if (stored > 0) console.log(`📏 Measured ${stored} articles that had no reading level`);
  return stored;
}
/** Sigma's prep notes for a new base article, stored on its row; a failure leaves the tutor without notes, never without an article */
const writeNotesFor = (cacheId: number, title: string, body: string) => quietly((async () => {
  const notes = await writeGuideNotes(tracked(anthropic, "guide_notes"), title, body);
  if (notes) await sql`UPDATE article_cache SET guide_notes = ${JSON.stringify(notes)}::jsonb WHERE id = ${cacheId}`;
})(), "guide notes");
const ADAPT_CONCURRENCY = 3;
/** Budget kept at the end of a run for adapting leftovers and serving, so students get articles every run */
const SERVE_RESERVE_MS = 150_000;

export interface BatchOptions {
  /** Epoch ms after which no new unit of work is started. */
  deadline?: number;
}

export interface BatchResult {
  status: "complete" | "partial";
  baseArticles: number;
  adaptations: number;
  served: number;
}

class OutOfTime extends Error {}

let deadline = Infinity;

/** Throws OutOfTime once the deadline passes, so the run stops between units of work. */
function checkTime(step: string) {
  if (Date.now() > deadline) throw new OutOfTime(step);
}

/** Run async tasks with a fixed number in flight. */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

interface Student {
  id: number;
  name: string;
  reading_level: number;
  interest_profile: any;
  adjacent_interests: string[] | null;
  daily_article_cap: number;
  feed_mix: FeedMix | null;
}


// ─── Step 1: Analyze Students ───────────────────────────────────────────────

async function analyzeStudents(): Promise<{
  students: Student[];
  levelsNeeded: Set<number>;
  interestMap: Map<string, number[]>; // interest → [studentId, ...]
  studentInterests: Map<number, string[]>; // studentId → ordered interest list
  recentTopics: Set<string>;
}> {
  const students = await sql`
    SELECT id, name, reading_level, interest_profile, adjacent_interests, daily_article_cap, feed_mix
    FROM students WHERE onboarding_complete = true AND reading_level IS NOT NULL
  ` as Student[];

  // A student in a level probe also reads at the probe level, so articles are adapted to it too
  const levelsNeeded = new Set(students.flatMap(s => {
    const probe = probeLevelOf(s.reading_level, s.feed_mix);
    return probe ? [s.reading_level, probe] : [s.reading_level];
  }));

  // Students linked to Compass: read all their interests in one call (no-op when Compass is off)
  const fromCompass = await prefetchInterests(students.map(s => s.id as number));
  if (fromCompass > 0) console.log(`🧭 Interests for ${fromCompass} students read from Compass`);

  // Aggregate interests across students into weighted map + per-student lists
  const interestMap = new Map<string, number[]>();
  const studentInterests = new Map<number, string[]>();
  for (const s of students) {
    const profile = normalizeInterestProfile(s.interest_profile);
    // The interest graph drops topics the student or an adult took off and adds strong topics
    // the profile doesn't name; if it fails, plan from the profile as before
    const interests = await batchInterestsFor(s.id, profile.interests).catch(e => {
      console.error(`  ⚠️ Interest graph unavailable for ${s.name}, planning from profile:`, e);
      return profile.interests;
    });
    const normalizedInterests: string[] = [];
    for (const interest of interests) {
      const lower = interest.toLowerCase().trim();
      normalizedInterests.push(lower);
      const ids = interestMap.get(lower) || [];
      ids.push(s.id);
      interestMap.set(lower, ids);
    }
    studentInterests.set(s.id, normalizedInterests);
  }

  // Recent topics (last 14 days) for dedup — include both AI-assigned labels AND original query strings
  const recent = await sql`SELECT topic, query FROM generated_topics WHERE generated_date > CURRENT_DATE - INTERVAL '14 days'`;
  const recentTopics = new Set(recent.flatMap(r => [
    (r.topic as string).toLowerCase(),
    r.query ? (r.query as string).toLowerCase() : null,
  ].filter(Boolean) as string[]));

  return { students, levelsNeeded, interestMap, studentInterests, recentTopics };
}

// ─── Step 2: Plan Daily Articles ────────────────────────────────────────────

interface ArticlePlan {
  query: string;
  type: "interest" | "news" | "horizon";
  searchQuery: string;
  /** News only: search just these sites (subdomains included) */
  domains?: string[];
  /** News only: skip results whose page date is known and older than this */
  maxAgeDays?: number;
}

async function planDailyArticles(
  interestMap: Map<string, number[]>,
  students: Student[],
  recentTopics: Set<string>,
  studentInterests: Map<number, string[]>,
): Promise<ArticlePlan[]> {
  console.log("📋 Planning daily article mix...");

  // Every student's top interests (one story each), one news article, one horizon topic
  const plans: ArticlePlan[] = [];

  // --- News (1 article) — candidates in order; sourcing stops at the first that passes ---
  // 1. Kid news sites, this week's stories
  plans.push({ query: "kids news", type: "news", searchQuery: "news this week", domains: KID_NEWS_DOMAINS, maxAgeDays: 14 });
  // 2. Two random topics on reliable science/nature news sites (science topics only), then on the open web
  const topics = [...NEWS_TOPICS].sort(() => Math.random() - 0.5).slice(0, 2);
  for (const t of topics.filter(t => t.science)) plans.push({ query: t.query, type: "news", searchQuery: `${t.query} news`, domains: NEWS_DOMAINS, maxAgeDays: 7 });
  for (const t of topics) plans.push({ query: t.query, type: "news", searchQuery: `${t.query} news`, maxAgeDays: 7 });

  // --- Interest articles: per-student planning with interest_rotation LRU ---
  // Fetch LRU state from interest_rotation table
  const rotationRows = await sql`SELECT interest, last_featured_at FROM interest_rotation`;
  const lastFeaturedMap = new Map(rotationRows.map(r => [
    (r.interest as string).toLowerCase(),
    r.last_featured_at ? new Date(r.last_featured_at as string) : null,
  ]));

  // Per student: their top-3 least-recently-featured interests, all of them written today (no
  // cap: quality and personal fit over cost). An interest already written today (by an earlier
  // run that hit its time limit, or a new student's starter article) is left out, so a resumed
  // run picks up where the last one stopped. The order matters for the same reason: every
  // student's first interest is written before anyone's second (plan-interests.ts), and students
  // whose interests have waited longest go first, with a shuffle so ties don't favour the same
  // students.
  const writtenToday = new Set((await sql`SELECT interest FROM interest_rotation WHERE last_featured_at = CURRENT_DATE`).map(r => (r.interest as string).toLowerCase()));
  const featured = (interest: string) => lastFeaturedMap.get(interest)?.getTime() ?? 0;
  // Today's writes take the student's slots first, so a resumed run doesn't move on to a fourth interest
  const rank = (interest: string) => writtenToday.has(interest) ? -1 : featured(interest);
  const wants = students
    .map(student => {
      const interests = (studentInterests.get(student.id) || []).map(i => i.toLowerCase().trim());
      // NULL = never featured = highest priority
      return [...interests].sort((a, b) => rank(a) - rank(b)).slice(0, 3).filter(i => !writtenToday.has(i));
    })
    .map(w => ({ w, latest: Math.max(0, ...w.map(featured)), r: Math.random() }))
    .sort((a, b) => a.latest - b.latest || a.r - b.r)
    .map(x => x.w);
  const pickedInterests = new Set(pickInterests(wants));
  console.log(`  🎯 Today's interests (${pickedInterests.size} for ${students.length} students${writtenToday.size > 0 ? `, ${writtenToday.size} written earlier today` : ""}): ${[...pickedInterests].join(', ')}`);

  // Deduplicate: each interest appears at most once in plans
  for (const interest of pickedInterests) {
    plans.push({
      query: interest,
      type: "interest",
      searchQuery: interest,
    });
  }

  // --- Horizon article (1) ---
  // From the interest graph: topics next to each student's strongest interests that they
  // haven't shown a view on yet (top 3 each). Students without graph data use their
  // model-suggested adjacent interests, computed once and stored.
  // Written once a day: a resumed run that already has today's horizon article skips this.
  const [horizonToday] = await sql`
    SELECT 1 FROM article_cache
    WHERE generated_date = CURRENT_DATE AND base_article_id IS NULL AND category = 'general' AND flagged = false
    LIMIT 1
  `;
  if (horizonToday) {
    console.log(`  🧭 Horizon article already written today`);
    console.log(`  📊 Plan: ${plans.filter(p => p.type === "interest").length} interest, ${plans.filter(p => p.type === "news").length} news, 0 horizon`);
    return plans;
  }
  const graphHorizons: string[] = [];
  const allAdjacentInterests: string[] = [];
  const studentsNeedingAdjacent: Student[] = [];

  for (const s of students) {
    const fromGraph = await horizonTopicsFor(s.id, 3).catch(e => {
      console.error(`  ⚠️ Interest graph unavailable for ${s.name}'s horizon topics:`, e);
      return [] as string[];
    });
    if (fromGraph.length > 0) {
      graphHorizons.push(...fromGraph);
    } else if (s.adjacent_interests && s.adjacent_interests.length > 0) {
      allAdjacentInterests.push(...s.adjacent_interests.slice(0, 3)); // 3 each, like graph students
    } else {
      studentsNeedingAdjacent.push(s);
    }
  }

  // Compute adjacent interests for students who don't have them
  for (const s of studentsNeedingAdjacent) {
    const profile = normalizeInterestProfile(s.interest_profile);
    if (profile.interests.length === 0) continue;

    try {
      const response = await tracked(anthropic, "batch_adjacent").messages.create({
        ...JUDGE,
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `A student is interested in: ${profile.interests.join(", ")}

Suggest 6 adjacent topics they might find fascinating — related but in different domains. Age-appropriate for kids 8-14.

Output ONLY a JSON array of strings:
["topic1", "topic2", ...]`,
        }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const adjacent = JSON.parse(match[0]) as string[];
        allAdjacentInterests.push(...adjacent.slice(0, 3));
        // Store on student record for future batches
        await sql`UPDATE students SET adjacent_interests = ${JSON.stringify(adjacent)} WHERE id = ${s.id}`;
        console.log(`  🧭 Computed adjacent interests for ${s.name}: ${adjacent.slice(0, 3).join(", ")}...`);
      }
    } catch (e) {
      console.log(`  ⚠️ Failed to compute adjacent interests for ${s.name}`);
    }
  }

  // Pick 1 horizon topic at random from everyone's candidates, avoiding recent ones, so no
  // single student's list decides every day. Duplicates stay in the draw, so a topic several
  // students are near is more likely.
  const pool = [...graphHorizons, ...allAdjacentInterests].map(a => a.toLowerCase());
  const uniqueAdjacent = [...new Set(pool)];
  const fresh = pool.filter(a => !recentTopics.has(a));
  const horizonPicks = fresh.length > 0 ? [fresh[Math.floor(Math.random() * fresh.length)]] : [];
  console.log(`  🧭 ${uniqueAdjacent.length} horizon candidates (${graphHorizons.length} from the graph), picked: ${horizonPicks[0] ?? "none fresh"}`);

  // Fallback if we can't find unrepeated ones
  if (horizonPicks.length < 1) {
    horizonPicks.push(...uniqueAdjacent.slice(0, 1));
  }

  for (const topic of horizonPicks) {
    plans.push({
      query: topic,
      type: "horizon",
      searchQuery: topic,
    });
  }

  console.log(`  📊 Plan: ${plans.filter(p => p.type === "interest").length} interest, ${plans.filter(p => p.type === "news").length} news, ${plans.filter(p => p.type === "horizon").length} horizon`);
  return plans;
}

// ─── Step 3: Source Content ─────────────────────────────────────────────────

// ─── Grokipedia Search (for interest & horizon articles) ────────────────────

async function grokipediaSearch(query: string): Promise<{ title: string; url: string }[]> {
  try {
    const res = await fetch(`https://grokipedia.com/search?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "SigmaRead/1.0 (educational article bot)" },
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Parse search results — links are in format /page/Title
    const matches = [...html.matchAll(/href="(\/page\/[^"]+)"/g)];
    const seen = new Set<string>();
    const results: { title: string; url: string }[] = [];
    for (const m of matches) {
      const path = m[1];
      if (seen.has(path) || !isGrokipediaPagePath(path)) continue;
      seen.add(path);
      const title = decodeURIComponent(path.replace("/page/", "").replace(/_/g, " "));
      results.push({ title, url: `https://grokipedia.com${path}` });
    }
    return results;
  } catch (e) {
    console.log(`  ⚠️ Grokipedia search failed for "${query}": ${(e as Error).message}`);
    return [];
  }
}

async function fetchGrokipediaArticle(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SigmaRead/1.0 (educational article bot)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const text = extractArticleText(html);
    if (text.split(/\s+/).length < 50) return null;
    return text;
  } catch {
    return null;
  }
}

/**
 * Search results come back in the site's order, so "soccer" can lead with a TV channel,
 * "animals" with a novel and "games" with "Girls games". Haiku keeps only the pages about the
 * story itself, best first (the standard model; Haiku before 2026-11-09). A general overview page is never added: the search is for one
 * story (story-angles.ts), and an overview gives an overview article. If the check fails or its
 * reply can't be read, the results are kept as they were.
 */
async function onTopicResults(query: string, results: SearchResult[]): Promise<SearchResult[]> {
  const candidates = results.slice(0, 12);
  try {
    const response = await tracked(anthropic, "batch_source_pick").messages.create({
      ...JUDGE,
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `A reading app for kids aged 8-14 wants a page to write a short article from. The story it is after: "${query}"

Pages found:
${candidates.map((r, i) => `${i + 1}. ${r.title}`).join("\n") || "(none)"}

Which pages are about "${query}" itself, or carry that story? Leave out:
- pages about something that only shares a name (a book, film, album, song, TV channel, company, team or person), unless that is clearly what "${query}" names
- general overview pages on the whole subject ("Animal", "History", "Cooking", "Video game") that would only give an overview
Best first; an empty list if none fit.

Reply with only JSON, e.g. {"pages": [3, 1]} or {"pages": []}.`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const picked = parseSourcePick(text, candidates);
    if (!picked) return results;
    if (picked.length !== candidates.length || picked.some((r, i) => r.url !== candidates[i].url)) {
      console.log(`     🎯 On topic for "${query}": ${picked.map(r => r.title).join(", ") || "none"}`);
    }
    return picked;
  } catch (e) {
    console.log(`     ⚠️ Topic check failed for "${query}", using search order: ${(e as Error).message}`);
    return results;
  }
}

// ─── Web search (news, and fallback for interest/horizon) ────────────────────

/**
 * Finds pages with Anthropic's server-side web search tool, so the batch needs no
 * separate search API key. Only the result URLs and titles are used; the page text
 * is fetched and filtered by the same code as before.
 */
async function webSearch(query: string, opts: { domains?: string[]; maxAgeDays?: number } = {}): Promise<{ title: string; url: string }[]> {
  const { domains, maxAgeDays } = opts;
  try {
    const response = await tracked(anthropic, "batch_search").messages.create({
      ...LIGHT,
      max_tokens: 1024,
      tools: [{
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 1,
        ...(domains?.length ? { allowed_domains: domains } : {}),
      }],
      messages: [{
        role: "user",
        content: `Run one web search for: ${query}${maxAgeDays ? `, ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}` : ""}. Reply with just "done".`,
      }],
    });
    const results: { title: string; url: string }[] = [];
    let searched = false;
    for (const block of response.content) {
      if (block.type !== "web_search_tool_result") continue;
      if (!Array.isArray(block.content)) {
        console.log(`     ⚠️ Web search error: ${block.content.error_code}`);
        continue;
      }
      searched = true;
      for (const r of block.content) {
        if (isIndexPage(r.url)) continue;
        if (maxAgeDays && isOlderThan(r.page_age, maxAgeDays)) continue;
        results.push({ title: r.title || "", url: r.url });
      }
    }
    if (searched) searchHealth.ok++;
    else {
      console.log(`     ⚠️ Web search returned no results block (stop: ${response.stop_reason})`);
      searchHealth.failed++;
    }
    return results.slice(0, 5);
  } catch (err) {
    console.log(`     ⚠️ Web search failed: ${(err as Error).message}`);
    searchHealth.failed++;
    return [];
  }
}

/** Counts searches that returned results vs. errored, so a run where every search fails is loud. */
const searchHealth = { ok: 0, failed: 0 };

function extractArticleText(html: string): string {
  // Remove script, style, nav, header, footer tags and their content
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");

  // Try to extract article/main content first
  const articleMatch = text.match(/<article[\s\S]*?<\/article>/i)
    || text.match(/<main[\s\S]*?<\/main>/i);
  if (articleMatch) {
    text = articleMatch[0];
  }

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]*>/g, " ");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Truncate to ~3000 words to stay within reasonable prompt size
  const words = text.split(/\s+/);
  if (words.length > 3000) {
    text = words.slice(0, 3000).join(" ") + "...";
  }

  return text;
}

async function fetchSourceText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SigmaRead/1.0 (educational article bot)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const text = extractArticleText(html);
    // Skip if too short to be a real article (50 words minimum — many kid sites have shorter content)
    if (text.split(/\s+/).length < 50) return null;
    return text;
  } catch {
    return null;
  }
}

const CONTENT_BLOCKLIST = "real-world war or armed conflict, graphic violence, murder, crime, partisan politics, religion, sexuality, gender identity, drugs, alcohol, self-harm, abortion";

async function filterSources<T extends { url: string; text: string; whole?: boolean }>(
  sources: T[]
): Promise<T[]> {
  if (sources.length === 0) return [];

  // One call judges the whole batch of pages: their openings, or the whole text when asked
  // (a finished article written without a source page)
  const summaries = sources.map((s, i) =>
    `[${i}] ${s.url}\n${s.whole ? s.text : s.text.substring(0, 500)}`
  ).join("\n\n");

  try {
    const response = await tracked(anthropic, "batch_filter").messages.create({
      ...JUDGE,
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `You are a content filter for a children's reading app (ages 8-14).

Review these article summaries. REJECT any that:
1. PRIMARILY discuss: ${CONTENT_BLOCKLIST}
2. Are NOT actual articles — reject homepages, marketing/promotional copy, product pages, "about us" pages, app descriptions, podcast landing pages, or any page that is selling/promoting a service rather than reporting information
3. Have no story in them — reject a general overview or definition of a whole subject (an encyclopedia entry on "Animal", "History", "Business", "Cooking", "Video game"), a list of types, or a page that is all background and no particular creature, person, event, machine, number or question. KEEP pages about one specific thing with concrete details, even when they are encyclopedia pages

IMPORTANT — do NOT reject articles about:
- Video games, strategy games, or esports (even if they involve in-game combat)
- Sports and recreational activities (including airsoft, paintball, martial arts, archery)
- Severe weather, natural disasters, or climate events
- History topics that mention past conflicts in an educational context
- Firefighting, emergency services, or rescue operations

KEEP real articles with factual, informative content and something specific in them. Only reject on rule 1 when the PRIMARY focus is on the blocklist topics above.

${summaries}

Return ONLY a JSON array of indices to KEEP:
[0, 2, 5, ...]`,
      }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const keepIndices = new Set(JSON.parse(match[0]) as number[]);
      return sources.filter((_, i) => keepIndices.has(i));
    }
  } catch (e) {
    console.log("  ⚠️ Content filter failed, keeping the pages and dropping any article written from knowledge (it has no other check)");
  }
  return sources.filter(s => !s.whole);
}

/**
 * Source URLs being written right now by another call in this process (new students' first
 * articles are written in parallel, and two interests can land on the same page).
 */
const urlsInFlight = new Set<string>();

/** Base articles written in the last DEDUP_DAYS, newest first, for the duplicate check */
async function recentBaseArticles(): Promise<ExistingArticle[]> {
  const rows = await sql`
    SELECT id, title FROM article_cache
    WHERE base_article_id IS NULL AND generated_date > CURRENT_DATE - ${DEDUP_DAYS}::int
    ORDER BY id DESC LIMIT 300
  `;
  return rows.map(r => ({ id: r.id as number, title: r.title as string }));
}

interface SourceOptions {
  /** Called when a plan's best source would duplicate an article already in the pool */
  onDuplicate?: (query: string, existingId: number) => void;
  /** Claim the chosen URLs in urlsInFlight; the caller releases them */
  claimed?: string[];
}

async function sourceContent(plans: ArticlePlan[], recentTopics: Set<string>, opts: SourceOptions = {}): Promise<SourcedTopic[]> {
  searchHealth.ok = 0;
  searchHealth.failed = 0;
  console.log("\n🔍 Sourcing content...\n");
  const sourced: SourcedTopic[] = [];

  // Track recently used URLs to pick different angles
  const usedUrls = new Set<string>();

  // Load URLs used in the last 30 days to prevent cross-batch source repetition
  const recentUrls = await sql`
    SELECT DISTINCT source_url FROM article_cache
    WHERE source_url IS NOT NULL AND generated_date > CURRENT_DATE - INTERVAL '30 days'
  `;
  for (const r of recentUrls) usedUrls.add(r.source_url as string);
  console.log(`  🔒 Pre-seeded ${usedUrls.size} recently-used URLs for exclusion`);

  // Same subject from a different page or interest ("tesla", "electric cars") is a duplicate too.
  // Sources chosen earlier in this call join the list (negative ids: not in the pool yet).
  const existing = await recentBaseArticles().catch(e => { console.error("  ⚠️ Recent articles unavailable for the duplicate check:", e); return [] as ExistingArticle[]; });
  let pending = 0;
  const dedupClient = tracked(anthropic, "batch_dedup");

  /** Whether to use this page: not used before, not in flight elsewhere, not a duplicate subject */
  async function accept(plan: ArticlePlan, title: string, url: string, text: string): Promise<boolean> {
    if (usedUrls.has(url) || urlsInFlight.has(url)) return false;
    const dup = await findDuplicate(dedupClient, { title, text }, existing);
    if (dup !== null) {
      const match = existing.find(e => e.id === dup);
      console.log(`     ♻️ "${title}" would duplicate "${match?.title}", skipping`);
      if (dup > 0) opts.onDuplicate?.(plan.query, dup);
      return false;
    }
    usedUrls.add(url);
    existing.unshift({ id: --pending, title });
    if (opts.claimed) { urlsInFlight.add(url); opts.claimed.push(url); }
    return true;
  }

  /** Content filter and story gate for every page, Grokipedia's included (an overview page is rejected here) */
  async function suitable(url: string, text: string): Promise<boolean> {
    const kept = await filterSources([{ url, text }]);
    if (kept.length === 0) console.log(`     🚫 Not suitable (unsafe, not an article, or no story in it): ${url.substring(0, 60)}`);
    return kept.length > 0;
  }

  /** First suitable, unused, non-duplicate page among web search results; null if none */
  async function firstGoodResult(plan: ArticlePlan, results: SearchResult[], max: number): Promise<{ url: string; text: string } | null> {
    for (const r of results.slice(0, max)) {
      if (usedUrls.has(r.url) || urlsInFlight.has(r.url)) continue;
      const text = await fetchSourceText(r.url);
      if (!text) continue;
      if (!(await suitable(r.url, text))) continue;
      if (await accept(plan, r.title, r.url, text)) return { url: r.url, text };
    }
    return null;
  }

  /** A Grokipedia page about the story, or null. Specific pages only; the overview page on the subject is never taken. */
  async function fromGrokipedia(plan: ArticlePlan, angle: StoryAngle): Promise<{ url: string; text: string } | null> {
    console.log(`  📖 Grokipedia: "${angle.query}" (${plan.type}: ${plan.query})`);
    const results = await onTopicResults(angle.query, await grokipediaSearch(angle.query));
    if (results.length === 0) { console.log(`     ⚠️ No on-topic Grokipedia results`); return null; }
    for (const result of results.slice(0, 6)) {
      if (usedUrls.has(result.url) || urlsInFlight.has(result.url) || recentTopics.has(result.title.toLowerCase())) continue;
      const text = await fetchGrokipediaArticle(result.url);
      if (!text) continue;
      if (!(await suitable(result.url, text))) continue;
      if (await accept(plan, result.title, result.url, text)) {
        console.log(`     ✅ ${result.title} (${result.url.substring(0, 55)}...)`);
        return { url: result.url, text };
      }
    }
    return null;
  }

  /** A page about the story from the kids' explainer and news sites, or null */
  async function fromStorySites(plan: ArticlePlan, angle: StoryAngle): Promise<{ url: string; text: string } | null> {
    console.log(`  🔎 Story sites: "${angle.query}" (${plan.type}: ${plan.query})`);
    const found = await webSearch(angle.query, { domains: STORY_DOMAINS });
    const results = (await onTopicResults(angle.query, found))
      .filter(r => !r.url.includes("grokipedia.com") && !recentTopics.has(r.title.toLowerCase()));
    const hit = await firstGoodResult(plan, results, 4);
    if (hit) console.log(`     ✅ ${hit.url.substring(0, 70)}`);
    else console.log(`     ⚠️ Nothing usable on the story sites`);
    return hit;
  }

  // ─── Interest & Horizon: stories, not topics ───────────────────────────────
  // Each interest becomes a few specific stories (story-angles.ts). For each story in turn: the
  // kids' explainer and news sites, then the open web, then a specific Grokipedia page. With no
  // page for any story, the first story that isn't already in the pool is written from the
  // model's own knowledge (marked for review) when the fallback is on; otherwise the interest
  // gets nothing today.

  /** The first of the angles that doesn't duplicate an article in the pool (or one chosen earlier in this call), or null */
  async function freshAngle(plan: ArticlePlan, angles: StoryAngle[]): Promise<StoryAngle | null> {
    for (const angle of angles) {
      const dup = await findDuplicate(dedupClient, { title: angle.angle, text: angle.why }, existing);
      if (dup === null) {
        existing.unshift({ id: --pending, title: angle.angle });
        return angle;
      }
      console.log(`     ♻️ "${angle.angle}" would duplicate "${existing.find(e => e.id === dup)?.title}", skipping`);
      if (dup > 0) opts.onDuplicate?.(plan.query, dup);
    }
    return null;
  }

  const recentTitles = existing.filter(e => e.id > 0).map(e => e.title);
  const anglesClient = tracked(anthropic, "batch_angles");
  const topicPlans = plans.filter(p => p.type === "interest" || p.type === "horizon");
  for (const plan of topicPlans) {
    const angles = await storyAngles(anglesClient, plan.query, plan.type === "horizon" ? "horizon" : "interest", recentTitles);
    if (angles.length === 0) { console.log(`     ⚠️ No story angles for "${plan.query}" this run; trying again next run`); continue; }
    console.log(`  💡 Stories for "${plan.query}": ${angles.map(a => a.angle).join(" / ")}`);

    let hit: { url: string; text: string; angle: StoryAngle } | null = null;
    for (const angle of angles) {
      const page = await fromStorySites(plan, angle);
      if (page) { hit = { ...page, angle }; break; }
    }
    if (!hit) {
      for (const angle of angles) {
        console.log(`     ⚠️ Trying the open web for "${angle.query}"...`);
        const results = await onTopicResults(angle.query, await webSearch(`${angle.query} article`));
        const page = await firstGoodResult(plan, results.filter(r => !recentTopics.has(r.title.toLowerCase())), 3);
        if (page) { hit = { ...page, angle }; console.log(`     ✅ Web search: ${page.url.substring(0, 60)}...`); break; }
      }
    }
    if (!hit) {
      for (const angle of angles) {
        const page = await fromGrokipedia(plan, angle);
        if (page) { hit = { ...page, angle }; break; }
      }
    }

    if (hit) {
      sourced.push({ query: plan.query, type: plan.type, sourceUrl: hit.url, sourceText: hit.text, angle: hit.angle });
      recentTitles.push(hit.angle.angle);
      continue;
    }
    if (!KNOWLEDGE_FALLBACK) {
      console.log(`     ❌ No page for any story about "${plan.query}"; nothing written today`);
      continue;
    }
    const angle = await freshAngle(plan, angles);
    if (angle) {
      console.log(`     ✍️  No page for any story about "${plan.query}"; writing "${angle.angle}" from knowledge (marked for review)`);
      sourced.push({ query: plan.query, type: plan.type, sourceUrl: null, sourceText: "", angle });
      recentTitles.push(angle.angle);
    } else {
      console.log(`     ❌ No page for any story about "${plan.query}", and every story is already in the pool; nothing written today`);
    }
  }

  // ─── News: kid news sites, then science news sites, then the open web ─────
  // Candidates are tried in order until one page passes the content filter.

  const newsPlans = plans.filter(p => p.type === "news");
  for (const plan of newsPlans) {
    console.log(`  🔎 News: "${plan.searchQuery}"${plan.domains ? ` on ${plan.domains.length} sites` : " (open web)"}`);
    const results = await webSearch(plan.searchQuery, { domains: plan.domains, maxAgeDays: plan.maxAgeDays });
    if (results.length === 0) { console.log(`     ⚠️ No results`); continue; }
    const hit = await firstGoodResult(plan, results, 5);
    if (hit) {
      console.log(`     ✅ Fetched: ${hit.url.substring(0, 70)}`);
      sourced.push({ query: plan.query, type: "news", sourceUrl: hit.url, sourceText: hit.text });
      break;
    }
  }

  const newsCount = sourced.filter(s => s.type === "news").length;
  if (searchHealth.failed > 0 && searchHealth.ok === 0) {
    console.error(`  ❌ All ${searchHealth.failed} web searches failed. Check that web search is enabled for the Anthropic org.`);
  } else if (newsPlans.length > 0 && newsCount === 0) {
    console.error(`  ❌ No news article today: no suitable page among ${newsPlans.length} news searches.`);
  }
  const fromGrok = sourced.filter(s => s.sourceUrl?.includes("grokipedia.com")).length;
  const unsourced = sourced.filter(s => s.sourceUrl === null).length;
  console.log(`\n  ✅ ${sourced.length} ready for writing (${sourced.length - fromGrok - newsCount - unsourced} story sites and web, ${fromGrok} grokipedia, ${newsCount} news, ${unsourced} from knowledge)`);
  return sourced;
}

// ─── Step 6: Serve Articles to Students ─────────────────────────────────────

/**
 * Fills each student's buffer from the cache, ranked by their interests. Stories written today
 * for the student's own interests (planDailyArticles) go to that student first, and even when
 * the buffer is full: the point of writing them was that this student reads them this morning,
 * not after the older articles in the queue.
 */
async function serveToStudents(students: Student[], studentInterests: Map<number, string[]>, today: string): Promise<number> {
  console.log("\n📬 Serving articles to students...\n");
  let served = 0;

  for (const student of students) {
    checkTime("serve");
    const [unreadResult] = await sql`SELECT COUNT(*) as c FROM articles WHERE student_id = ${student.id} AND read = false`;
    const unreadCount = parseInt(unreadResult.c as string);
    const needed = Math.max(0, BUFFER_TARGET - unreadCount);

    // Stories written for this student's interests in the last OWN_STORIES_DAYS days, at their
    // level, not yet served to them (a story the student's full buffer kept out yesterday still
    // reaches them). The base article's topic is recorded in generated_topics with the interest
    // it was written for as the query (writeArticle, writeInterestArticle); the plan lowercases
    // interests the same way as studentInterests here, so the match is exact
    const interests = (studentInterests.get(student.id) || []).map(i => i.toLowerCase().trim()).filter(Boolean);
    // In the order they were written (the plan writes each student's longest-waiting interest
    // first), so with more than OWN_STORIES_MAX the earliest keep their slots and a re-run is
    // deterministic
    const ownRows = interests.length === 0 ? [] : await sql`
      SELECT ac.* FROM article_cache ac
      JOIN article_cache base ON base.id = COALESCE(ac.base_article_id, ac.id)
      WHERE ac.reading_level = ${student.reading_level} AND ac.flagged = false
        AND base.generated_date > ${today}::date - ${OWN_STORIES_DAYS}::int -- today and the 6 days before
        AND EXISTS (SELECT 1 FROM generated_topics gt
          WHERE gt.topic = base.topic AND gt.generated_date = base.generated_date AND gt.category <> 'news'
            AND LOWER(TRIM(gt.query)) = ANY(${interests}::text[]))
        AND NOT EXISTS (SELECT 1 FROM student_article_history h WHERE h.student_id = ${student.id} AND h.article_title = ac.title)
        AND NOT EXISTS (SELECT 1 FROM student_article_history h JOIN article_cache hc ON hc.id = h.article_cache_id
          WHERE h.student_id = ${student.id} AND COALESCE(hc.base_article_id, hc.id) = base.id)
      ORDER BY base.id ASC, ac.id ASC
    `;
    const ownIds = new Set(ownRows.map((r: any) => r.id as number));

    if (needed === 0 && ownIds.size === 0) { console.log(`  ${student.name}: buffer full`); continue; }

    // Get seen titles
    const history = await sql`SELECT article_title FROM student_article_history WHERE student_id = ${student.id}`;
    const seen = new Set(history.map((h: any) => h.article_title));
    const current = await sql`SELECT title FROM articles WHERE student_id = ${student.id} AND read = false`;
    current.forEach((c: any) => seen.add(c.title));

    // Get available articles from cache at student's level
    const available = await sql`
      SELECT * FROM article_cache ac WHERE reading_level = ${student.reading_level} AND flagged = false
        AND NOT EXISTS (SELECT 1 FROM student_article_history h WHERE h.student_id = ${student.id} AND h.article_title = ac.title)
        -- the same article at another level (adapted titles can differ) counts as seen
        AND NOT EXISTS (SELECT 1 FROM student_article_history h JOIN article_cache hc ON hc.id = h.article_cache_id
          WHERE h.student_id = ${student.id} AND COALESCE(hc.base_article_id, hc.id) = COALESCE(ac.base_article_id, ac.id))
      ORDER BY created_at DESC LIMIT 50
    `;
    // The own stories are candidates whether or not the newest-50 query reached them
    const unseen = [...ownRows, ...available.filter((a: any) => !ownIds.has(a.id))].filter((a: any) => !seen.has(a.title));
    // Rank the newest unseen articles by the student's interests, exploring every third slot
    const [affinities, cacheTopics] = await Promise.all([
      getAffinities(student.id).catch(e => { console.error(`  ⚠️ Affinities unavailable for ${student.name}, serving unranked:`, e); return []; }),
      topicsForCache(unseen.map((a: any) => a.id as number)).catch(e => { console.error("  ⚠️ Article topics unavailable, serving unranked:", e); return new Map<number, string[]>(); }),
    ]);
    // Topics served in the last few days come last; articles that read like one the student
    // already has (same story under a new title) are skipped
    const [recent, recentReads] = await Promise.all([
      recentTopics(student.id).catch(e => { console.error(`  ⚠️ Recent topics unavailable for ${student.name}:`, e); return new Set<string>(); }),
      recentArticles(student.id).catch(e => { console.error(`  ⚠️ Recent articles unavailable for ${student.name}:`, e); return [] as ArticleGist[]; }),
    ]);
    const candidates = unseen.map((a: any) => ({ id: a.id as number, topics: cacheTopics.get(a.id) ?? [], row: a }));
    const affinityMap = new Map(affinities.map(a => [a.topicSlug, a]));
    const scoring = await feedScoring(student.id, candidates, affinityMap);
    const repeatClient = tracked(anthropic, "serve_repeats", student.id);
    const budget = checkBudget(20_000);
    // Own stories first, then the ranked fill up to the buffer target (serve-picks.ts). `unseen`
    // starts with ownRows in the query's order, and candidates keeps it, so own is in write order
    const own = candidates.filter(c => ownIds.has(c.id));
    if (own.length > OWN_STORIES_MAX) console.log(`  ${student.name}: ${own.length} stories for their interests today, ${OWN_STORIES_MAX} guaranteed; the rest compete in the ranking`);
    const picked = await pickWithoutRepeats(
      excluded => pickServing({
        own, candidates, needed, max: OWN_STORIES_MAX, excluded,
        fill: (rest, n) => pickForFeed(rest, scoring, n, { avoid: new Set(recent) }),
      }),
      async (unchecked, approved) => {
        const gist = (c: (typeof candidates)[number]) => ({ id: c.id, title: c.row.title as string, excerpt: excerpt(c.row.body_text) });
        return findRepeats(repeatClient, unchecked.map(gist), [...recentReads, ...approved.map(gist)], { budget });
      },
    );
    // Inserted in this order; created_at is the serve time, and the feed shows today's articles
    // oldest first (src/lib/feed-order.ts), so the own stories lead
    const ownPicked = picked.filter(c => ownIds.has(c.id));
    const toServe = picked.map(c => c.row);

    // Level probe: some of the picks go out as the same story at the probe level (1 in 3 in phase
    // 1, 2 in 3 in phase 2, as on the on-demand route), so the probe gets scores and can finish.
    // A pick with no version at the probe level stays at the student's level
    const probeLevel = probeLevelOf(student.reading_level, student.feed_mix);
    const probeWanted = probeLevel ? probeServeCount(toServe.length, student.feed_mix) : 0;
    let probeServed = 0;
    for (const i of probeSlotOrder(picked.map(c => ownIds.has(c.id)))) {
      if (probeServed >= probeWanted) break;
      const a = toServe[i];
      const [atProbe] = await sql`
        SELECT * FROM article_cache WHERE reading_level = ${probeLevel} AND flagged = false
          AND COALESCE(base_article_id, id) = ${a.base_article_id ?? a.id}
        LIMIT 1
      `;
      if (atProbe && !seen.has(atProbe.title)) { toServe[i] = atProbe; probeServed++; }
    }
    if (probeWanted > 0) console.log(`  ${student.name}: probing L${probeLevel}, ${probeServed} of ${probeWanted} probe articles found`);

    for (const a of toServe) {
      const servedAs = a.reading_level !== student.reading_level ? a.reading_level : null;
      await sql`INSERT INTO articles (student_id, title, topic, body_text, reading_level, sources, estimated_read_time, category, source_cache_id, served_as_level)
        VALUES (${student.id}, ${a.title}, ${a.topic}, ${a.body_text}, ${a.reading_level}, ${JSON.stringify(a.sources || [])}, ${a.estimated_read_time}, ${a.category}, ${a.id}, ${servedAs})`;
      await sql`INSERT INTO student_article_history (student_id, article_cache_id, article_title)
        VALUES (${student.id}, ${a.id}, ${a.title})`;
    }

    served += toServe.length;
    console.log(`  ${student.name} (L${student.reading_level}): served ${toServe.length} (${ownPicked.length} written for their interests, buffer wanted ${needed})`);
  }
  return served;
}

// ─── Step 7: Flag Expired Articles ──────────────────────────────────────────

async function flagExpiredArticles() {
  console.log("\n🧹 Flagging expired articles...");
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const expiredNews = await sql`UPDATE article_cache SET flagged = true WHERE category = 'news' AND generated_date < ${sevenDaysAgo} AND flagged = false RETURNING id`;
  const expiredOther = await sql`UPDATE article_cache SET flagged = true WHERE category != 'news' AND generated_date < ${thirtyDaysAgo} AND flagged = false RETURNING id`;
  if (expiredNews.length + expiredOther.length > 0) {
    console.log(`  🚩 Flagged ${expiredNews.length} expired news + ${expiredOther.length} expired other articles`);
  } else {
    console.log("  No newly expired articles.");
  }
}

// ─── Step 5b: Backfill Missing Level Adaptations ───────────────────────────

async function backfillAdaptations(levelsNeeded: Set<number>): Promise<number> {
  console.log("\n🔧 Checking for incomplete level coverage...\n");
  const allBases = await sql`
    SELECT ac.id, ac.topic, ac.title, ac.body_text, ac.sources, ac.category, ac.generated_date,
      (SELECT array_agg(DISTINCT reading_level ORDER BY reading_level) FROM article_cache WHERE base_article_id = ac.id OR id = ac.id) as levels
    FROM article_cache ac WHERE base_article_id IS NULL AND flagged = false AND generated_date >= CURRENT_DATE - INTERVAL '7 days'
  `;
  const allLevelsArr = [...levelsNeeded];
  let backfilled = 0;
  const tasks = allBases.flatMap(base =>
    allLevelsArr.filter(l => l !== BASE_LEVEL && !base.levels.includes(l)).map(level => ({ base, level }))
  );
  await runPool(tasks, ADAPT_CONCURRENCY, async ({ base, level }) => {
    checkTime("backfill");
    console.log(`  🔧 Backfilling ${base.topic} → L${level}`);
    const adapted = await adaptArticleToLevel(base.title, base.body_text, level);
    if (adapted) {
      await sql`INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, base_article_id, generated_date, measured_level, level_model_version, level_reliable)
        VALUES (${adapted.title}, ${base.topic}, ${adapted.bodyText}, ${level}, ${JSON.stringify(base.sources || [])}, ${adapted.estimatedReadTime}, ${base.category}, ${base.id}, ${base.generated_date}, ${adapted.level.measuredLevel}, ${adapted.level.levelModelVersion}, ${adapted.level.levelReliable})`;
      backfilled++;
    }
  });
  if (backfilled > 0) console.log(`  ✅ Backfilled ${backfilled} missing adaptations`);
  return backfilled;
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function runMorningBatch(opts: BatchOptions = {}): Promise<BatchResult> {
  deadline = opts.deadline ?? Infinity;
  const result: BatchResult = { status: "complete", baseArticles: 0, adaptations: 0, served: 0 };
  try {
    await runSteps(result);
  } catch (e) {
    if (!(e instanceof OutOfTime)) throw e;
    console.log(`\n⏱️  Out of time during ${e.message}; the next call resumes from here.\n`);
    result.status = "partial";
  } finally {
    // The bulk-read interests are for this run only
    clearPrefetched();
  }
  return result;
}

async function runSteps(result: BatchResult) {
  const today = new Date().toISOString().split("T")[0];
  console.log(`\n🌅 Morning Article Batch — ${today} (source-first pipeline)\n`);

  // Step 1: Analyze students
  const { students, levelsNeeded, interestMap, studentInterests, recentTopics } = await analyzeStudents();
  const topInterests = [...interestMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([interest]) => interest);

  console.log(`📚 ${students.length} active students`);
  console.log(`📊 Reading levels needed: ${[...levelsNeeded].sort().join(", ")}`);
  console.log(`🎯 Top interests: ${topInterests.join(", ")}`);

  if (students.length === 0) { console.log("No active students. Skipping."); return; }

  // Always flag expired articles first — before threshold checks or serving
  await flagExpiredArticles();

  // Interest graph upkeep: tag older articles and turn pre-graph likes, favorites and
  // profile interests into signals. Exact matches only, and idempotent, so it's cheap to repeat.
  await quietly((async () => {
    const tagged = await tagUntaggedCache();
    const signals = await backfillSignals();
    if (tagged || signals) console.log(`🧭 Interest graph: tagged ${tagged} articles, backfilled ${signals} signals`);
    await syncToCompass(students.map(s => s.id as number));
  })(), "batch upkeep");

  // Step 2: Plan daily mix
  const plans = await planDailyArticles(interestMap, students, recentTopics, studentInterests);

  // The plan already leaves out what an earlier run today wrote (interests in today's rotation,
  // the horizon article); the news plans are alternatives for one article, kept only while
  // there is no news article today. There is no cap on the count: a specific story for each
  // student's own interests is the product, and a smaller shared set of broad articles is what
  // lost students in Nov 2026.
  const [newsToday] = await sql`
    SELECT 1 FROM article_cache
    WHERE generated_date = ${today} AND base_article_id IS NULL AND flagged = false AND category = 'news'
    LIMIT 1
  `;
  const topicPlans = plans.filter(p => p.type !== "news");
  const newsPlans = newsToday ? [] : plans.filter(p => p.type === "news");

  if (topicPlans.length === 0 && newsPlans.length === 0) {
    console.log(`✅ Today's articles were all written earlier. Skipping generation.`);
    result.adaptations += await backfillAdaptations(levelsNeeded);
    await quietly(measureUnmeasured(), "reading levels");
    result.served += await serveToStudents(students, studentInterests, today);
    console.log(`\n✅ Batch complete (served existing articles)\n`);
    return;
  }
  console.log(`📋 To write: ${topicPlans.length} stories${newsPlans.length > 0 ? " and the news" : " (news written earlier today)"}`);

  const blockedTopics = await sql`SELECT topic FROM blocked_topics`;
  const blockedSet = new Set(blockedTopics.map(b => (b.topic as string).toLowerCase()));

  // Steps 3 to 5: source, write and adapt, one plan at a time, so a run that hits its time
  // limit keeps every article it finished (at every level) and the next tick's plan starts after
  // them. The news plans go together (sourcing stops at the first good page) and first, so the
  // day has its news. The last stretch of the budget is kept for adapting leftovers and serving,
  // so students get articles every run even while a long plan is still being written.
  let written = 0;
  const groups: ArticlePlan[][] = [...(newsPlans.length > 0 ? [newsPlans] : []), ...topicPlans.map(p => [p])];
  const total = groups.length;

  async function adaptToLevels(base: { id: number; title: string; topic: string; bodyText: string; sources: string[]; category: string }) {
    const tasks = [...levelsNeeded].filter(level => level !== BASE_LEVEL).map(level => ({ base, level }));
    await runPool(tasks, ADAPT_CONCURRENCY, async ({ base, level }) => {
      checkTime("adapt");
      const adapted = await adaptArticleToLevel(base.title, base.bodyText, level);
      if (adapted) {
        await sql`
          INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, base_article_id, generated_date, measured_level, level_model_version, level_reliable)
          VALUES (${adapted.title}, ${base.topic}, ${adapted.bodyText}, ${level}, ${JSON.stringify(base.sources)}, ${adapted.estimatedReadTime}, ${base.category}, ${base.id}, ${today}, ${adapted.level.measuredLevel}, ${adapted.level.levelModelVersion}, ${adapted.level.levelReliable})
        `;
        result.adaptations++;
        console.log(`     📐 L${level}`);
      } else {
        console.log(`     ❌ L${level} adaptation failed (the backfill step retries)`);
      }
    });
  }

  /** Writes and adapts the article; true when one was stored */
  async function writeArticle(t: SourcedTopic): Promise<boolean> {
    console.log(`  ✍️  ${t.type}: ${t.query.substring(0, 50)}${t.angle ? ` ("${t.angle.angle}")` : ""}`);
    const article = await writeBaseArticle(t);
    if (!article) { console.log(`     ❌ Failed to write`); return false; }
    if (blockedSet.has(article.topic.toLowerCase())) { console.log(`     🚫 Blocked topic`); return false; }

    const [inserted] = await sql`
      INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, generated_date, headline_source, source_url, review_note, measured_level, level_model_version, level_reliable)
      VALUES (${article.title}, ${article.topic}, ${article.bodyText}, ${BASE_LEVEL}, ${JSON.stringify(article.sources)}, ${article.estimatedReadTime}, ${article.category}, ${today}, ${t.sourceUrl}, ${t.sourceUrl}, ${t.sourceUrl ? null : UNSOURCED_NOTE}, ${article.level.measuredLevel}, ${article.level.levelModelVersion}, ${article.level.levelReliable})
      RETURNING id
    `;
    result.baseArticles++;
    written++;
    console.log(`     ✅ "${article.title}" (${t.sourceUrl ? `source: ${t.sourceUrl.substring(0, 50)}...` : "from knowledge, marked for review"})`);
    // The interest the batch searched for is the article's main topic; the rewrite's own tag is a fallback
    await quietly(tagCacheArticle(inserted.id, t.type === "news" ? [article.topic] : [t.query, article.topic], { client: anthropic }), "article tagging");
    await writeNotesFor(inserted.id, article.title, article.bodyText);
    await sql`INSERT INTO generated_topics (topic, category, generated_date, query) VALUES (${article.topic}, ${article.category}, ${today}, ${t.query ?? null})`;
    await adaptToLevels({ id: inserted.id, title: article.title, topic: article.topic, bodyText: article.bodyText, sources: article.sources, category: article.category });
    return true;
  }

  /**
   * The interest is done for today, written or not: a resumed run skips it, and tomorrow's plan
   * rotates to the students' other interests first. Without this, an interest with no usable
   * page would be searched again on every run of the day.
   */
  async function rotate(interest: string) {
    await sql`
      INSERT INTO interest_rotation (interest, last_featured_at, student_ids, updated_at)
      VALUES (${interest}, CURRENT_DATE, ${interestMap.get(interest) || []}, NOW())
      ON CONFLICT (interest) DO UPDATE SET
        last_featured_at = EXCLUDED.last_featured_at,
        student_ids = EXCLUDED.student_ids,
        updated_at = NOW()
    `;
  }

  for (let i = 0; i < groups.length; i++) {
    if (Date.now() > deadline - SERVE_RESERVE_MS) {
      console.log(`\n⏱️  Stopping before "${groups[i][0].query}" to leave time for adapting and serving; ${groups.length - i} plans wait for the next run.`);
      result.status = "partial";
      break;
    }
    const group = groups[i];
    console.log(`\n── [${i + 1}/${total}] ${group[0].type === "news" ? "news" : `${group[0].type}: ${group[0].query}`} ──`);
    const sourcedTopics = await sourceContent(group, recentTopics);
    let stored = false;
    for (const t of sourcedTopics) {
      checkTime("rewrite");
      if (await writeArticle(t)) stored = true;
    }
    if (group[0].type === "interest") {
      if (!stored) console.log(`     ↻ Nothing written for "${group[0].query}" today; rotating to other interests`);
      await rotate(group[0].query.toLowerCase());
    }
  }

  console.log(`\n📝 Generated ${written} base articles`);

  // Step 5b: Backfill any base articles missing level adaptations
  // (also finishes adaptations a previous, timed-out call didn't get to)
  result.adaptations += await backfillAdaptations(levelsNeeded);

  // Articles written while Compass's reading-level measure wasn't answering get their level now
  await quietly(measureUnmeasured(), "reading levels");

  // Step 6: Serve to students
  result.served += await serveToStudents(students, studentInterests, today);

  console.log(`\n✅ Batch ${result.status}: ${written} base articles × ${levelsNeeded.size} levels this run\n`);
}


// ─── One interest article on demand (new students' first articles) ───────────

/**
 * Writes one article about `interest` the same way the batch does: story angles, source,
 * rewrite at the base level, tag, then adapt to `level`. Both versions go into the shared cache,
 * so later students can be served them too. Returns the cache id at `level`, or null if no
 * source was found or a step failed.
 *
 * When the pool already has an article on the same subject (another student's interest, or
 * another of this student's interests landing on the same page), that article is returned at
 * `level` instead of writing a near-duplicate; the caller serves it unless the student has seen it.
 */
export async function writeInterestArticle(interest: string, level: number): Promise<number | null> {
  const today = new Date().toISOString().split("T")[0];
  let duplicateOf: number | null = null;
  const claimed: string[] = [];
  try {
    const [sourced] = await sourceContent([{ query: interest, type: "interest", searchQuery: interest }], new Set(), {
      claimed,
      onDuplicate: (_, id) => { duplicateOf ??= id; },
    });
    if (!sourced) {
      if (duplicateOf === null) return null;
      console.log(`  ♻️ "${interest}": sharing existing article ${duplicateOf} instead of writing a duplicate`);
      return await atLevel(duplicateOf, level);
    }

    const article = await writeBaseArticle(sourced);
    if (!article?.bodyText) return null;
    const blocked = await sql`SELECT 1 FROM blocked_topics WHERE LOWER(topic) = ${article.topic.toLowerCase()} LIMIT 1`;
    if (blocked.length > 0) return null;

    const [base] = await sql`
      INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, generated_date, headline_source, source_url, review_note, measured_level, level_model_version, level_reliable)
      VALUES (${article.title}, ${article.topic}, ${article.bodyText}, ${BASE_LEVEL}, ${JSON.stringify(article.sources)}, ${article.estimatedReadTime}, ${article.category}, ${today}, ${sourced.sourceUrl}, ${sourced.sourceUrl}, ${sourced.sourceUrl ? null : UNSOURCED_NOTE}, ${article.level.measuredLevel}, ${article.level.levelModelVersion}, ${article.level.levelReliable})
      RETURNING id
    `;
    await quietly(tagCacheArticle(base.id, [interest, article.topic], { client: anthropic }), "article tagging");
    await writeNotesFor(base.id, article.title, article.bodyText);
    await sql`INSERT INTO generated_topics (topic, category, generated_date, query) VALUES (${article.topic}, ${article.category}, ${today}, ${interest})`;
    // Tomorrow's batch rotates to the student's other interests first
    await sql`
      INSERT INTO interest_rotation (interest, last_featured_at, student_ids, updated_at)
      VALUES (${interest.toLowerCase()}, CURRENT_DATE, NULL, NOW())
      ON CONFLICT (interest) DO UPDATE SET last_featured_at = EXCLUDED.last_featured_at, updated_at = NOW()
    `;
    return await atLevel(base.id as number, level);
  } finally {
    for (const url of claimed) urlsInFlight.delete(url);
  }
}

/** The pool's version of base article `baseId` at `level`, adapting and storing it if missing */
async function atLevel(baseId: number, level: number): Promise<number | null> {
  const [hit] = await sql`
    SELECT id FROM article_cache
    WHERE (id = ${baseId} OR base_article_id = ${baseId}) AND reading_level = ${level} AND flagged = false
    LIMIT 1
  `;
  if (hit) return hit.id as number;
  const [base] = await sql`SELECT * FROM article_cache WHERE id = ${baseId} AND flagged = false`;
  if (!base) return null;
  const adapted = await adaptArticleToLevel(base.title, base.body_text, level);
  if (!adapted?.bodyText) return null;
  const [row] = await sql`
    INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, base_article_id, generated_date, measured_level, level_model_version, level_reliable)
    VALUES (${adapted.title}, ${base.topic}, ${adapted.bodyText}, ${level}, ${JSON.stringify(base.sources || [])}, ${adapted.estimatedReadTime}, ${base.category}, ${baseId}, ${base.generated_date}, ${adapted.level.measuredLevel}, ${adapted.level.levelModelVersion}, ${adapted.level.levelReliable})
    RETURNING id
  `;
  return row.id as number;
}
