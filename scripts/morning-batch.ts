/**
 * Morning Article Batch Generation
 * 
 * Runs daily at 5 AM CT via cron job.
 * 
 * Process:
 * 1. Ask Claude for today's kid-friendly news headlines
 * 2. Get active students and their reading levels + interests
 * 3. Generate base articles at L4 (middle level) using Opus
 * 4. Adapt each article to all 6 reading levels using Sonnet
 * 5. Fill each student's buffer to 12 unread articles
 * 
 * Efficiency: shared pool — one article serves all students at a given level.
 * Students never see the same article twice (tracked via student_article_history).
 */

import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const OPUS_MODEL = "claude-opus-4-6";
const SONNET_MODEL = "claude-sonnet-4-5";
const BUFFER_TARGET = 12; // unread articles per student
const BASE_LEVEL = 4; // generate base articles at L4, adapt to others

const sql = neon(DATABASE_URL);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

interface Student {
  id: number;
  name: string;
  reading_level: number;
  interest_profile: any;
  daily_article_cap: number;
}

interface CachedArticle {
  id: number;
  title: string;
  topic: string;
  body_text: string;
  reading_level: number;
  sources: string[];
  estimated_read_time: number;
  category: string;
  base_article_id: number | null;
}

const levelGuide: Record<number, { lexile: string; grade: string; words: string; vocab: string }> = {
  1: { lexile: "~400-500", grade: "2-3", words: "100-200", vocab: "Use simple, common words. Short sentences (5-10 words). Define any topic word in the same sentence." },
  2: { lexile: "~550-650", grade: "3-4", words: "200-300", vocab: "Mostly common words. At most 1-2 topic-specific words per paragraph, explained in context." },
  3: { lexile: "~700-800", grade: "5-6", words: "300-400", vocab: "At most 2-3 challenging words per paragraph. Each one defined or contextually clear." },
  4: { lexile: "~850-950", grade: "7", words: "400-500", vocab: "Domain vocabulary with context clues. Avoid stacking multiple technical terms in one sentence." },
  5: { lexile: "~1000-1100", grade: "8", words: "400-600", vocab: "Domain-specific vocabulary supported by context. Complex sentence structures allowed." },
  6: { lexile: "~1150+", grade: "8+", words: "500-600", vocab: "Advanced vocabulary acceptable. Assume strong reader who can handle nuance and inference." },
};

