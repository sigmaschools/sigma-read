export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { comprehensionConversationPrompt, comprehensionReportPrompt } from "@/lib/prompts";

const anthropic = new Anthropic();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const conversationId = parseInt(id);
  const { message } = await req.json();

  // Get conversation
  const [conversation] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conversationId)).limit(1);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get reading session + article + student
  const [readingSession] = await db.select().from(schema.readingSessions).where(eq(schema.readingSessions.id, conversation.readingSessionId)).limit(1);
  const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, readingSession.articleId)).limit(1);
  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, session.userId)).limit(1);

  // Build messages
  const messages = [...(conversation.messages || [])];
  messages.push({ role: "user", content: message });

  // Get AI response
  const systemPrompt = comprehensionConversationPrompt(
    article.bodyText,
    student.readingLevel || 2,
    JSON.stringify(student.interestProfile || {})
  );

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  });

  const assistantText = response.content[0].type === "text" ? response.content[0].text : "";
  const isComplete = assistantText.includes("[CONVERSATION_COMPLETE]");
  const cleanText = assistantText.replace("[CONVERSATION_COMPLETE]", "").trim();

  messages.push({ role: "assistant", content: cleanText });

  // Save updated messages
  await db.update(schema.conversations).set({
    messages,
    complete: isComplete,
  }).where(eq(schema.conversations.id, conversationId));

  // If complete, generate report
  if (isComplete) {
    await db.update(schema.readingSessions).set({ completedAt: new Date() }).where(eq(schema.readingSessions.id, readingSession.id));

    // Generate comprehension report
    const transcript = messages.map(m => `${m.role === "user" ? "Student" : "AI"}: ${m.content}`).join("\n\n");
    const reportResponse = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: comprehensionReportPrompt(article.bodyText, transcript, student.readingLevel || 2),
      }],
    });

    const reportText = reportResponse.content[0].type === "text" ? reportResponse.content[0].text : "";
    const reportMatch = reportText.match(/\[REPORT\]\s*(\{[\s\S]*?\})/);
    if (reportMatch) {
      try {
        const report = JSON.parse(reportMatch[1]);
        await db.insert(schema.comprehensionReports).values({
          conversationId,
          score: report.score,
          rating: report.rating,
          understood: report.understood,
          missed: report.missed,
          engagementNote: report.engagement,
        });

        // Calibrate reading level based on comprehension score
        // Score 85+: move up, Score <40: move down, 40-55: move down one, otherwise stay
        const currentLevel = student.readingLevel || 2;
        let newLevel = currentLevel;
        if (report.score >= 85 && currentLevel < 4) newLevel = currentLevel + 1;
        else if (report.score < 40 && currentLevel > 1) newLevel = Math.max(1, currentLevel - 1);
        else if (report.score < 55 && currentLevel > 1) newLevel = currentLevel - 1;

        if (newLevel !== currentLevel) {
          await db.update(schema.students)
            .set({ readingLevel: newLevel })
            .where(eq(schema.students.id, session.userId));
        }
      } catch (e) {
        console.error("Report parse error:", e);
      }
    }
  }

  return NextResponse.json({ message: cleanText, complete: isComplete });
}
