import { db, schema } from "../src/lib/db";
import { sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { articleGenerationPrompt } from "../src/lib/prompts";

const anthropic = new Anthropic();

// Generate 4 articles per level per category (news + general) = 48 total
const ARTICLES_PER_LEVEL = 4;
const LEVELS = [1, 2, 3, 4, 5, 6];
const CATEGORIES: Array<{ category: string; topics: string[] }> = [
  {
    category: "news",
    topics: [
      "A recent scientific discovery",
      "A recent space exploration milestone",
      "A recent environmental or climate event",
      "A recent technology innovation",
      "A recent sports achievement or record",
      "A recent animal or wildlife story",
    ],
  },
  {
    category: "general",
    topics: [
      "An amazing animal adaptation",
      "A young person who did something remarkable",
      "How an everyday technology works",
      "A mystery from history",
      "An extreme weather phenomenon",
      "An unusual place on Earth",
    ],
  },
];

async function generateArticle(level: number, topic: string, category: string): Promise<{
  title: string;
  topic: string;
  bodyText: string;
  readingLevel: number;
  sources: string[];
  estimatedReadTime: number;
  category: string;
} | null> {
  const type = category === "news" ? "news" : "interest_matched";
  const prompt = articleGenerationPrompt(level, topic, type);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    // Try multiple parse strategies
    let article: any = null;
    
    // Strategy 1: [ARTICLE] tag followed by JSON
    const match1 = text.match(/\[ARTICLE\]\s*```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    const match2 = text.match(/\[ARTICLE\]\s*(\{[\s\S]*\})/);
    // Strategy 3: Just find the JSON object with title/body
    const match3 = text.match(/(\{[^{}]*"title"[\s\S]*?"body"[\s\S]*?\})\s*$/);
    
    const matchStr = match1?.[1] || match2?.[1] || match3?.[1];
    
    if (!matchStr) {
      console.error(`  ✗ Failed to parse article for L${level} "${topic}"`);
      return null;
    }

    try {
      article = JSON.parse(matchStr);
    } catch {
      // Try cleaning up the JSON
      try {
        const cleaned = matchStr.replace(/,\s*}/, '}').replace(/\n/g, '\\n');
        article = JSON.parse(cleaned);
      } catch {
        console.error(`  ✗ JSON parse failed for L${level} "${topic}"`);
        return null;
      }
    }
    
    // Verify word count
    const wordCount = article.body.split(/\s+/).length;
    console.log(`  ✓ L${level} "${article.title}" (${wordCount} words)`);

    return {
      title: article.title,
      topic: article.topic,
      bodyText: article.body,
      readingLevel: level,
      sources: article.sources || [],
      estimatedReadTime: article.estimated_read_time_minutes || (level <= 2 ? 2 : level <= 4 ? 3 : 4),
      category,
    };
  } catch (e: any) {
    console.error(`  ✗ Error generating L${level} "${topic}": ${e.message}`);
    return null;
  }
}

async function main() {
  console.log("=== Regenerating Article Cache ===\n");

  // Don't clear — add to existing cache
  console.log("Adding to existing cache...\n");

  let total = 0;
  let failed = 0;

  for (const cat of CATEGORIES) {
    console.log(`\n--- ${cat.category.toUpperCase()} ARTICLES ---`);
    
    for (const level of LEVELS) {
      console.log(`\nLevel ${level}:`);
      
      // Pick topics for this level (rotate through available topics)
      for (let i = 0; i < ARTICLES_PER_LEVEL; i++) {
        const topic = cat.topics[i % cat.topics.length];
        const article = await generateArticle(level, topic, cat.category);
        
        if (article) {
          await db.insert(schema.articleCache).values(article);
          total++;
        } else {
          failed++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  console.log(`\n=== Done! ${total} articles cached, ${failed} failed ===`);
  process.exit(0);
}

main().catch(console.error);
