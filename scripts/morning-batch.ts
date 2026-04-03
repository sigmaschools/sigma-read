/**
 * Morning Article Batch Generation — Source-First Pipeline
 *
 * Runs daily at 5 AM CT via cron job.
 *
 * Process:
 * 1. Analyze active students: interests, reading levels, aggregate interest pool
 * 2. Plan daily mix: 60% interest / 20% news / 20% horizon per student
 * 3. Source content: Brave Search → fetch → content filter → pick best source
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
import { normalizeInterestProfile } from "../src/lib/normalize-interests";

const DATABASE_URL = process.env.DATABASE_URL!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY!;
const SONNET_MODEL = "claude-sonnet-4-5";
const HAIKU_MODEL = "claude-haiku-4-5";
const BUFFER_TARGET = 5;
const BASE_LEVEL = 4;

const sql = neon(DATABASE_URL);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

interface Student {
  id: number;
  name: string;
  reading_level: number;
  interest_profile: any;
  adjacent_interests: string[] | null;
  daily_article_cap: number;
}

interface SourcedTopic {
  query: string;
  type: "interest" | "news" | "horizon";
  sourceUrl: string;
  sourceText: string;
}

const levelGuide: Record<number, { lexile: string; grade: string; words: string; vocab: string }> = {
  1: { lexile: "~400-500", grade: "2-3", words: "100-200", vocab: "Use simple, common words. Short sentences (5-10 words). Define any topic word in the same sentence." },
  2: { lexile: "~550-650", grade: "3-4", words: "200-300", vocab: "Mostly common words. At most 1-2 topic-specific words per paragraph, explained in context." },
  3: { lexile: "~700-800", grade: "5-6", words: "300-400", vocab: "At most 2-3 challenging words per paragraph. Each one defined or contextually clear." },
  4: { lexile: "~850-950", grade: "7", words: "400-500", vocab: "Domain vocabulary with context clues. Avoid stacking multiple technical terms in one sentence." },
  5: { lexile: "~1000-1100", grade: "8", words: "400-600", vocab: "Domain-specific vocabulary supported by context. Complex sentence structures allowed." },
  6: { lexile: "~1150+", grade: "8+", words: "500-600", vocab: "Advanced vocabulary acceptable. Assume strong reader who can handle nuance and inference." },
};

// ─── Step 1: Analyze Students ───────────────────────────────────────────────

async function analyzeStudents(): Promise<{
  students: Student[];
  levelsNeeded: Set<number>;
  interestMap: Map<string, number[]>; // interest → [studentId, ...]
  recentTopics: Set<string>;
}> {
  const students = await sql`
    SELECT id, name, reading_level, interest_profile, adjacent_interests, daily_article_cap
    FROM students WHERE onboarding_complete = true AND reading_level IS NOT NULL
  ` as Student[];

  const levelsNeeded = new Set(students.map(s => s.reading_level));

  // Aggregate interests across students into weighted map
  const interestMap = new Map<string, number[]>();
  for (const s of students) {
    const profile = normalizeInterestProfile(s.interest_profile);
    for (const interest of profile.interests) {
      const lower = interest.toLowerCase().trim();
      const ids = interestMap.get(lower) || [];
      ids.push(s.id);
      interestMap.set(lower, ids);
    }
  }

  // Recent topics (last 14 days) for dedup
  const recent = await sql`SELECT topic FROM generated_topics WHERE generated_date > CURRENT_DATE - INTERVAL '14 days'`;
  const recentTopics = new Set(recent.map(r => (r.topic as string).toLowerCase()));

  return { students, levelsNeeded, interestMap, recentTopics };
}

// ─── Step 2: Plan Daily Articles ────────────────────────────────────────────

interface ArticlePlan {
  query: string;
  type: "interest" | "news" | "horizon";
  searchQuery: string;
}

async function planDailyArticles(
  interestMap: Map<string, number[]>,
  students: Student[],
  recentTopics: Set<string>,
): Promise<ArticlePlan[]> {
  console.log("📋 Planning daily article mix...");

  // Target: ~10 base articles for the pool
  // 60% interest (6), 20% news (2), 20% horizon (2)
  const plans: ArticlePlan[] = [];

  // --- News (2 articles) — two-tier sourcing ---
  // Tier 1: Kid-friendly news publishers (reliable age-appropriate sources)
  const kidPublishers = [
    "site:sciencenewsforstudents.org",
    "site:tweentribune.com",
    "site:dogonews.com",
    "site:youngzine.org",
    "site:timeforkids.com",
    "site:newsela.com",
  ];
  // Pick 3-4 random publishers per batch for variety
  const shuffledPublishers = kidPublishers.sort(() => Math.random() - 0.5).slice(0, 4);
  for (const site of shuffledPublishers) {
    plans.push({ query: site, type: "news", searchQuery: `${site} news this week` });
  }

  // Tier 2 fallback: topic-specific safe-domain queries (used if Tier 1 yields < 2)
  // These are added as extra candidates — sourceContent will stop once we have enough news
  const safeNewsPool = [
    "new scientific discovery this week",
    "world record sports achievement this week",
    "new animal species discovered",
    "NASA space mission news this week",
    "new technology invention this week",
    "extreme weather event this week",
    "young person achievement news this week",
    "archaeological discovery news",
    "ocean exploration discovery news",
    "new dinosaur fossil discovery",
    "robotics competition news this week",
    "renewable energy milestone news",
    "international sports tournament results this week",
    "national park or wildlife news this week",
    "medical breakthrough news this week",
  ];
  // Shuffle and pick 3 fallback queries
  const fallbackQueries = safeNewsPool.sort(() => Math.random() - 0.5).slice(0, 3);
  for (const q of fallbackQueries) {
    plans.push({ query: q, type: "news", searchQuery: q });
  }

  // --- Interest articles (6) ---
  // Sort interests by student count, rotate through them
  const sortedInterests = [...interestMap.entries()]
    .sort((a, b) => b[1].length - a[1].length);

  // Pick interests not recently covered, rotate
  const pickedInterests: string[] = [];
  for (const [interest] of sortedInterests) {
    if (pickedInterests.length >= 6) break;
    if (!recentTopics.has(interest)) {
      pickedInterests.push(interest);
    }
  }
  // Fill remaining from top interests even if recently covered
  if (pickedInterests.length < 6) {
    for (const [interest] of sortedInterests) {
      if (pickedInterests.length >= 6) break;
      if (!pickedInterests.includes(interest)) {
        pickedInterests.push(interest);
      }
    }
  }

  for (const interest of pickedInterests) {
    plans.push({
      query: interest,
      type: "interest",
      searchQuery: `${interest} explained for kids`,
    });
  }

  // --- Horizon articles (2) ---
  // Use pre-computed adjacent interests; compute if missing
  const allAdjacentInterests: string[] = [];
  const studentsNeedingAdjacent: Student[] = [];

  for (const s of students) {
    if (s.adjacent_interests && s.adjacent_interests.length > 0) {
      allAdjacentInterests.push(...s.adjacent_interests);
    } else {
      studentsNeedingAdjacent.push(s);
    }
  }

  // Compute adjacent interests for students who don't have them
  for (const s of studentsNeedingAdjacent) {
    const profile = normalizeInterestProfile(s.interest_profile);
    if (profile.interests.length === 0) continue;

    try {
      const response = await anthropic.messages.create({
        model: HAIKU_MODEL,
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
        allAdjacentInterests.push(...adjacent);
        // Store on student record for future batches
        await sql`UPDATE students SET adjacent_interests = ${JSON.stringify(adjacent)} WHERE id = ${s.id}`;
        console.log(`  🧭 Computed adjacent interests for ${s.name}: ${adjacent.slice(0, 3).join(", ")}...`);
      }
    } catch (e) {
      console.log(`  ⚠️ Failed to compute adjacent interests for ${s.name}`);
    }
  }

  // Pick 2 horizon topics from the adjacent pool, avoiding recent
  const uniqueAdjacent = [...new Set(allAdjacentInterests.map(a => a.toLowerCase()))];
  const horizonPicks = uniqueAdjacent
    .filter(a => !recentTopics.has(a))
    .slice(0, 2);

  // Fallback if we can't find unrepeated ones
  if (horizonPicks.length < 2) {
    horizonPicks.push(...uniqueAdjacent.slice(0, 2 - horizonPicks.length));
  }

  for (const topic of horizonPicks) {
    plans.push({
      query: topic,
      type: "horizon",
      searchQuery: `${topic} interesting facts for kids`,
    });
  }

  console.log(`  📊 Plan: ${plans.filter(p => p.type === "interest").length} interest, ${plans.filter(p => p.type === "news").length} news, ${plans.filter(p => p.type === "horizon").length} horizon`);
  return plans;
}

// ─── Step 3: Source Content ─────────────────────────────────────────────────

async function braveSearch(query: string, freshness?: string): Promise<{ title: string; url: string; description: string }[]> {
  const params = new URLSearchParams({ q: query, count: "5" });
  if (freshness) params.set("freshness", freshness);

  // Retry with backoff on rate limits (429)
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { "X-Subscription-Token": BRAVE_API_KEY, Accept: "application/json" },
    });
    if (res.status === 429) {
      const wait = (attempt + 1) * 3000;
      console.log(`     ⏳ Rate limited, waiting ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) return [];
    const data = await res.json();
    return (data.web?.results || []).map((r: any) => ({
      title: r.title || "",
      url: r.url || "",
      description: r.description || "",
    }));
  }
  return [];
}

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
    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
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

async function sourceContent(plans: ArticlePlan[]): Promise<SourcedTopic[]> {
  console.log("\n🔍 Sourcing content from the web...\n");
  const sourced: SourcedTopic[] = [];
  const allCandidates: { url: string; text: string; query: string; type: "interest" | "news" | "horizon"; originalQuery: string }[] = [];

  // Track how many news sources we've found — stop searching once we have enough
  const NEWS_TARGET = 2;
  let newsSourcedCount = 0;

  for (let planIdx = 0; planIdx < plans.length; planIdx++) {
    const plan = plans[planIdx];

    // Skip remaining news searches if we already have enough news candidates
    if (plan.type === "news" && newsSourcedCount >= NEWS_TARGET) {
      continue;
    }

    // Rate limit: Brave free tier allows ~1 req/sec
    if (planIdx > 0) await new Promise(r => setTimeout(r, 1500));

    console.log(`  🔎 Searching: "${plan.searchQuery}" (${plan.type})`);

    // For news: kid publisher site: queries skip freshness (they publish infrequently);
    // topic fallback queries use past-week freshness to get current events
    const isKidPublisher = plan.type === "news" && plan.searchQuery.startsWith("site:");
    const freshness = (plan.type === "news" && !isKidPublisher) ? "pw" : undefined;
    const results = await braveSearch(plan.searchQuery, freshness);

    if (results.length === 0) {
      console.log(`     ⚠️ No results`);
      continue;
    }

    // Fetch up to 5 results until we find a usable source
    let found = false;
    for (const result of results.slice(0, 5)) {
      const text = await fetchSourceText(result.url);
      if (text) {
        allCandidates.push({
          url: result.url,
          text,
          query: plan.searchQuery,
          type: plan.type,
          originalQuery: plan.query,
        });
        console.log(`     ✅ Fetched: ${result.url.substring(0, 60)}...`);
        found = true;
        if (plan.type === "news") newsSourcedCount++;
        break; // One good source per topic is enough
      }
    }
    if (!found) {
      console.log(`     ⚠️ Could not fetch any source`);
    }
  }

  // Batch content filter
  console.log(`\n🛡️ Filtering ${allCandidates.length} sources for age-appropriateness...`);
  const filtered = await filterSources(allCandidates);
  const rejected = allCandidates.length - filtered.length;
  if (rejected > 0) {
    console.log(`  🚫 Rejected ${rejected} inappropriate sources`);
  }

  for (const c of filtered) {
    sourced.push({
      query: c.originalQuery,
      type: c.type,
      sourceUrl: c.url,
      sourceText: c.text,
    });
  }

  console.log(`  ✅ ${sourced.length} sources ready for rewriting`);
  return sourced;
}

// ─── Step 4: Generate Base Articles (Rewrite from Source) ───────────────────

async function rewriteFromSource(topic: SourcedTopic): Promise<{
  title: string; topic: string; bodyText: string; sourceUrl: string;
  sources: string[]; estimatedReadTime: number; category: string;
} | null> {
  const guide = levelGuide[BASE_LEVEL];

  // Truncate source text to ~2000 words to keep prompt reasonable
  const sourceWords = topic.sourceText.split(/\s+/);
  const truncatedSource = sourceWords.length > 2000
    ? sourceWords.slice(0, 2000).join(" ") + "..."
    : topic.sourceText;

  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Rewrite the following source material as an original nonfiction article for a student.

Reading level: ${BASE_LEVEL} (Lexile ${guide.lexile}, Grade ${guide.grade})
Article type: ${topic.type}
Target length: ${guide.words} words

SOURCE MATERIAL:
${truncatedSource}

VOCABULARY RULES: ${guide.vocab}

Requirements:
- Rewrite the source material as an ORIGINAL article. Keep all facts accurate. Do not add information not in the source.
- Do NOT copy sentences verbatim from the source. Use your own words and structure.
- Calibrate sentence length and complexity to the grade level.
- Make it genuinely interesting. Strong opening that hooks the reader.
- Short paragraphs (2-4 sentences each).
- Age-appropriate for grade ${guide.grade} students.
- EDITORIAL NEUTRALITY: Report facts, not opinions.
${topic.type === "news" ? "- Frame around what is happening NOW." : ""}
${topic.type === "horizon" ? "- Introduce the domain with curiosity — this should feel like a discovery." : ""}

Output format:
[ARTICLE]
{
  "title": "Article title",
  "topic": "Topic tag (1-3 words)",
  "body": "The full article text.",
  "estimated_read_time_minutes": 3
}

No preamble or commentary outside the JSON.`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      title: parsed.title,
      topic: parsed.topic,
      bodyText: parsed.body,
      sourceUrl: topic.sourceUrl,
      sources: [topic.sourceUrl],
      estimatedReadTime: parsed.estimated_read_time_minutes || 3,
      category: topic.type === "interest" ? "interest" : topic.type === "news" ? "news" : "general",
    };
  } catch { return null; }
}

// ─── Step 5: Adapt Article to Level ─────────────────────────────────────────

async function adaptArticleToLevel(
  baseTitle: string, baseBody: string, targetLevel: number
): Promise<{ title: string; bodyText: string; estimatedReadTime: number } | null> {
  const guide = levelGuide[targetLevel];

  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Adapt this article to reading level ${targetLevel} (Lexile ${guide.lexile}, Grade ${guide.grade}, ${guide.words} words). Keep same facts, adjust vocabulary/complexity.

${guide.vocab}

Title: ${baseTitle}
---
${baseBody}
---

Rules:
- Keep the same title (or simplify for lower levels)
- Keep all key facts accurate
- Adjust sentence length and vocabulary to match target grade
- Short paragraphs (2-4 sentences)

Output ONLY JSON:
{"title": "Article title", "body": "Adapted article text.", "estimated_read_time_minutes": ${targetLevel <= 2 ? 2 : targetLevel <= 4 ? 3 : 4}}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return { title: parsed.title || baseTitle, bodyText: parsed.body, estimatedReadTime: parsed.estimated_read_time_minutes || 3 };
  } catch { return null; }
}

// ─── Step 6: Serve Articles to Students ─────────────────────────────────────

async function serveToStudents(students: Student[]) {
  console.log("\n📬 Serving articles to students...\n");

  for (const student of students) {
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
      SELECT * FROM article_cache WHERE reading_level = ${student.reading_level} AND flagged = false
      ORDER BY created_at DESC LIMIT 50
    `;
    const unseen = available.filter((a: any) => !seen.has(a.title));
    const toServe = unseen.slice(0, needed);

    for (const a of toServe) {
      await sql`INSERT INTO articles (student_id, title, topic, body_text, reading_level, sources, estimated_read_time, category, source_cache_id)
        VALUES (${student.id}, ${a.title}, ${a.topic}, ${a.body_text}, ${a.reading_level}, ${JSON.stringify(a.sources || [])}, ${a.estimated_read_time}, ${a.category}, ${a.id})`;
      await sql`INSERT INTO student_article_history (student_id, article_cache_id, article_title)
        VALUES (${student.id}, ${a.id}, ${a.title})`;
    }

    console.log(`  ${student.name} (L${student.reading_level}): served ${toServe.length}/${needed}`);
  }
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

// ─── Main ───────────────────────────────────────────────────────────────────

async function run() {
  const today = new Date().toISOString().split("T")[0];
  console.log(`\n🌅 Morning Article Batch — ${today} (source-first pipeline)\n`);

  // Step 1: Analyze students
  const { students, levelsNeeded, interestMap, recentTopics } = await analyzeStudents();
  const topInterests = [...interestMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([interest]) => interest);

  console.log(`📚 ${students.length} active students`);
  console.log(`📊 Reading levels needed: ${[...levelsNeeded].sort().join(", ")}`);
  console.log(`🎯 Top interests: ${topInterests.join(", ")}`);

  if (students.length === 0) { console.log("No active students. Skipping."); return; }

  // Check if we already have base articles from a partial run today
  const TARGET_BASE_ARTICLES = 10;
  const [existingToday] = await sql`
    SELECT COUNT(*) as c FROM article_cache
    WHERE generated_date = ${today} AND base_article_id IS NULL AND flagged = false
  `;
  const existingBaseCount = parseInt(existingToday.c as string);

  if (existingBaseCount >= TARGET_BASE_ARTICLES) {
    console.log(`✅ Already have ${existingBaseCount} base articles for today. Skipping generation.`);
    await serveToStudents(students);
    await flagExpiredArticles();
    console.log(`\n✅ Batch complete (served existing articles)\n`);
    return;
  }

  const articlesNeeded = TARGET_BASE_ARTICLES - existingBaseCount;
  if (existingBaseCount > 0) {
    console.log(`📋 Found ${existingBaseCount} base articles from earlier run. Generating ${articlesNeeded} more.`);
  }

  // Step 2: Plan daily mix
  const plans = await planDailyArticles(interestMap, students, recentTopics);

  // Limit to what we actually need
  const plansToSource = plans.slice(0, articlesNeeded);

  // Step 3: Source content from the web
  const sourcedTopics = await sourceContent(plansToSource);

  // Filter out blocked topics
  const blockedTopics = await sql`SELECT topic FROM blocked_topics`;
  const blockedSet = new Set(blockedTopics.map(b => (b.topic as string).toLowerCase()));

  console.log(`\n📝 Rewriting ${sourcedTopics.length} sourced articles...\n`);

  // Step 4: Rewrite from sources
  const baseArticles: { id: number; title: string; topic: string; bodyText: string; sources: string[]; category: string }[] = [];

  for (let i = 0; i < sourcedTopics.length; i++) {
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
    baseArticles.push({ id: inserted.id, title: article.title, topic: article.topic, bodyText: article.bodyText, sources: article.sources, category: article.category });
    await sql`INSERT INTO generated_topics (topic, category, generated_date) VALUES (${article.topic}, ${article.category}, ${today})`;
    console.log(`     ✅ "${article.title}" (source: ${t.sourceUrl.substring(0, 50)}...)`);
  }

  console.log(`\n📝 Generated ${baseArticles.length} base articles from real sources`);

  // Step 5: Adapt to needed levels
  console.log("\n📐 Adapting to reading levels...\n");

  for (const base of baseArticles) {
    for (const level of levelsNeeded) {
      if (level === BASE_LEVEL) continue;

      const adapted = await adaptArticleToLevel(base.title, base.bodyText, level);
      if (adapted) {
        await sql`
          INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, base_article_id, generated_date)
          VALUES (${adapted.title}, ${base.topic}, ${adapted.bodyText}, ${level}, ${JSON.stringify(base.sources)}, ${adapted.estimatedReadTime}, ${base.category}, ${base.id}, ${today})
        `;
        console.log(`  ✅ "${base.title.substring(0, 40)}..." → L${level}`);
      } else {
        console.log(`  ❌ "${base.title.substring(0, 40)}..." → L${level}`);
      }
    }
  }

  // Step 5b: Backfill any base articles missing level adaptations
  console.log("\n🔧 Checking for incomplete level coverage...\n");
  const allBases = await sql`
    SELECT ac.id, ac.topic, ac.title, ac.body_text, ac.sources, ac.category, ac.generated_date,
      (SELECT array_agg(DISTINCT reading_level ORDER BY reading_level) FROM article_cache WHERE base_article_id = ac.id OR id = ac.id) as levels
    FROM article_cache ac WHERE base_article_id IS NULL AND flagged = false AND generated_date >= CURRENT_DATE - INTERVAL '7 days'
  `;
  const allLevelsArr = [...levelsNeeded];
  let backfilled = 0;
  for (const base of allBases) {
    const missing = allLevelsArr.filter(l => l !== BASE_LEVEL && !base.levels.includes(l));
    for (const level of missing) {
      console.log(`  🔧 Backfilling ${base.topic} → L${level}`);
      const adapted = await adaptArticleToLevel(base.title, base.body_text, level);
      if (adapted) {
        await sql`INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, base_article_id, generated_date)
          VALUES (${adapted.title}, ${base.topic}, ${adapted.bodyText}, ${level}, ${JSON.stringify(base.sources || [])}, ${adapted.estimatedReadTime}, ${base.category}, ${base.id}, ${base.generated_date})`;
        backfilled++;
      }
    }
  }
  if (backfilled > 0) console.log(`  ✅ Backfilled ${backfilled} missing adaptations`);

  // Step 6: Serve to students
  await serveToStudents(students);

  // Step 7: Flag expired articles
  await flagExpiredArticles();

  console.log(`\n✅ Batch complete! ${baseArticles.length} source-backed articles × ${levelsNeeded.size} levels\n`);
}

run().catch(console.error);
