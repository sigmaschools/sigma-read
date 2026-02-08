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
    const profile = s.interest_profile as any;
    if (!profile) continue;
    const interests = [...(profile.primary_interests || []), ...(profile.secondary_interests || [])];
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
  console.log("📰 Fetching today's news headlines...");

  const sources = [
    "https://newsforkids.net/",
    "https://www.dogonews.com/",
    "https://www.timeforkids.com/g34/",
  ];

  let allHeadlines = "";
  for (const url of sources) {
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

  // Supplement with Brave Search
  try {
    const BRAVE_KEY = process.env.BRAVE_API_KEY || "";
    if (BRAVE_KEY) {
      for (const q of ["interesting science news today kids", "sports news today kids", "animals discovery news"]) {
        try {
          const searchRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=3&freshness=pd`, {
            headers: { "X-Subscription-Token": BRAVE_KEY, Accept: "application/json" },
          });
          const data = await searchRes.json();
          if (data.web?.results) {
            allHeadlines += `\nFrom search "${q}":\n${data.web.results.map((r: any) => `- ${r.title} (${r.url})`).join("\n")}\n`;
          }
        } catch {}
      }
    }
  } catch {}

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
      content: `Here are recent news headlines from kid-friendly sources:\n\n${allHeadlines}\n\nSelect 5-6 stories using this framework:

CONTENT BUCKETS:
- Bucket 1 (aim for 4-5): Universally safe — science, animals, sports, space, technology, weather, human interest, gaming. Almost no parent objects.
- Bucket 2 (aim for 0-1): Factual current events with civic relevance. Report the WHAT, skip the WHY. Only if genuinely significant.
- Bucket 3 (AVOID): Genuinely polarizing. Skip entirely.

RULES: Age-appropriate, factual framing, no editorializing, prioritize curiosity over anxiety.

Output as JSON array ONLY:
[{"topic": "brief description", "source": "source name or URL"}]`
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

  const response = await anthropic.messages.create({
    model: OPUS_MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `You're planning articles for students at a reading app. Generate topic ideas based on their interests.

STUDENT INTERESTS (aggregated, most popular first):
${commonInterests.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}

RECENTLY COVERED DOMAINS (last 7 days):
${recentList || "None — fresh start"}

Generate exactly 6 article topics:
- 4 INTEREST-MATCHED: directly connected to student interests listed above
- 2 HORIZON-EXPANDING: adjacent to their interests but in a NEW domain they haven't read about recently

Rules:
- Topics must be engaging for ages 8-14
- Avoid topics already heavily covered recently
- Each topic should be specific enough to write a focused article (not just "science" — give a specific angle)
- All topics must be age-appropriate and factual

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
      content: `Write an original nonfiction article for a student.

Topic: ${topic}
Source/context: ${source}
Article type: ${type}
Reading level: ${BASE_LEVEL} (Lexile ${guide.lexile}, Grade ${guide.grade})
Target length: ${guide.words} words

VOCABULARY RULES: ${guide.vocab}

Requirements:
- Write an ORIGINAL article grounded in real, current information. Do not fabricate facts.
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

  // Step 2: Fetch news headlines
  const headlines = await getNewsHeadlines();
  console.log(`📰 Got ${headlines.length} news headlines`);

  // Step 3: Plan interest-matched + horizon topics
  const interestTopics = await planInterestTopics(commonInterests, recentDomains);
  console.log(`💡 Got ${interestTopics.length} interest/horizon topics`);

  // Combine all topics
  const allTopics: { topic: string; source: string; type: string }[] = [
    ...headlines.map(h => ({ topic: h.topic, source: h.source, type: "news" })),
    ...interestTopics.map(t => ({ topic: t.topic, source: "Student interests", type: t.type })),
  ];

  console.log(`\n📝 Generating ${allTopics.length} base articles...\n`);

  // Step 4: Generate base articles
  const baseArticles: { id: number; title: string; topic: string; bodyText: string; sources: string[]; category: string }[] = [];

  for (let i = 0; i < allTopics.length; i++) {
    const t = allTopics[i];
    console.log(`  ✍️  [${i + 1}/${allTopics.length}] ${t.type}: ${t.topic.substring(0, 55)}...`);

    const article = await generateBaseArticle(t.topic, t.source, t.type);
    if (article) {
      const [inserted] = await sql`
        INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, generated_date, headline_source)
        VALUES (${article.title}, ${article.topic}, ${article.bodyText}, ${BASE_LEVEL}, ${JSON.stringify(article.sources)}, ${article.estimatedReadTime}, ${article.category}, ${today}, ${t.source})
        RETURNING id
      `;
      baseArticles.push({ id: inserted.id, title: article.title, topic: article.topic, bodyText: article.bodyText, sources: article.sources, category: article.category });
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

  // Step 6: Serve to students
  await serveToStudents(students);

  console.log(`\n✅ Morning batch complete! Generated ${baseArticles.length} articles × ${levelsNeeded.size} levels\n`);
}

run().catch(console.error);
