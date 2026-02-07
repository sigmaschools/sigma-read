import { neon } from "@neondatabase/serverless";
import Anthropic from "@anthropic-ai/sdk";

const sql = neon(process.env.DATABASE_URL!);
const anthropic = new Anthropic();

const NEWS_TOPICS = [
  "A recent scientific discovery about space or animals",
  "A technology breakthrough that affects everyday life",
  "An interesting world record that was recently broken",
  "A young person who did something remarkable",
  "A surprising fact about how the human body works",
  "An unusual weather event or natural phenomenon",
];

async function generateArticle(topic: string, level: number): Promise<{
  title: string;
  topic: string;
  body: string;
  sources: string[];
  readTime: number;
} | null> {
  const levelDesc: Record<number, string> = {
    1: "~700 Lexile, grade 4. Short sentences, simple vocabulary, concrete examples.",
    2: "~850 Lexile, grade 5-6. Moderate vocabulary, some compound sentences.",
    3: "~1000 Lexile, grade 7. More complex vocabulary, longer passages, abstract concepts OK.",
    4: "~1150 Lexile, grade 8+. Advanced vocabulary, complex sentence structures, nuanced ideas.",
  };

  const prompt = `Write a short nonfiction article (400-600 words) about: ${topic}

Reading level: ${levelDesc[level]}

Make it genuinely interesting for a student at this level. Strong opening, concrete details.

Output ONLY valid JSON:
{"title": "...", "topic": "...", "body": "...", "sources": ["..."], "estimated_read_time_minutes": 3}`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const json = JSON.parse(text.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    return { title: json.title, topic: json.topic, body: json.body, sources: json.sources || [], readTime: json.estimated_read_time_minutes || 3 };
  } catch (e) {
    console.error(`Failed: ${topic} @ level ${level}:`, e);
    return null;
  }
}

async function main() {
  console.log("Generating news articles for cache...");

  // Generate each topic at levels 1-4 in parallel batches
  const tasks: { topic: string; level: number }[] = [];
  for (const topic of NEWS_TOPICS) {
    for (const level of [1, 2, 3, 4]) {
      tasks.push({ topic, level });
    }
  }

  // Process in batches of 4
  for (let i = 0; i < tasks.length; i += 4) {
    const batch = tasks.slice(i, i + 4);
    console.log(`Batch ${Math.floor(i / 4) + 1}/${Math.ceil(tasks.length / 4)}...`);

    const results = await Promise.all(
      batch.map(async ({ topic, level }) => {
        const article = await generateArticle(topic, level);
        if (!article) return null;
        return { ...article, level };
      })
    );

    for (const r of results) {
      if (!r) continue;
      await sql.query(
        `INSERT INTO article_cache (title, topic, body_text, reading_level, sources, estimated_read_time, category)
         VALUES ($1, $2, $3, $4, $5, $6, 'news')`,
        [r.title, r.topic, r.body, r.level, JSON.stringify(r.sources), r.readTime]
      );
      console.log(`  ✓ "${r.title}" (Level ${r.level})`);
    }
  }

  console.log("Done!");
}

main();
