export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { MODELS } from "@/lib/models";
import Anthropic from "@anthropic-ai/sdk";
import { INTEREST_INTERVIEW, READING_LEVEL_ASSESSMENT } from "@/lib/prompts";
import { normalizeInterestProfile } from "@/lib/normalize-interests";
import { gradeToReadingLevel } from "@/lib/grade-to-level";
import { getWelcomeArticle } from "@/lib/welcome-article";

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
    model: MODELS.standard,
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
      // Map grade level to initial reading level (calibrated from first session)
      const level = gradeToReadingLevel(student?.gradeLevel);
      await db.update(schema.students)
        .set({
          interestProfile: profile,
          readingLevel: level,
          onboardingComplete: true,
        })
        .where(eq(schema.students.id, session.userId));

      // Insert welcome tutorial article only if one doesn't already exist
      // (prevents duplicates on account reset + re-onboarding).
      const welcome = getWelcomeArticle(level);
      const existing = await db
        .select({ id: schema.articles.id })
        .from(schema.articles)
        .where(
          and(
            eq(schema.articles.studentId, session.userId),
            eq(schema.articles.category, "tutorial")
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(schema.articles).values({
          studentId: session.userId,
          title: welcome.title,
          topic: welcome.topic,
          bodyText: welcome.bodyText,
          readingLevel: level,
          sources: [],
          estimatedReadTime: welcome.estimatedReadTime,
          category: welcome.category,
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
