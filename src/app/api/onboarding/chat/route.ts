export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { INTEREST_INTERVIEW, READING_LEVEL_ASSESSMENT } from "@/lib/prompts";
import { normalizeInterestProfile } from "@/lib/normalize-interests";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, phase } = await req.json(); // phase: "interest" | "level"

  // Get student name for personalization
  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, session.userId)).limit(1);
  const studentName = student?.name || "there";

  const systemPrompt = (phase === "interest" ? INTEREST_INTERVIEW : READING_LEVEL_ASSESSMENT)
    + `\n\nThe student's name is ${studentName}.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    system: systemPrompt,
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const assistantText = response.content[0].type === "text" ? response.content[0].text : "";

  // Check if interest profile is complete
  const profileMatch = assistantText.match(/\[PROFILE\]\s*(\{[\s\S]*?\})/);
  if (profileMatch) {
    try {
      const profile = normalizeInterestProfile(JSON.parse(profileMatch[1]));
      // Save profile, set default reading level 2 (grade 5-6), mark onboarding complete
      // Reading level will be calibrated from their first comprehension session
      await db.update(schema.students)
        .set({
          interestProfile: profile,
          readingLevel: 2,
          onboardingComplete: true,
        })
        .where(eq(schema.students.id, session.userId));

      // Pre-fill articles immediately so there's no delay on first page load
      const level = 2;
      const { sql: sqlTag } = await import("drizzle-orm");
      const cached = await db.select().from(schema.articleCache)
        .where(eq(schema.articleCache.readingLevel, level))
        .orderBy(sqlTag`RANDOM()`)
        .limit(12); // Buffer of 12

      for (const c of cached) {
        await db.insert(schema.articles).values({
          studentId: session.userId,
          title: c.title,
          topic: c.topic,
          bodyText: c.bodyText,
          readingLevel: level,
          sources: c.sources || [],
          estimatedReadTime: c.estimatedReadTime || 4,
          category: c.category || "general",
          sourceCacheId: c.id,
        });
        await db.insert(schema.studentArticleHistory).values({
          studentId: session.userId,
          articleCacheId: c.id,
          articleTitle: c.title,
        });
      }

      return NextResponse.json({
        message: assistantText.replace(/\[PROFILE\][\s\S]*/, "").trim(),
        profileComplete: true,
        profile,
      });
    } catch {
      // Parse failed, continue conversation
    }
  }

  return NextResponse.json({ message: assistantText });
}
