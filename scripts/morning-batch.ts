/**
 * Morning Article Batch Generation
 * 
 * Runs daily at 5 AM CT via cron job.
 * 
 * Process:
 * 1. Analyze active students: interests, reading levels, recent reading history
 * 2. Fetch today's kid-friendly news headlines
 * 3. Plan article topics: news (40%), interest-matched (35%), horizon-expanding (25%)
 * 4. Generate base articles at L4 using Opus
 * 5. Adapt each article to all needed reading levels using Sonnet
 * 6. Fill each student's buffer to 12 unread articles
 * 
 * Efficiency: shared pool — one article serves all students at a given level.
 * Students never see the same article twice (tracked via student_article_history).
 * 
 * See docs/content-policy.md for selection principles.
 * See docs/article-pipeline.md for technical specification.
 */

import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { normalizeInterestProfile } from "../src/lib/normalize-interests";

const DATABASE_URL = process.env.DATABASE_URL!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const OPUS_MODEL = "claude-opus-4-6";
const SONNET_MODEL = "claude-sonnet-4-5";
const BUFFER_TARGET = 12;
const BASE_LEVEL = 4;

const sql = neon(DATABASE_URL);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

interface Student {
  id: number;
  name: string;
  reading_level: number;
  interest_profile: any;
  daily_article_cap: number;
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
  commonInterests: string[];
  recentDomains: Map<string, number>;
}> {
  const students = await sql`
    SELECT id, name, reading_level, interest_profile, daily_article_cap
    FROM students WHERE onboarding_complete = true AND reading_level IS NOT NULL
  ` as Student[];

  const levelsNeeded = new Set(students.map(s => s.reading_level));

  // Aggregate interests across all students
  const interestCounts = new Map<string, number>();
  for (const s of students) {
    const profile = normalizeInterestProfile(s.interest_profile);
    const interests = profile.interests;
    for (const i of interests) {
      const lower = i.toLowerCase().trim();
      interestCounts.set(lower, (interestCounts.get(lower) || 0) + 1);
    }
  }
  // Sort by popularity
  const commonInterests = [...interestCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([interest]) => interest);

  // Check recent reading domains (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const recentTopics = await sql`
    SELECT topic, COUNT(*) as c FROM articles
    WHERE created_at >= ${weekAgo} AND read = true
    GROUP BY topic ORDER BY c DESC LIMIT 20
  `;
  const recentDomains = new Map<string, number>();
  for (const r of recentTopics) {
    recentDomains.set(r.topic as string, parseInt(r.c as string));
  }

  return { students, levelsNeeded, commonInterests, recentDomains };
}

// ─── Step 2: Fetch News Headlines ───────────────────────────────────────────

async function getNewsHeadlines(): Promise<{ topic: string; source: string }[]> {
  const today = new Date().toISOString().split("T")[0];
  console.log("📰 Fetching today's news headlines...");

  // Primary: Brave Search across mainstream + kid-friendly sources
  let allHeadlines = "";
  const BRAVE_KEY = process.env.BRAVE_API_KEY || "";

  if (BRAVE_KEY) {
    const searches = [
      // Mainstream news — Claude will filter for age-appropriateness
      { q: "top news today", label: "Top News" },
      { q: "science discovery news today", label: "Science" },
      { q: "sports news today", label: "Sports" },
      { q: "technology news today", label: "Technology" },
      { q: "space NASA astronomy news", label: "Space" },
      { q: "animals nature wildlife news", label: "Animals & Nature" },
      { q: "interesting world news today", label: "World" },
    ];
    for (const { q, label } of searches) {
      try {
        // Try past 24h first, fall back to past week if too few results
        let results: any[] = [];
        for (const freshness of ["pd", "pw"]) {
          const searchRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&freshness=${freshness}`, {
            headers: { "X-Subscription-Token": BRAVE_KEY, Accept: "application/json" },
          });
          const data = await searchRes.json();
          results = data.web?.results || [];
          if (results.length >= 2) break; // enough results from this freshness window
        }
        if (results.length > 0) {
          allHeadlines += `\n${label}:\n${results.map((r: any) => `- ${r.title}${r.published ? ` [${r.published}]` : ""} (${r.url})`).join("\n")}\n`;
        }
      } catch { console.log(`  ⚠️  Search failed: ${label}`); }
    }
  }

  // Fallback: scrape kid-friendly sites if Brave returns nothing
  if (!allHeadlines.trim()) {
    const kidSources = [
      "https://newsforkids.net/",
      "https://www.dogonews.com/",
    ];
    for (const url of kidSources) {
      try {
        const res = await fetch(url);
        const html = await res.text();
        const titleMatches = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi) || [];
        const titles = titleMatches.map(t => t.replace(/<[^>]*>/g, "").trim()).filter(t => t.length > 10 && t.length < 200);
        if (titles.length > 0) {
          allHeadlines += `\nFrom ${url}:\n${titles.slice(0, 8).map(t => `- ${t}`).join("\n")}\n`;
        }
      } catch { console.log(`  ⚠️  Could not fetch ${url}`); }
    }
  }

  if (!allHeadlines.trim()) {
    console.log("  ⚠️  No headlines fetched, using evergreen fallback");
    return [
      { topic: "A recent breakthrough in renewable energy technology", source: "Science News" },
      { topic: "An unusual animal behavior discovered by researchers", source: "Nature" },
      { topic: "A young person making a difference in their community", source: "Good News" },
      { topic: "A new discovery about dinosaurs or prehistoric life", source: "Paleontology Today" },
      { topic: "An innovation in space exploration or astronomy", source: "NASA" },
    ];
  }

  const response = await anthropic.messages.create({
    model: OPUS_MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `TODAY'S DATE: ${today}

Here are recent news headlines:\n\n${allHeadlines}\n\nSelect 5-6 stories using this framework:

CONTENT BUCKETS:
- Bucket 1 (aim for 4-5): Universally safe — science, animals, sports, space, technology, weather, human interest, gaming. Almost no parent objects.
- Bucket 2 (aim for 0-1): Factual current events with civic relevance. Report the WHAT, skip the WHY. Only if genuinely significant.
- Bucket 3 (AVOID): Genuinely polarizing. Skip entirely.

CRITICAL — RECENCY RULES:
- Only select stories about events from the PAST 3 DAYS (${today} and the 2 days before).
- REJECT any headline about events from weeks, months, or years ago — even if the article was recently published. A "2025 Super Bowl recap" published today is NOT current news.
- Look for date cues in headlines: year numbers, "last year", "last month", season references that don't match the current date.
- When in doubt about recency, skip the story.
- The goal is helping students understand what is happening in the world RIGHT NOW.

RULES: Age-appropriate, factual framing, no editorializing, prioritize curiosity over anxiety.

Output as JSON array ONLY:
[{"topic": "brief description of the CURRENT event", "source": "source name or URL"}]`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try { return JSON.parse(jsonMatch[0]); } catch { return []; }
}

// ─── Step 3: Plan Interest-Matched & Horizon Topics ─────────────────────────

async function planInterestTopics(
  commonInterests: string[],
  recentDomains: Map<string, number>,
): Promise<{ topic: string; type: "interest_matched" | "horizon_expanding" }[]> {
  console.log("🎯 Planning interest-matched and horizon-expanding topics...");

  const recentList = [...recentDomains.entries()].map(([d, c]) => `${d} (${c} articles)`).join(", ");

  // Feedback loop: get recent favorites (last 7 days) — what students loved
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const favorites = await sql`
    SELECT a.title, a.topic, a.category FROM article_favorites af
    JOIN articles a ON a.id = af.article_id
    WHERE af.created_at >= ${weekAgo}
    ORDER BY af.created_at DESC LIMIT 10
  `;
  const favoriteTopics = favorites.map((f: any) => `"${f.title}" (${f.topic})`);

  // Feedback loop: get recent interest suggestions — what students asked for
  const suggestions = await sql`
    SELECT metadata FROM article_feed_events
    WHERE event_type = 'interest_suggestion' AND created_at >= ${weekAgo}
    ORDER BY created_at DESC LIMIT 10
  `;
  const interestSuggestions = suggestions
    .map((s: any) => {
      try { return (typeof s.metadata === 'string' ? JSON.parse(s.metadata) : s.metadata)?.text; }
      catch { return null; }
    })
    .filter(Boolean);

  // Feedback loop: get recent ratings — overall satisfaction signal
  const [ratingAvg] = await sql`
    SELECT AVG(CASE rating WHEN 'love' THEN 4 WHEN 'okay' THEN 3 WHEN 'not_great' THEN 2 WHEN 'bad' THEN 1 END) as avg_rating,
           COUNT(*) as count
    FROM article_ratings WHERE created_at >= ${weekAgo}
  `;

  const feedbackSection = [
    favoriteTopics.length > 0 ? `\nSTUDENT FAVORITES (articles they loved this week):\n${favoriteTopics.join("\n")}` : "",
    interestSuggestions.length > 0 ? `\nSTUDENT REQUESTS (topics students explicitly asked for):\n${interestSuggestions.map((s: string) => `- "${s}"`).join("\n")}\nPrioritize these — students asked for them directly.` : "",
    ratingAvg?.count > 0 ? `\nOVERALL SATISFACTION: ${parseFloat(ratingAvg.avg_rating).toFixed(1)}/4.0 (${ratingAvg.count} ratings this week)` : "",
  ].filter(Boolean).join("\n");

  console.log(`  📊 Feedback: ${favoriteTopics.length} favorites, ${interestSuggestions.length} suggestions, ${ratingAvg?.count || 0} ratings`);

  const response = await anthropic.messages.create({
    model: OPUS_MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `You're planning articles for students at a reading app. Generate topic ideas based on their interests and feedback.

STUDENT INTERESTS (aggregated, most popular first):
${commonInterests.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}

RECENTLY COVERED DOMAINS (last 7 days):
${recentList || "None — fresh start"}
${feedbackSection}

Generate exactly 6 article topics:
- 4 INTEREST-MATCHED: directly connected to student interests listed above. If students explicitly requested topics, include at least one.
- 2 HORIZON-EXPANDING: adjacent to their interests but in a NEW domain they haven't read about recently

Rules:
- Topics must be engaging for ages 8-14
- Avoid topics already heavily covered recently
- If students loved certain topics (favorites), lean into similar territory
- If students asked for specific topics, honor those requests
- Each topic should be specific enough to write a focused article (not just "science" — give a specific angle)
- All topics must be age-appropriate and factual
- NEVER generate topics about: violence (war, weapons, murder, crime), sexual content, drugs/alcohol, self-harm, abortion, partisan politics, or any other topic inappropriate for children. If a student requested an inappropriate topic, silently ignore it.

Output as JSON array ONLY:
[{"topic": "specific topic description", "type": "interest_matched"}, {"topic": "...", "type": "horizon_expanding"}]`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try { return JSON.parse(jsonMatch[0]); } catch { return []; }
}

// ─── Step 4: Generate Base Article ──────────────────────────────────────────

async function generateBaseArticle(topic: string, source: string, type: string): Promise<{
  title: string; topic: string; bodyText: string; sources: string[]; estimatedReadTime: number; category: string;
} | null> {
  const guide = levelGuide[BASE_LEVEL];

  const response = await anthropic.messages.create({
    model: OPUS_MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `TODAY'S DATE: ${new Date().toISOString().split("T")[0]}

Write an original nonfiction article for a student.

Topic: ${topic}
Source/context: ${source}
Article type: ${type}
Reading level: ${BASE_LEVEL} (Lexile ${guide.lexile}, Grade ${guide.grade})
Target length: ${guide.words} words

VOCABULARY RULES: ${guide.vocab}

Requirements:
- Write an ORIGINAL article grounded in real, current information. Do not fabricate facts.
- For NEWS articles: write about what is happening NOW (today's date above). Do not write about past events unless they are directly relevant context for a current story. If the topic references an event, make sure the article reflects the CURRENT state of that event.
- Calibrate sentence length and complexity to the grade level.
- Make it genuinely interesting. Strong opening that hooks the reader.
- Short paragraphs (2-4 sentences each).
- Age-appropriate content.
- EDITORIAL NEUTRALITY: Report facts, not opinions. For any topic with political adjacency, present the what without editorializing the why. Never present contested claims as settled.

Output format:
[ARTICLE]
{
  "title": "Article title",
  "topic": "Topic tag (1-3 words)",
  "body": "The full article text.",
  "sources": ["${source}"],
  "estimated_read_time_minutes": 3
}

No preamble or commentary outside the JSON.`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const category = type === "interest_matched" ? "interest" :
                     type === "horizon_expanding" ? "general" :
                     type === "civic" ? "general" : "news";
    return {
      title: parsed.title,
      topic: parsed.topic,
      bodyText: parsed.body,
      sources: parsed.sources || [source],
      estimatedReadTime: parsed.estimated_read_time_minutes || 3,
      category,
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
{"title": "Article title", "body": "Adapted article text.", "estimated_read_time_minutes": ${targetLevel <= 2 ? 2 : targetLevel <= 4 ? 3 : 4}}`
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
      SELECT * FROM article_cache WHERE reading_level = ${student.reading_level}
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
  console.log(`\n🌅 Morning Article Batch — ${today}\n`);

  // Step 1: Analyze students
  const { students, levelsNeeded, commonInterests, recentDomains } = await analyzeStudents();
  console.log(`📚 ${students.length} active students`);
  console.log(`📊 Reading levels needed: ${[...levelsNeeded].sort().join(", ")}`);
  console.log(`🎯 Top interests: ${commonInterests.slice(0, 8).join(", ")}`);

  if (students.length === 0) { console.log("No active students. Skipping."); return; }

  // Check if we already have base articles from a partial run today
  const TARGET_BASE_ARTICLES = 12;
  const [existingToday] = await sql`
    SELECT COUNT(*) as c FROM article_cache
    WHERE generated_date = ${today} AND base_article_id IS NULL AND flagged = false
  `;
  const existingBaseCount = parseInt(existingToday.c as string);

  if (existingBaseCount >= TARGET_BASE_ARTICLES) {
    console.log(`✅ Already have ${existingBaseCount} base articles for today. Skipping generation.`);
    // Still serve to students and flag expired
    await serveToStudents(students);
    await flagExpiredArticles();
    console.log(`\n✅ Article generation complete (served existing articles)\n`);
    return;
  }

  const articlesNeeded = TARGET_BASE_ARTICLES - existingBaseCount;
  if (existingBaseCount > 0) {
    console.log(`📋 Found ${existingBaseCount} base articles from earlier run. Generating ${articlesNeeded} more.`);
  }

  // Step 2: Fetch news headlines
  const headlines = await getNewsHeadlines();
  console.log(`📰 Got ${headlines.length} news headlines`);

  // Step 3: Plan interest-matched + horizon topics
  const interestTopics = await planInterestTopics(commonInterests, recentDomains);
  console.log(`💡 Got ${interestTopics.length} interest/horizon topics`);

  // Combine all topics
  const allTopicsRaw: { topic: string; source: string; type: string }[] = [
    ...headlines.map(h => ({ topic: h.topic, source: h.source, type: "news" })),
    ...interestTopics.map(t => ({ topic: t.topic, source: "Student interests", type: t.type })),
  ];

  // Filter out blocked topics
  const blockedTopics = await sql`SELECT topic FROM blocked_topics`;
  const blockedSet = new Set(blockedTopics.map(b => b.topic.toLowerCase()));
  const allTopics = allTopicsRaw.filter(t => !blockedSet.has(t.topic.toLowerCase()));
  if (allTopicsRaw.length !== allTopics.length) {
    console.log(`🚫 Filtered out ${allTopicsRaw.length - allTopics.length} blocked topics`);
  }

  // Filter out topics already generated today (from partial run)
  const todaysTopics = await sql`SELECT topic FROM generated_topics WHERE generated_date = ${today}`;
  const todaysSet = new Set(todaysTopics.map((t: any) => t.topic.toLowerCase()));

  // Check for recent topic duplicates (last 14 days)
  const recentTopics = await sql`SELECT topic FROM generated_topics WHERE generated_date > CURRENT_DATE - INTERVAL '14 days'`;
  const recentList = recentTopics.map(t => t.topic as string);

  // Semantic dedup via Claude — catch near-duplicates like "Animal Architects" vs "Animal Architecture"
  let dedupedTopics = allTopics.filter(t => !todaysSet.has(t.topic.toLowerCase()));
  if (recentList.length > 0 && dedupedTopics.length > 0) {
    try {
      const dedupResponse = await anthropic.messages.create({
        model: SONNET_MODEL,
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `I have candidate article topics and recently published topics. Remove any candidate that is semantically too similar to a recent topic (same subject, just different wording).

RECENT TOPICS (last 14 days):
${recentList.map(t => `- ${t}`).join("\n")}

CANDIDATE TOPICS:
${dedupedTopics.map((t, i) => `${i}: ${t.topic}`).join("\n")}

Return ONLY a JSON array of the candidate indices to KEEP (not duplicates):
[0, 2, 5, ...]`
        }],
      });
      const dedupText = dedupResponse.content[0].type === "text" ? dedupResponse.content[0].text : "";
      const keepMatch = dedupText.match(/\[[\s\S]*?\]/);
      if (keepMatch) {
        const keepIndices = new Set(JSON.parse(keepMatch[0]) as number[]);
        const before = dedupedTopics.length;
        dedupedTopics = dedupedTopics.filter((_, i) => keepIndices.has(i));
        if (before !== dedupedTopics.length) {
          console.log(`♻️ Semantic dedup removed ${before - dedupedTopics.length} near-duplicate topics`);
        }
      }
    } catch (e) {
      console.log(`⚠️ Semantic dedup failed, falling back to exact match`);
      const recentSet = new Set(recentList.map(t => t.toLowerCase()));
      dedupedTopics = dedupedTopics.filter(t => !recentSet.has(t.topic.toLowerCase()));
    }
  }

  if (allTopics.length !== dedupedTopics.length) {
    console.log(`♻️ Total skipped: ${allTopics.length - dedupedTopics.length} duplicate/recent topics`);
  }
  const finalTopics = (dedupedTopics.length > 0 ? dedupedTopics : allTopics).slice(0, articlesNeeded);

  console.log(`\n📝 Generating ${finalTopics.length} base articles...\n`);

  // Step 4: Generate base articles
  const baseArticles: { id: number; title: string; topic: string; bodyText: string; sources: string[]; category: string }[] = [];

  for (let i = 0; i < finalTopics.length; i++) {
    const t = finalTopics[i];
    console.log(`  ✍️  [${i + 1}/${finalTopics.length}] ${t.type}: ${t.topic.substring(0, 55)}...`);

    const article = await generateBaseArticle(t.topic, t.source, t.type);
    if (article) {
      const [inserted] = await sql`
        INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, generated_date, headline_source)
        VALUES (${article.title}, ${article.topic}, ${article.bodyText}, ${BASE_LEVEL}, ${JSON.stringify(article.sources)}, ${article.estimatedReadTime}, ${article.category}, ${today}, ${t.source})
        RETURNING id
      `;
      baseArticles.push({ id: inserted.id, title: article.title, topic: article.topic, bodyText: article.bodyText, sources: article.sources, category: article.category });
      // Log topic for dedup
      await sql`INSERT INTO generated_topics (topic, category, generated_date) VALUES (${article.topic}, ${article.category}, ${today})`;
      console.log(`     ✅ "${article.title}"`);
    } else {
      console.log(`     ❌ Failed`);
    }
  }

  console.log(`\n📝 Generated ${baseArticles.length} base articles`);

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

  console.log(`\n✅ Article generation complete! Generated ${baseArticles.length} base articles × ${levelsNeeded.size} levels\n`);
}

run().catch(console.error);
