export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { batchPlannerPrompt, articleGenerationPrompt } from "@/lib/prompts";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, session.userId)).limit(1);
  if (!student || !student.readingLevel || !student.interestProfile) {
    return NextResponse.json({ error: "Onboarding not complete" }, { status: 400 });
  }

  const existingArticles = await db.select({ title: schema.articles.title })
    .from(schema.articles).where(eq(schema.articles.studentId, student.id));

  const count = 3; // Generate 3 at a time for speed
  const interests = JSON.stringify(student.interestProfile);

  // Step 1: Plan the batch (fast model)
  const planResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: batchPlannerPrompt(student.readingLevel, interests, existingArticles.map(a => a.title), count) }],
  });

  const planText = planResponse.content[0].type === "text" ? planResponse.content[0].text : "";
  const batchMatch = planText.match(/\[BATCH\]\s*(\[[\s\S]*?\])/);
  if (!batchMatch) return NextResponse.json({ error: "Failed to plan articles" }, { status: 500 });

  let topics: { topic: string; type: string }[];
  try {
    topics = JSON.parse(batchMatch[1]);
  } catch {
    return NextResponse.json({ error: "Failed to parse article plan" }, { status: 500 });
  }

  // Step 2: Generate articles in parallel (Sonnet for quality + speed)
  const results = await Promise.allSettled(
    topics.slice(0, count).map(async (t) => {
      const artResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: articleGenerationPrompt(student.readingLevel || 2, t.topic, t.type) }],
      });

      const artText = artResponse.content[0].type === "text" ? artResponse.content[0].text : "";
      const articleMatch = artText.match(/\[ARTICLE\]\s*(\{[\s\S]*\})/);
      if (!articleMatch) throw new Error("No article in response");

      const article = JSON.parse(articleMatch[1]);
      const [inserted] = await db.insert(schema.articles).values({
        studentId: student.id,
        title: article.title,
        topic: article.topic,
        bodyText: article.body,
        readingLevel: student.readingLevel || 2,
        sources: article.sources || [],
        estimatedReadTime: article.estimated_read_time_minutes || 4,
      }).returning();

      return inserted;
    })
  );

  const generated = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map(r => r.value);

  return NextResponse.json({ generated: generated.length, articles: generated });
}
