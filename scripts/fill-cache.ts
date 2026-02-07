import { db, schema } from "../src/lib/db";
import { sql, eq, and } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { articleGenerationPrompt } from "../src/lib/prompts";

const anthropic = new Anthropic();
const TARGET_PER_LEVEL_PER_CAT = 4;

const NEWS_TOPICS = [
  "A recent scientific discovery",
  "A recent space exploration milestone",
  "A recent environmental or climate event",
  "A recent technology innovation",
  "A recent sports achievement",
  "A recent wildlife or animal discovery",
];

const GENERAL_TOPICS = [
  "An amazing animal adaptation or ability",
  "A young person who achieved something remarkable",
  "How a common technology works (phones, Wi-Fi, etc)",
  "An unsolved mystery from history",
  "An extreme weather event and why it happens",
  "A strange or unusual place on Earth",
];

async function generateArticle(level: number, topic: string, category: string) {
  const type = category === "news" ? "news" : "interest_matched";
  const prompt = articleGenerationPrompt(level, topic, type);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  
  // Try multiple parse strategies
  const match1 = text.match(/\[ARTICLE\]\s*```(?:json)?\s*([\s\S]*?)```/);
  const match2 = text.match(/\[ARTICLE\]\s*(\{[\s\S]*\})/);
  const match3 = text.match(/```json\s*([\s\S]*?)```/);
  
  const raw = match1?.[1] || match2?.[1] || match3?.[1];
  if (!raw) return null;

  try {
    const article = JSON.parse(raw);
    const wordCount = (article.body || "").split(/\s+/).length;
    return { ...article, wordCount };
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== Filling Article Cache Gaps ===\n");

  let added = 0;
  let failed = 0;

  for (const [category, topics] of [["news", NEWS_TOPICS], ["general", GENERAL_TOPICS]] as const) {
    for (let level = 1; level <= 6; level++) {
      // Check current count
      const existing = await db.select().from(schema.articleCache)
        .where(and(
          eq(schema.articleCache.readingLevel, level),
          eq(schema.articleCache.category, category)
        ));
      
      const needed = TARGET_PER_LEVEL_PER_CAT - existing.length;
      if (needed <= 0) {
        console.log(`L${level} ${category}: ${existing.length} exists, skip`);
        continue;
      }

      console.log(`L${level} ${category}: ${existing.length} exists, need ${needed} more`);

      for (let i = 0; i < needed; i++) {
        const topic = topics[(existing.length + i) % topics.length];
        const article = await generateArticle(level, topic, category);
        
        if (article) {
          await db.insert(schema.articleCache).values({
            title: article.title,
            topic: article.topic,
            bodyText: article.body,
            readingLevel: level,
            sources: article.sources || [],
            estimatedReadTime: level <= 2 ? 2 : level <= 4 ? 3 : 4,
            category,
          });
          added++;
          console.log(`  ✓ L${level} "${article.title}" (${article.wordCount} words)`);
        } else {
          failed++;
          console.log(`  ✗ Failed: L${level} "${topic}"`);
        }
        
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }

  console.log(`\n=== Done! Added ${added}, failed ${failed} ===`);
  
  // Final count
  const total = await db.select().from(schema.articleCache);
  console.log(`Total cache: ${total.length} articles`);
  process.exit(0);
}

main().catch(console.error);
