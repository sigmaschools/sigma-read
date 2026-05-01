/**
 * One-off script: Backfill L3 adaptations for diverse article_cache entries,
 * then serve Max (student_id=13) fresh articles from those entries.
 *
 * Run with: DATABASE_URL="..." ANTHROPIC_API_KEY="..." npx tsx scripts/backfill-l3-for-max.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const SONNET_MODEL = "claude-sonnet-4-5";

const sql = neon(DATABASE_URL);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const DOMINANT_TOPICS = [
  "Fishing History",
  "Space Exploration",
  "AI Technology",
  "Artificial Intelligence",
  "Space Technology",
  "Marine Biology Education",
  "Marine Biology",
  "Marine Biology Journal",
  "Marine Science Education",
];

const levelGuide: Record<number, { lexile: string; grade: string; words: string; vocab: string }> = {
  1: { lexile: "~400-500", grade: "2-3", words: "100-200", vocab: "Use simple, common words. Short sentences (5-10 words). Define any topic word in the same sentence." },
  2: { lexile: "~550-650", grade: "3-4", words: "200-300", vocab: "Mostly common words. At most 1-2 topic-specific words per paragraph, explained in context." },
  3: { lexile: "~700-800", grade: "5-6", words: "300-400", vocab: "At most 2-3 challenging words per paragraph. Each one defined or contextually clear." },
  4: { lexile: "~850-950", grade: "7", words: "400-500", vocab: "Domain vocabulary with context clues. Avoid stacking multiple technical terms in one sentence." },
};

async function adaptArticleToLevel(
  baseTitle: string, baseBody: string, targetLevel: number,
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

const MAX_STUDENT_ID = 13;

async function main() {
  // ─── Step 1: Backfill L3 adaptations for diverse L4 bases missing them ─────
  console.log("🔍 Finding diverse L4 base articles without L3 adaptations...\n");

  const bases = await sql`
    SELECT ac.*
    FROM article_cache ac
    WHERE ac.flagged = false
      AND ac.reading_level = 4
      AND ac.base_article_id IS NULL
      AND ac.topic NOT IN (${DOMINANT_TOPICS[0]}, ${DOMINANT_TOPICS[1]}, ${DOMINANT_TOPICS[2]}, ${DOMINANT_TOPICS[3]}, ${DOMINANT_TOPICS[4]}, ${DOMINANT_TOPICS[5]}, ${DOMINANT_TOPICS[6]}, ${DOMINANT_TOPICS[7]}, ${DOMINANT_TOPICS[8]})
      AND NOT EXISTS (
        SELECT 1 FROM article_cache child
        WHERE child.base_article_id = ac.id AND child.reading_level = 3
      )
    ORDER BY ac.created_at DESC
  `;

  const newL3Ids: number[] = [];

  if (bases.length > 0) {
    console.log(`Found ${bases.length} L4 base articles needing L3 adaptation:\n`);
    for (const b of bases) {
      console.log(`  [${b.id}] ${b.topic}: "${b.title}"`);
    }

    for (let i = 0; i < bases.length; i++) {
      const base = bases[i];
      console.log(`\n✍️  [${i + 1}/${bases.length}] Adapting "${base.title}" → L3...`);

      const adapted = await adaptArticleToLevel(base.title, base.body_text, 3);
      if (!adapted) {
        console.log(`  ❌ Failed to adapt`);
        continue;
      }

      const [inserted] = await sql`
        INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category, base_article_id, generated_date, flagged)
        VALUES (${adapted.title}, ${base.topic}, ${adapted.bodyText}, 3, ${JSON.stringify(base.sources || [])}, ${adapted.estimatedReadTime}, ${base.category}, ${base.id}, ${base.generated_date}, false)
        RETURNING id
      `;
      newL3Ids.push(inserted.id);
      console.log(`  ✅ Inserted article_cache id=${inserted.id}`);
    }

    console.log(`\n📝 Created ${newL3Ids.length} L3 adaptations.\n`);
  } else {
    console.log("All diverse L4 bases already have L3 adaptations. No backfill needed.\n");
  }

  // ─── Step 2: Mark Max's current unread articles as read ────────────────────
  const marked = await sql`
    UPDATE articles SET read = true WHERE student_id = ${MAX_STUDENT_ID} AND read = false RETURNING id
  `;
  console.log(`📖 Marked ${marked.length} of Max's unread articles as read.\n`);

  // ─── Step 3: Serve Max up to 10 diverse L3 articles ────────────────────────
  const history = await sql`SELECT article_title FROM student_article_history WHERE student_id = ${MAX_STUDENT_ID}`;
  const seen = new Set(history.map((h: any) => h.article_title));

  // Prefer newly generated L3 articles, fall back to any unseen diverse L3
  let candidates: any[] = [];

  if (newL3Ids.length > 0) {
    candidates = await sql`
      SELECT * FROM article_cache WHERE id = ANY(${newL3Ids}) AND flagged = false
    `;
  }

  // If we didn't generate enough new ones, also look for existing diverse L3 articles Max hasn't seen
  if (candidates.filter(a => !seen.has(a.title)).length < 10) {
    const existing = await sql`
      SELECT * FROM article_cache
      WHERE reading_level = 3 AND flagged = false
        AND topic NOT IN (${DOMINANT_TOPICS[0]}, ${DOMINANT_TOPICS[1]}, ${DOMINANT_TOPICS[2]}, ${DOMINANT_TOPICS[3]}, ${DOMINANT_TOPICS[4]}, ${DOMINANT_TOPICS[5]}, ${DOMINANT_TOPICS[6]}, ${DOMINANT_TOPICS[7]}, ${DOMINANT_TOPICS[8]})
      ORDER BY created_at DESC
    `;
    // Merge, avoiding duplicates
    const existingIds = new Set(candidates.map(c => c.id));
    for (const e of existing) {
      if (!existingIds.has(e.id)) candidates.push(e);
    }
  }

  // If still not enough, include any unseen L3 articles (even dominant topics)
  if (candidates.filter(a => !seen.has(a.title)).length < 10) {
    const all = await sql`
      SELECT * FROM article_cache
      WHERE reading_level = 3 AND flagged = false
      ORDER BY created_at DESC
    `;
    const existingIds = new Set(candidates.map(c => c.id));
    for (const a of all) {
      if (!existingIds.has(a.id)) candidates.push(a);
    }
  }

  const unseen = candidates.filter((a: any) => !seen.has(a.title));
  const toServe = unseen.slice(0, 10);

  if (toServe.length === 0) {
    console.log("⚠️  No unseen L3 articles available for Max. Cache is exhausted.");
    console.log("   The morning-batch topic diversity fix (Task 2) will generate fresh diverse articles going forward.");
    return;
  }

  console.log(`📬 Serving ${toServe.length} articles to Max...\n`);

  for (const a of toServe) {
    await sql`
      INSERT INTO articles (student_id, title, topic, body_text, reading_level, sources, estimated_read_time, category, source_cache_id)
      VALUES (${MAX_STUDENT_ID}, ${a.title}, ${a.topic}, ${a.body_text}, ${a.reading_level}, ${JSON.stringify(a.sources || [])}, ${a.estimated_read_time}, ${a.category}, ${a.id})
    `;
    await sql`
      INSERT INTO student_article_history (student_id, article_cache_id, article_title)
      VALUES (${MAX_STUDENT_ID}, ${a.id}, ${a.title})
    `;
    console.log(`  ✅ "${a.title}" (${a.topic})`);
  }

  console.log(`\n🎉 Done! Served ${toServe.length} articles to Max.`);
}

main().catch(console.error);
