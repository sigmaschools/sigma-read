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
 * 3. Source content: web search → fetch → content filter → pick best source
 * 4. Rewrite: Claude Sonnet rewrites source content at L4
 * 5. Adapt each article to all needed reading levels using Sonnet
 * 6. Fill each student's buffer to 5 unread articles
 * 7. Flag expired articles
 *
 * Every article is grounded in a real web source (source_url in article_cache).
 * Shared pool — one base article serves all students at a given level.
 * Students never see the same article twice (tracked via student_article_history).
 */

import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { normalizeInterestProfile } from "../normalize-interests";
import { tracked } from "../ai-usage";
import { backfillSignals, batchInterestsFor, clearPrefetched, feedScoring, getAffinities, horizonTopicsFor, prefetchInterests, quietly, tagCacheArticle, tagUntaggedCache, topicsForCache } from "../interest-graph";
import { pickForFeed } from "../interest-graph/serving";
import { isIndexPage, isOlderThan } from "./search-filters";
import { parseSourcePick, type SearchResult } from "./source-pick";
import { MODELS, requestSettings } from "../models";
import { BASE_LEVEL, rewriteFromSource as writeBase, adaptArticleToLevel as writeAdaptation, type SourcedTopic } from "./article-writer";
import { findDuplicate, type ExistingArticle } from "./dedup";
import { checkBudget, excerpt, findRepeats, pickWithoutRepeats, type ArticleGist } from "../repeats";
import { recentArticles, recentTopics } from "../recent-reading";
import { interestCap, pickInterests } from "./plan-interests";
import { EXPLAINER_DOMAINS, KID_NEWS_DOMAINS, NEWS_DOMAINS, NEWS_TOPICS, isGrokipediaPagePath, plansToRun, sourceOrder } from "./sources";

const DATABASE_URL = process.env.DATABASE_URL!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const BUFFER_TARGET = 10; // 2-day buffer in case batch fails
/** How far back the duplicate check looks for articles on the same subject */
const DEDUP_DAYS = 60;

const sql = neon(DATABASE_URL);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
/** Model and settings for the small steps: picking, filtering, searching, suggesting topics */
const LIGHT = { model: MODELS.light, ...requestSettings(MODELS.light, "light") };

const rewriteFromSource = (topic: SourcedTopic) => writeBase(tracked(anthropic, "batch_rewrite"), topic);
const adaptArticleToLevel = (title: string, body: string, level: number) =>
  writeAdaptation(tracked(anthropic, "batch_adapt"), title, body, level);
const ADAPT_CONCURRENCY = 3;

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
    SELECT id, name, reading_level, interest_profile, adjacent_interests, daily_article_cap
    FROM students WHERE onboarding_complete = true AND reading_level IS NOT NULL
  ` as Student[];

  const levelsNeeded = new Set(students.map(s => s.reading_level));

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

  // Target: ~10 base articles for the pool
  // 60% interest (3), 20% news (1), 20% horizon (1) — 5 articles/day
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

  // Per student: their top-3 least-recently-used interests. Articles are shared, so the day's
  // picks cover as many students as possible with as few articles as possible (plan-interests.ts).
  const wants = students.map(student => {
    const interests = studentInterests.get(student.id) || [];
    // Sort by last_featured_at ascending (NULL = never = highest priority)
    return [...interests].sort((a, b) => {
      const aDate = lastFeaturedMap.get(a);
      const bDate = lastFeaturedMap.get(b);
      const aTime = aDate ? aDate.getTime() : 0;
      const bTime = bDate ? bDate.getTime() : 0;
      return aTime - bTime;
    }).slice(0, 3);
  });
  const pickedInterests = new Set(pickInterests(wants, interestCap(students.length)));
  console.log(`  🎯 Selected interests (${pickedInterests.size} for ${students.length} students, shared): ${[...pickedInterests].join(', ')}`);

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
        ...LIGHT,
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
 * topic itself, best first, and names the general page on the topic when the search missed it
 * (tried first; a page that doesn't exist just fails to fetch). If the check fails or its reply
 * can't be read, the results are kept as they were.
 */
async function onTopicResults(query: string, results: SearchResult[]): Promise<SearchResult[]> {
  const candidates = results.slice(0, 12);
  try {
    const response = await tracked(anthropic, "batch_source_pick").messages.create({
      ...LIGHT,
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `A student aged 8-14 wants to read about: "${query}"

