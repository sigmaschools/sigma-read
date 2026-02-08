export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, desc, and, ne } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { comprehensionConversationPrompt, comprehensionReportPrompt, pickConversationStyle } from "@/lib/prompts";

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

  // Handle resume check — return existing messages if any
  if (message === "__resume_check__") {
    const existing = conversation.messages || [];
    if (existing.length > 0) {
      return NextResponse.json({
        existingMessages: existing,
        complete: conversation.complete,
      });
    }
    // No existing messages — fall through to generate opener
  }

  // Build messages (with timestamps)
  const messages = [...(conversation.messages || [])];
  const now = new Date().toISOString();
  if (message !== "__resume_check__") {
    messages.push({ role: "user", content: message, timestamp: now });
  } else {
    // Resume check with no messages — generate opener with a synthetic first message
    messages.push({ role: "user", content: "I just finished reading the article.", timestamp: now });
  }

  // Safety backstop — force wrap-up after 8 student messages (generous limit, AI should wrap up naturally well before this)
  const studentMessageCount = messages.filter(m => m.role === "user").length;
  const forceComplete = studentMessageCount >= 8;

  // Fetch previous articles for cross-article connections (last 5 read articles, excluding current)
  const previousArticles = await db.select({ title: schema.articles.title, topic: schema.articles.topic })
    .from(schema.articles)
    .where(and(
      eq(schema.articles.studentId, session.userId),
      eq(schema.articles.read, true),
      ne(schema.articles.id, article.id)
    ))
    .orderBy(desc(schema.articles.createdAt))
    .limit(5);

  // Pick conversation style once per conversation, reuse on subsequent messages
  const conversationStyle = conversation.conversationStyle || pickConversationStyle();

  // Get AI response
  const systemPrompt = comprehensionConversationPrompt(
    article.bodyText,
    student.readingLevel || 2,
    JSON.stringify(student.interestProfile || {}),
    previousArticles.length > 0 ? previousArticles : undefined,
    article.liked,
    conversationStyle
  );

  // If we're at the hard limit, append instruction to force wrap-up
  const aiMessages = messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
  if (forceComplete) {
    aiMessages.push({ role: "user" as const, content: "[SYSTEM: This is the student's final response. Wrap up now with brief positive feedback and output [CONVERSATION_COMPLETE].]" });
    // Remove the injected system message from saved transcript
    aiMessages.pop();
  }

  const finalMessages = forceComplete
    ? [...messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })), { role: "user" as const, content: "[SYSTEM: This is the student's final response. Wrap up now with brief positive feedback and output [CONVERSATION_COMPLETE].]" }]
    : messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: finalMessages,
  });

  const assistantText = response.content[0].type === "text" ? response.content[0].text : "";
  const isComplete = assistantText.includes("[CONVERSATION_COMPLETE]") || forceComplete;
  const cleanText = assistantText.replace("[CONVERSATION_COMPLETE]", "").trim();

  messages.push({ role: "assistant", content: cleanText, timestamp: new Date().toISOString() });

  // Save updated messages and conversation style
  const updateData: any = { messages, complete: isComplete };
  if (!conversation.conversationStyle) {
    updateData.conversationStyle = conversationStyle;
  }
  await db.update(schema.conversations).set(updateData).where(eq(schema.conversations.id, conversationId));

  // If complete, mark article as read, save summary, and generate report
  if (isComplete) {
    // Store a brief summary for cross-article connections
    const summaryText = `${article.title}: ${article.topic}`;
    await db.update(schema.articles).set({ read: true, summary: summaryText }).where(eq(schema.articles.id, article.id));
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

        // Compute conversation analytics
        const aiMessages = messages.filter(m => m.role === "assistant");
        const studentMessages = messages.filter(m => m.role === "user");
        const wordCount = (text: string) => text.split(/\s+/).filter(w => w.length > 0).length;
        const aiAvgWords = aiMessages.length > 0 ? Math.round(aiMessages.reduce((sum, m) => sum + wordCount(m.content), 0) / aiMessages.length) : 0;
        const studentAvgWords = studentMessages.length > 0 ? Math.round(studentMessages.reduce((sum, m) => sum + wordCount(m.content), 0) / studentMessages.length) : 0;
        // Count redirections: "actually", "take a look", "take another look", "close, but", "not quite"
        const redirectPatterns = /\b(actually|take a look|take another look|close,? but|not quite|if you look at the article)\b/gi;
        const redirectCount = aiMessages.reduce((count, m) => count + (m.content.match(redirectPatterns) || []).length, 0);
        const exchangeCount = studentMessages.length;

        await db.insert(schema.comprehensionReports).values({
          conversationId,
          score: report.score,
          rating: report.rating,
          understood: report.understood,
          missed: report.missed,
          engagementNote: report.engagement,
          aiAvgWords,
          studentAvgWords,
          redirectCount,
          exchangeCount,
        });

        // Gradual Mix Level Progression — evaluate and apply
        const { evaluateProgression, applyProgressionResult } = await import("@/lib/level-progression");
        const progressionResult = await evaluateProgression(session.userId);
        if (progressionResult.action !== "none") {
          await applyProgressionResult(session.userId, progressionResult);
          console.log(`Level progression [${student.name}]: ${progressionResult.action}`, 
            progressionResult.newLevel ? `→ L${progressionResult.newLevel}` : "",
            progressionResult.alertMessage || "");
        }
      } catch (e) {
        console.error("Report parse error:", e);
      }
    }
  }

  return NextResponse.json({ message: cleanText, complete: isComplete });
}
