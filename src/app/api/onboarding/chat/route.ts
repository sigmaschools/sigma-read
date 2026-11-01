export const dynamic = "force-dynamic";
// The starter articles keep running after the response (see after() below); writing one takes a minute or two
export const maxDuration = 300;
import { NextRequest, NextResponse, after } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { MODELS } from "@/lib/models";
import Anthropic from "@anthropic-ai/sdk";
import { tracked } from "@/lib/ai-usage";
import { INTEREST_INTERVIEW, READING_LEVEL_ASSESSMENT } from "@/lib/prompts";
import { normalizeInterestProfile } from "@/lib/normalize-interests";
import { gradeToReadingLevel } from "@/lib/grade-to-level";
import { quietly, recordDeclaredInterests } from "@/lib/interest-graph";
import { markStarterPending, prepareStarterArticles } from "@/lib/starter-articles";

/** The interest chat ends after this many student answers, profile or not */
const MAX_STUDENT_ANSWERS = 3;

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, phase } = await req.json(); // phase: "interest" | "level"

  // Get student name for personalization
  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, session.userId)).limit(1);
  const studentName = student?.name || "there";

  // The page opens the chat with a "Hi" the student never typed, so it isn't an answer
  const answers = Math.max(0, messages.filter((m: { role: string }) => m.role === "user").length - 1);
  const lastAnswer = phase === "interest" && answers >= MAX_STUDENT_ANSWERS
    ? `\n\nThis was the student's last answer. Output the closing sentence and the [PROFILE] now, with whatever interests you have.`
    : "";
  const systemPrompt = (phase === "interest" ? INTEREST_INTERVIEW : READING_LEVEL_ASSESSMENT)
    + `\n\nThe student's name is ${studentName}.` + lastAnswer;

  let response;
  try {
    response = await tracked(anthropic, "onboarding", session.userId).messages.create({
      model: MODELS.standard,
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });
  } catch (e) {
    // Without this the route 500s with an empty body and the student sees a blank chat
    console.error("onboarding chat: Claude call failed", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 502 });
  }

  const assistantText = response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!assistantText.trim()) {
    console.error("onboarding chat: Claude returned no text", response.stop_reason);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 502 });
  }

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
      await quietly(recordDeclaredInterests(session.userId, profile.interests, "onboarding", { client: anthropic }), "onboarding interests");

      // Find or write their first articles while the tutorial cards play
      await markStarterPending(session.userId);
      after(() => prepareStarterArticles(session.userId, anthropic));

      return NextResponse.json({
        message: assistantText.replace(/\[PROFILE\][\s\S]*/, "").trim(),
        profileComplete: true,
        profile,
      });
    } catch (e) {
      // Parse failed: continue the conversation, without showing the student the broken profile
      console.error("onboarding chat: profile parse failed", e);
      return NextResponse.json({ message: assistantText.replace(/\[PROFILE\][\s\S]*/, "").trim() || "Tell me one more thing you like." });
    }
  }

  return NextResponse.json({ message: assistantText });
}