Encyclopedia pages found:
${candidates.map((r, i) => `${i + 1}. ${r.title}`).join("\n") || "(none)"}

Which pages are about "${query}" itself, as the student most likely means it? Leave out:
- pages about something that only shares the name (a book, film, album, song, TV channel, company, team or person), unless that is clearly what "${query}" names
- pages about a narrow corner of the topic (one event, one niche, or one group of people), when "${query}" is broad
Best first.

If "${query}" is a broad word (not the name of one thing, like a game, company, team or person) and none of the listed pages is the main encyclopedia page on it, also give that page's usual title, e.g. "Video game" for "games" or "Animal" for "animals".

Reply with only JSON, e.g. {"pages": [3, 1]} or {"pages": [], "general": "Video game"}.`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const picked = parseSourcePick(text, candidates, query);
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

async function filterSources<T extends { url: string; text: string }>(
  sources: T[]
): Promise<T[]> {
  if (sources.length === 0) return [];

  // Batch filter with Haiku for cost efficiency
  const summaries = sources.map((s, i) =>
    `[${i}] ${s.url}\n${s.text.substring(0, 500)}`
  ).join("\n\n");

  try {
    const response = await tracked(anthropic, "batch_filter").messages.create({
      ...LIGHT,
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `You are a content filter for a children's reading app (ages 8-14).

Review these article summaries. REJECT any that:
1. PRIMARILY discuss: ${CONTENT_BLOCKLIST}
2. Are NOT actual articles — reject homepages, marketing/promotional copy, product pages, "about us" pages, app descriptions, podcast landing pages, or any page that is selling/promoting a service rather than reporting information

IMPORTANT — do NOT reject articles about:
- Video games, strategy games, or esports (even if they involve in-game combat)
- Sports and recreational activities (including airsoft, paintball, martial arts, archery)
- Severe weather, natural disasters, or climate events
- History topics that mention past conflicts in an educational context
- Firefighting, emergency services, or rescue operations