async function getNewsHeadlines(): Promise<{ topic: string; source: string }[]> {
  console.log("📰 Fetching today's news headlines from kid-friendly sources...");
  
  // Fetch from multiple kid-friendly news sources
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
      // Extract text content (rough — get headlines from title tags and headings)
      const titleMatches = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi) || [];
      const titles = titleMatches.map(t => t.replace(/<[^>]*>/g, "").trim()).filter(t => t.length > 10 && t.length < 200);
      if (titles.length > 0) {
        allHeadlines += `\nFrom ${url}:\n${titles.slice(0, 8).map(t => `- ${t}`).join("\n")}\n`;
      }
    } catch (e) {
      console.log(`  ⚠️  Could not fetch ${url}`);
    }
  }
  
  // Also search for recent kid-friendly news
  try {
    const searchQueries = [
      "interesting science news today kids",
      "sports news today kids",
      "animals discovery news today",
      "space NASA news today",
    ];
    for (const q of searchQueries) {
      try {
        const BRAVE_KEY = process.env.BRAVE_API_KEY || "";
        if (BRAVE_KEY) {
          const searchRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=3&freshness=pd`, {
            headers: { "X-Subscription-Token": BRAVE_KEY, Accept: "application/json" },
          });
          const data = await searchRes.json();
          if (data.web?.results) {
            allHeadlines += `\nFrom search "${q}":\n${data.web.results.map((r: any) => `- ${r.title} (${r.url})`).join("\n")}\n`;
          }
        }
      } catch {}
    }
  } catch {}
  
  if (!allHeadlines.trim()) {
    console.log("  ⚠️  No headlines fetched, falling back to evergreen topics");
    // Fallback: generate based on evergreen kid-friendly topics
    return [
      { topic: "A recent breakthrough in renewable energy technology", source: "Science News" },
      { topic: "An unusual animal behavior discovered by researchers", source: "Nature" },
      { topic: "A young person making a difference in their community", source: "Good News" },
      { topic: "A new discovery about dinosaurs or prehistoric life", source: "Paleontology Today" },
      { topic: "An innovation in space exploration or astronomy", source: "NASA" },
      { topic: "A new technology that could change everyday life", source: "Tech News" },
      { topic: "An incredible feat of engineering or construction", source: "Engineering" },
      { topic: "A surprising fact about ocean life", source: "Marine Science" },
    ];
  }
  
  // Use Claude to select the best 8-10 kid-friendly topics from the scraped headlines
  const response = await anthropic.messages.create({
    model: OPUS_MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Here are recent news headlines from kid-friendly sources:\n\n${allHeadlines}\n\nSelect 8-10 stories for a 10-year-old using this framework:

CONTENT BUCKETS:
- Bucket 1 (aim for 7-8): Universally safe — science, animals, sports, space, technology, weather, human interest, gaming. This is the majority. Almost no parent objects.
- Bucket 2 (aim for 1-2): Factual current events with civic relevance — "Congress passed a law about X" or "the economy grew/shrank." Report the WHAT, skip the WHY. No editorializing. These build civic literacy.
- Bucket 3 (AVOID): Genuinely polarizing topics where story selection itself signals a political stance. Skip these entirely.

RULES:
- Age-appropriate content only
- Factual framing — no editorializing, no presenting contested claims as settled
- For any civic/world events: neutral language, multiple perspectives welcome
- Skip anything too adult, scary, or ideologically charged
- Prioritize stories that spark curiosity, not anxiety

For each, provide a brief topic description and the source.

Output as JSON array ONLY — no other text:
[{"topic": "brief description of the story", "source": "source name or URL"}]`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("Failed to parse curated headlines:", text.substring(0, 200));
    return [];
  }
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("JSON parse error:", e);
    return [];
  }
}

async function generateBaseArticle(topic: string, source: string): Promise<{
  title: string;
  topic: string;
  bodyText: string;
  sources: string[];
  estimatedReadTime: number;
} | null> {
  const guide = levelGuide[BASE_LEVEL];
  
  const response = await anthropic.messages.create({
    model: OPUS_MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Write an original nonfiction article for a student based on this news story:

News story: ${topic}
Source: ${source}

Reading level: ${BASE_LEVEL} (Lexile ${guide.lexile}, Grade ${guide.grade})
Target length: ${guide.words} words

VOCABULARY RULES: ${guide.vocab}

Requirements:
- Write an ORIGINAL article grounded in real, current information. Do not fabricate facts.
- Calibrate sentence length and complexity to the grade level.
- Make it genuinely interesting. Strong opening that hooks the reader.
- Short paragraphs (2-4 sentences each).
- Age-appropriate content.
- EDITORIAL NEUTRALITY: Report facts, not opinions. For any topic with political adjacency, present the what without editorializing the why. Never present contested claims as settled. If multiple perspectives exist, acknowledge them neutrally. The goal is to inform and spark curiosity, not to prescribe a position.

Output format:
[ARTICLE]
{
  "title": "Article title",
  "topic": "Topic tag",
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
    return {
      title: parsed.title,
      topic: parsed.topic,
      bodyText: parsed.body,
      sources: parsed.sources || [source],
      estimatedReadTime: parsed.estimated_read_time_minutes || 3,
    };
  } catch (e) {
    console.error("Failed to parse article:", e);
    return null;
  }
}

async function adaptArticleToLevel(
  baseTitle: string,
  baseBody: string,
  baseSources: string[],
  targetLevel: number
): Promise<{ title: string; bodyText: string; estimatedReadTime: number } | null> {
  const guide = levelGuide[targetLevel];
  
  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Adapt this article to a different reading level. Keep the same facts and story, but adjust vocabulary, sentence complexity, and length.

Original article:
Title: ${baseTitle}
---
${baseBody}
---

Target reading level: ${targetLevel} (Lexile ${guide.lexile}, Grade ${guide.grade})
Target length: ${guide.words} words

VOCABULARY RULES: ${guide.vocab}

Rules:
- Keep the same title (or simplify slightly for lower levels)
- Keep all key facts accurate
- Adjust sentence length and vocabulary to match the target grade
- Short paragraphs (2-4 sentences)
- For lower levels: shorter sentences, simpler words, fewer details
- For higher levels: more detail, complex structures, richer vocabulary

Output ONLY JSON:
{
  "title": "Article title (may be same or simplified)",
  "body": "The adapted article text.",
  "estimated_read_time_minutes": ${targetLevel <= 2 ? 2 : targetLevel <= 4 ? 3 : 4}
}`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      title: parsed.title || baseTitle,
      bodyText: parsed.body,
      estimatedReadTime: parsed.estimated_read_time_minutes || 3,
    };
  } catch (e) {
    console.error("Failed to parse adaptation:", e);
    return null;
  }
}

async function getActiveStudents(): Promise<Student[]> {
  const students = await sql`
    SELECT id, name, reading_level, interest_profile, daily_article_cap
    FROM students
    WHERE onboarding_complete = true AND reading_level IS NOT NULL
  `;
  return students as Student[];
}

async function getStudentUnreadCount(studentId: number): Promise<number> {
  const result = await sql`
    SELECT COUNT(*) as count FROM articles
    WHERE student_id = ${studentId} AND read = false
  `;
  return parseInt(result[0].count);
}

async function getStudentSeenTitles(studentId: number): Promise<Set<string>> {
  const history = await sql`
    SELECT article_title FROM student_article_history
    WHERE student_id = ${studentId}
  `;
  return new Set(history.map((h: any) => h.article_title));
}

async function getAvailableCacheArticles(level: number, date: string): Promise<CachedArticle[]> {
  // Get articles from today's batch + any recent unfilled articles
  const articles = await sql`
    SELECT * FROM article_cache
    WHERE reading_level = ${level}
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return articles as CachedArticle[];
}

async function serveArticlesToStudent(
  student: Student,
  cacheArticles: CachedArticle[],
  seenTitles: Set<string>,
  count: number
): Promise<number> {
  const unseen = cacheArticles.filter(a => !seenTitles.has(a.title));
  const toServe = unseen.slice(0, count);
  
  let served = 0;
  for (const cached of toServe) {
    // Insert into student's articles
    await sql`
      INSERT INTO articles (student_id, title, topic, body_text, reading_level, sources, estimated_read_time, category, source_cache_id)
      VALUES (${student.id}, ${cached.title}, ${cached.topic}, ${cached.body_text}, ${cached.reading_level}, 
              ${JSON.stringify(cached.sources)}, ${cached.estimated_read_time}, ${cached.category}, ${cached.id})
    `;
    
    // Track in history
    await sql`
      INSERT INTO student_article_history (student_id, article_cache_id, article_title)
      VALUES (${student.id}, ${cached.id}, ${cached.title})
    `;
    
    served++;
  }
  
  return served;
}

async function run() {
  const today = new Date().toISOString().split("T")[0];
  console.log(`\n🌅 Morning Article Batch — ${today}\n`);
  
  // Step 1: Get active students and determine which levels we need
  const students = await getActiveStudents();
  console.log(`📚 ${students.length} active students`);
  
  if (students.length === 0) {
    console.log("No active students. Skipping batch.");
    return;
  }
  
  // Determine which reading levels are needed
  const levelsNeeded = new Set(students.map(s => s.reading_level));
  console.log(`📊 Reading levels needed: ${[...levelsNeeded].sort().join(", ")}`);
  
  // Step 2: Check existing buffer — how many new articles do we actually need?
  let totalArticlesNeeded = 0;
  const studentNeeds: { student: Student; needed: number }[] = [];
  
  for (const student of students) {
    const unreadCount = await getStudentUnreadCount(student.id);
    const needed = Math.max(0, BUFFER_TARGET - unreadCount);
    if (needed > 0) {
      studentNeeds.push({ student, needed });
      totalArticlesNeeded += needed;
    }
  }
  
  console.log(`📦 Total articles needed across all students: ${totalArticlesNeeded}`);
  
  if (totalArticlesNeeded === 0) {
    console.log("All students have full buffers. Skipping generation.");
    return;
  }
  
  // Step 3: Get today's news headlines
  const headlines = await getNewsHeadlines();
  console.log(`📰 Got ${headlines.length} news headlines`);
  
  // We'll generate articles from these headlines
  // Target: enough articles per level to fill all student buffers
  const articlesPerLevel = Math.ceil(totalArticlesNeeded / levelsNeeded.size / students.length * 15);
  const targetArticles = Math.min(headlines.length, Math.max(6, articlesPerLevel));
  
  console.log(`🎯 Generating ${targetArticles} base articles\n`);
  
  // Step 4: Generate base articles at L4
  const baseArticles: { title: string; topic: string; bodyText: string; sources: string[]; estimatedReadTime: number; headlineSource: string }[] = [];
  
  for (let i = 0; i < targetArticles && i < headlines.length; i++) {
    const headline = headlines[i];
    console.log(`  ✍️  Generating [${i + 1}/${targetArticles}]: ${headline.topic.substring(0, 60)}...`);
    
    const article = await generateBaseArticle(headline.topic, headline.source);
    if (article) {
      baseArticles.push({ ...article, headlineSource: headline.source });
      console.log(`     ✅ "${article.title}"`);
    } else {
      console.log(`     ❌ Failed to generate`);
    }
  }
  
  console.log(`\n📝 Generated ${baseArticles.length} base articles\n`);
  
  // Step 5: Insert base articles and adapt to needed levels
  for (const base of baseArticles) {
    // Insert base article at L4
    const [inserted] = await sql`
      INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, generated_date, headline_source)
      VALUES (${base.title}, ${base.topic}, ${base.bodyText}, ${BASE_LEVEL}, ${JSON.stringify(base.sources)}, ${base.estimatedReadTime}, 'news', ${today}, ${base.headlineSource})
      RETURNING id
    `;
    const baseId = inserted.id;
    
    // Adapt to each needed level (skip BASE_LEVEL since we already have it)
    for (const level of levelsNeeded) {
      if (level === BASE_LEVEL) continue;
      
      console.log(`  📐 Adapting "${base.title}" to L${level}...`);
      const adapted = await adaptArticleToLevel(base.title, base.bodyText, base.sources, level);
      
      if (adapted) {
        await sql`
          INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, base_article_id, generated_date, headline_source)
          VALUES (${adapted.title}, ${base.topic}, ${adapted.bodyText}, ${level}, ${JSON.stringify(base.sources)}, ${adapted.estimatedReadTime}, 'news', ${baseId}, ${today}, ${base.headlineSource})
        `;
        console.log(`     ✅ L${level}`);
      } else {
        console.log(`     ❌ L${level} adaptation failed`);
      }
    }
  }
  
  // Step 6: Fill student buffers from the cache
  console.log(`\n📬 Serving articles to students...\n`);
  
  for (const { student, needed } of studentNeeds) {
    const seenTitles = await getStudentSeenTitles(student.id);
    const available = await getAvailableCacheArticles(student.reading_level, today);
    const served = await serveArticlesToStudent(student, available, seenTitles, needed);
    console.log(`  ${student.name} (L${student.reading_level}): served ${served}/${needed} articles`);
  }
  
  console.log(`\n✅ Morning batch complete!\n`);
}

run().catch(console.error);