KEEP real articles with factual, informative content. Only reject when the PRIMARY focus is on the blocklist topics above.

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
    console.log("  ⚠️ Content filter failed, keeping all sources");
  }
  return sources;
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

  /** Content filter for pages from the open web and the curated sites (Grokipedia pages skip it) */
  async function suitable(url: string, text: string): Promise<boolean> {
    const kept = await filterSources([{ url, text }]);
    if (kept.length === 0) console.log(`     🚫 Not suitable for students: ${url.substring(0, 60)}`);
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

  /** A Grokipedia page for the plan, or null */
  async function fromGrokipedia(plan: ArticlePlan): Promise<{ url: string; text: string } | null> {
    console.log(`  📖 Grokipedia: "${plan.query}" (${plan.type})`);
    const results = await onTopicResults(plan.query, await grokipediaSearch(plan.query));
    if (results.length === 0) { console.log(`     ⚠️ No on-topic Grokipedia results`); return null; }

    // Pick a result not recently used for angle variety
    for (const result of results.slice(0, 8)) {
      if (usedUrls.has(result.url) || urlsInFlight.has(result.url) || recentTopics.has(result.title.toLowerCase())) continue;
      const text = await fetchGrokipediaArticle(result.url);
      if (text && await accept(plan, result.title, result.url, text)) {
        console.log(`     ✅ ${result.title} (${result.url.substring(0, 55)}...)`);
        return { url: result.url, text };
      }
    }

    // If all recent-filtered results failed, try the first result only if URL not already used
    const fallback = results[0];
    if (usedUrls.has(fallback.url) || urlsInFlight.has(fallback.url)) {
      console.log(`     ⚠️ Skipping fallback — URL already used: ${fallback.url.substring(0, 55)}...`);
      return null;
    }
    const text = await fetchGrokipediaArticle(fallback.url);
    if (!text) { console.log(`     ⚠️ Could not fetch any Grokipedia article`); return null; }
    if (await accept(plan, fallback.title, fallback.url, text)) {
      console.log(`     ✅ ${fallback.title} (${fallback.url.substring(0, 55)}...)`);
      return { url: fallback.url, text };
    }
    return null;
  }

  /** A page from the kids' science, nature and history sites, or null */
  async function fromExplainers(plan: ArticlePlan): Promise<{ url: string; text: string } | null> {
    console.log(`  🔎 Explainer sites: "${plan.query}" (${plan.type})`);
    // Same on-topic check as Grokipedia ("soccer" on NASA's site is not a soccer article); a
    // general Grokipedia page it names is left for the Grokipedia step
    const found = await webSearch(plan.query, { domains: EXPLAINER_DOMAINS });
    const results = (await onTopicResults(plan.query, found))
      .filter(r => !r.url.includes("grokipedia.com") && !recentTopics.has(r.title.toLowerCase()));
    const hit = await firstGoodResult(plan, results, 4);
    if (hit) console.log(`     ✅ ${hit.url.substring(0, 70)}`);
    else console.log(`     ⚠️ Nothing usable on the explainer sites`);
    return hit;
  }

  // ─── Interest & Horizon: explainer sites and Grokipedia, alternating ──────

  const topicPlans = plans.filter(p => p.type === "interest" || p.type === "horizon");
  const firstSource = Math.floor(Math.random() * 2); // so the horizon slot doesn't always get the same source
  for (let i = 0; i < topicPlans.length; i++) {
    const plan = topicPlans[i];
    let hit: { url: string; text: string } | null = null;
    for (const kind of sourceOrder(i + firstSource)) {
      hit = kind === "grokipedia" ? await fromGrokipedia(plan) : await fromExplainers(plan);
      if (hit) break;
    }

    // Nothing from either: open web search
    if (!hit) {
      console.log(`     ⚠️ Trying open web search...`);
      hit = await firstGoodResult(plan, await webSearch(`${plan.query} article`), 3);
      if (hit) console.log(`     ✅ Web search fallback: ${hit.url.substring(0, 60)}...`);
    }
    if (hit) sourced.push({ query: plan.query, type: plan.type, sourceUrl: hit.url, sourceText: hit.text });
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
  const fromGrok = sourced.filter(s => s.sourceUrl.includes("grokipedia.com")).length;
  console.log(`\n  ✅ ${sourced.length} sources ready for rewriting (${fromGrok} grokipedia, ${sourced.length - fromGrok - newsCount} other sites, ${newsCount} news)`);
  return sourced;
}

// ─── Step 6: Serve Articles to Students ─────────────────────────────────────

async function serveToStudents(students: Student[]): Promise<number> {
  console.log("\n📬 Serving articles to students...\n");
  let served = 0;

  for (const student of students) {
    checkTime("serve");
    const [unreadResult] = await sql`SELECT COUNT(*) as c FROM articles WHERE student_id = ${student.id} AND read = false`;
    const unreadCount = parseInt(unreadResult.c as string);
    const needed = Math.max(0, BUFFER_TARGET - unreadCount);

    if (needed === 0) { console.log(`  ${student.name}: buffer full`); continue; }

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
    const unseen = available.filter((a: any) => !seen.has(a.title));
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
    const picked = await pickWithoutRepeats(
      excluded => pickForFeed(candidates.filter(c => !excluded.has(c.id)), scoring, needed, { avoid: new Set(recent) }),
      async (unchecked, approved) => {
        const gist = (c: (typeof candidates)[number]) => ({ id: c.id, title: c.row.title as string, excerpt: excerpt(c.row.body_text) });
        return findRepeats(repeatClient, unchecked.map(gist), [...recentReads, ...approved.map(gist)], { budget });
      },
    );
    const toServe = picked.map(c => c.row);

    for (const a of toServe) {
      await sql`INSERT INTO articles (student_id, title, topic, body_text, reading_level, sources, estimated_read_time, category, source_cache_id)
        VALUES (${student.id}, ${a.title}, ${a.topic}, ${a.body_text}, ${a.reading_level}, ${JSON.stringify(a.sources || [])}, ${a.estimated_read_time}, ${a.category}, ${a.id})`;
      await sql`INSERT INTO student_article_history (student_id, article_cache_id, article_title)
        VALUES (${student.id}, ${a.id}, ${a.title})`;
    }

    served += toServe.length;
    console.log(`  ${student.name} (L${student.reading_level}): served ${toServe.length}/${needed}`);
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
      await sql`INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, base_article_id, generated_date)
        VALUES (${adapted.title}, ${base.topic}, ${adapted.bodyText}, ${level}, ${JSON.stringify(base.sources || [])}, ${adapted.estimatedReadTime}, ${base.category}, ${base.id}, ${base.generated_date})`;
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
  })(), "batch upkeep");

  // Check if we already have base articles from a partial run today
  // Interest articles (3 for one student, more as students are added) + 1 news + 1 horizon
  const TARGET_BASE_ARTICLES = interestCap(students.length) + 2;
  const [existingToday] = await sql`
    SELECT COUNT(*) as c FROM article_cache
    WHERE generated_date = ${today} AND base_article_id IS NULL AND flagged = false
  `;
  const existingBaseCount = parseInt(existingToday.c as string);

  if (existingBaseCount >= TARGET_BASE_ARTICLES) {
    console.log(`✅ Already have ${existingBaseCount} base articles for today. Skipping generation.`);
    result.adaptations += await backfillAdaptations(levelsNeeded);
    result.served += await serveToStudents(students);
    console.log(`\n✅ Batch complete (served existing articles)\n`);
    return;
  }

  const articlesNeeded = TARGET_BASE_ARTICLES - existingBaseCount;
  if (existingBaseCount > 0) {
    console.log(`📋 Found ${existingBaseCount} base articles from earlier run. Generating ${articlesNeeded} more.`);
  }

  // Step 2: Plan daily mix
  const plans = await planDailyArticles(interestMap, students, recentTopics, studentInterests);

  // Limit to what we actually need, keeping the news slot unless an earlier run today wrote the news
  const [newsToday] = await sql`
    SELECT COUNT(*) as c FROM article_cache
    WHERE generated_date = ${today} AND base_article_id IS NULL AND flagged = false AND category = 'news'
  `;
  const plansToSource = plansToRun(plans, articlesNeeded, parseInt(newsToday.c as string) === 0);

  // Step 3: Source content from the web
  const sourcedTopics = await sourceContent(plansToSource, recentTopics);

  // Filter out blocked topics
  const blockedTopics = await sql`SELECT topic FROM blocked_topics`;
  const blockedSet = new Set(blockedTopics.map(b => (b.topic as string).toLowerCase()));

  console.log(`\n📝 Rewriting ${sourcedTopics.length} sourced articles...\n`);

  // Step 4: Rewrite from sources
  const baseArticles: { id: number; title: string; topic: string; bodyText: string; sources: string[]; category: string }[] = [];

  for (let i = 0; i < sourcedTopics.length; i++) {
    checkTime("rewrite");
    const t = sourcedTopics[i];
    console.log(`  ✍️  [${i + 1}/${sourcedTopics.length}] ${t.type}: ${t.query.substring(0, 50)}...`);

    const article = await rewriteFromSource(t);
    if (!article) { console.log(`     ❌ Failed to rewrite`); continue; }
    if (blockedSet.has(article.topic.toLowerCase())) { console.log(`     🚫 Blocked topic`); continue; }

    const [inserted] = await sql`
      INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, generated_date, headline_source, source_url)
      VALUES (${article.title}, ${article.topic}, ${article.bodyText}, ${BASE_LEVEL}, ${JSON.stringify(article.sources)}, ${article.estimatedReadTime}, ${article.category}, ${today}, ${t.sourceUrl}, ${t.sourceUrl})
      RETURNING id
    `;
    result.baseArticles++;
    // The interest the batch searched for is the article's main topic; the rewrite's own tag is a fallback
    await quietly(tagCacheArticle(inserted.id, t.type === "news" ? [article.topic] : [t.query, article.topic], { client: anthropic }), "article tagging");
    baseArticles.push({ id: inserted.id, title: article.title, topic: article.topic, bodyText: article.bodyText, sources: article.sources, category: article.category });
    await sql`INSERT INTO generated_topics (topic, category, generated_date, query) VALUES (${article.topic}, ${article.category}, ${today}, ${t.query ?? null})`;
    console.log(`     ✅ "${article.title}" (source: ${t.sourceUrl.substring(0, 50)}...)`);
  }

  console.log(`\n📝 Generated ${baseArticles.length} base articles from real sources`);

  // Step 5: Adapt to needed levels
  console.log("\n📐 Adapting to reading levels...\n");

  const adaptTasks = baseArticles.flatMap(base =>
    [...levelsNeeded].filter(level => level !== BASE_LEVEL).map(level => ({ base, level }))
  );
  await runPool(adaptTasks, ADAPT_CONCURRENCY, async ({ base, level }) => {
    checkTime("adapt");
    const adapted = await adaptArticleToLevel(base.title, base.bodyText, level);
    if (adapted) {
      await sql`
        INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, base_article_id, generated_date)
        VALUES (${adapted.title}, ${base.topic}, ${adapted.bodyText}, ${level}, ${JSON.stringify(base.sources)}, ${adapted.estimatedReadTime}, ${base.category}, ${base.id}, ${today})
      `;
      result.adaptations++;
      console.log(`  ✅ "${base.title.substring(0, 40)}..." → L${level}`);
    } else {
      console.log(`  ❌ "${base.title.substring(0, 40)}..." → L${level}`);
    }
  });

  // Step 5b: Backfill any base articles missing level adaptations
  // (also finishes adaptations a previous, timed-out call didn't get to)
  result.adaptations += await backfillAdaptations(levelsNeeded);

  // Step 5c: Update interest_rotation for every interest actually used in this batch
  const usedInterestQueries = sourcedTopics
    .filter(t => t.type === "interest")
    .map(t => t.query.toLowerCase());
  if (usedInterestQueries.length > 0) {
    console.log("\n🔄 Updating interest_rotation...");
    for (const interest of usedInterestQueries) {
      const studentIdsForInterest = interestMap.get(interest) || [];
      await sql`
        INSERT INTO interest_rotation (interest, last_featured_at, student_ids, updated_at)
        VALUES (${interest}, CURRENT_DATE, ${studentIdsForInterest}, NOW())
        ON CONFLICT (interest) DO UPDATE SET
          last_featured_at = EXCLUDED.last_featured_at,
          student_ids = EXCLUDED.student_ids,
          updated_at = NOW()
      `;
    }
    console.log(`  ✅ Updated ${usedInterestQueries.length} interests in rotation table`);
  }

  // Step 6: Serve to students
  result.served += await serveToStudents(students);

  console.log(`\n✅ Batch complete! ${baseArticles.length} source-backed articles × ${levelsNeeded.size} levels\n`);
}


// ─── One interest article on demand (new students' first articles) ───────────

/**
 * Writes one source-backed article about `interest` the same way the batch does: source,
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

    const article = await rewriteFromSource(sourced);
    if (!article?.bodyText) return null;
    const blocked = await sql`SELECT 1 FROM blocked_topics WHERE LOWER(topic) = ${article.topic.toLowerCase()} LIMIT 1`;
    if (blocked.length > 0) return null;

    const [base] = await sql`
      INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, generated_date, headline_source, source_url)
      VALUES (${article.title}, ${article.topic}, ${article.bodyText}, ${BASE_LEVEL}, ${JSON.stringify(article.sources)}, ${article.estimatedReadTime}, ${article.category}, ${today}, ${sourced.sourceUrl}, ${sourced.sourceUrl})
      RETURNING id
    `;
    await quietly(tagCacheArticle(base.id, [interest, article.topic], { client: anthropic }), "article tagging");
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
    INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, base_article_id, generated_date)
    VALUES (${adapted.title}, ${base.topic}, ${adapted.bodyText}, ${level}, ${JSON.stringify(base.sources || [])}, ${adapted.estimatedReadTime}, ${base.category}, ${baseId}, ${base.generated_date})
    RETURNING id
  `;
  return row.id as number;
}
