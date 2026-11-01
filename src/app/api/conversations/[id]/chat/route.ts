export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, desc, and, ne } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { tracked } from "@/lib/ai-usage";
import { comprehensionConversationPrompt, coachingFeedbackPrompt, pickConversationStyle, tutorialConversationPrompt, maxWordsForLevel } from "@/lib/prompts";
import { MODELS } from "@/lib/models";
import { getStudentConversation } from "@/lib/ownership";
import { runTutorTurn } from "@/lib/conversation-turn";
import { saveComprehensionReport } from "@/lib/comprehension-report";

const anthropic = new Anthropic();

// Compute active discussion duration from message timestamps
// Only count gaps ≤ 5 minutes between consecutive messages (ignore idle time)
function computeActiveDiscussionSeconds(msgs: { role: string; timestamp?: string }[]): number {
  const timestamps = msgs
    .filter(m => m.timestamp)
    .map(m => new Date(m.timestamp!).getTime())
    .sort((a, b) => a - b);

  if (timestamps.length < 2) return 0;

  const MAX_GAP_MS = 5 * 60 * 1000; // 5 minutes
  let activeMs = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap <= MAX_GAP_MS) {
      activeMs += gap;
    }
  }
  return Math.round(activeMs / 1000);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const conversationId = parseInt(id);
  const { message } = await req.json();

  // Get conversation — only if it belongs to this student
  const owned = await getStudentConversation(conversationId, session.userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { conversation, readingSession } = owned;

  // Get article + student
  const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, readingSession.articleId)).limit(1);
  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, session.userId)).limit(1);

  // Handle resume check — return existing messages if any
  if (message === "__resume_check__") {
    const existing = conversation.messages || [];
    if (existing.length > 0) {
      return NextResponse.json({
        existingMessages: existing,
        complete: conversation.complete,
        progressScore: conversation.progressScore || 0,
      });
    }
    // No existing messages — fall through to generate opener
  }

  // Build messages (with timestamps)
  const messages = [...(conversation.messages || [])];
  const now = new Date().toISOString();
  const isOpener = message === "__resume_check__" && messages.length === 0;
  if (!isOpener) {
    if (message !== "__resume_check__") {
      messages.push({ role: "user", content: message, timestamp: now });
    }
  }

  const exchangeNumber = messages.filter(m => m.role === "user").length;

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

  // Pick conversation style once per conversation, reuse on subsequent messages.
  // A new one differs from the student's last conversation, so openers don't repeat back to back
  let conversationStyle = conversation.conversationStyle;
  if (!conversationStyle) {
    const [last] = await db.select({ style: schema.conversations.conversationStyle })
      .from(schema.conversations)
      .innerJoin(schema.readingSessions, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
      .where(and(eq(schema.readingSessions.studentId, session.userId), ne(schema.conversations.id, conversationId)))
      .orderBy(desc(schema.conversations.id))
      .limit(1);
    conversationStyle = pickConversationStyle(last?.style);
  }
  const isTutorial = article.category === "tutorial";

  // Get AI response — use tutorial prompt for tutorial articles
  const systemPrompt = isTutorial
    ? tutorialConversationPrompt(article.bodyText, student.readingLevel || 2)
    : comprehensionConversationPrompt(
        article.bodyText,
        student.readingLevel || 2,
        JSON.stringify(student.interestProfile || {}),
        previousArticles.length > 0 ? previousArticles : undefined,
        article.liked,
        conversationStyle,
        exchangeNumber
      );

  const turn = await runTutorTurn({
    client: tracked(anthropic, "tutor_turn", session.userId),
    model: MODELS.heavy,
    systemPrompt,
    messages,
    priorProgress: conversation.progressScore || 0,
    maxWords: maxWordsForLevel(student.readingLevel || 2),
  });
  const cleanText = turn.message;
  const isComplete = turn.complete;
  const newProgressScore = turn.progressScore;

  messages.push({ role: "assistant", content: cleanText, timestamp: new Date().toISOString() });

  // Save updated messages, conversation style, and progress score
  const updateData: any = { messages, complete: isComplete, progressScore: newProgressScore };
  if (!conversation.conversationStyle) {
    updateData.conversationStyle = conversationStyle;
  }
  await db.update(schema.conversations).set(updateData).where(eq(schema.conversations.id, conversationId));

  // If complete, mark article as read, save summary, and generate report
  if (isComplete) {
    // Store a brief summary for cross-article connections
    const summaryText = `${article.title}: ${article.topic}`;
    await db.update(schema.articles).set({ read: true, summary: summaryText }).where(eq(schema.articles.id, article.id));
    const activeSecs = computeActiveDiscussionSeconds(messages);
    await db.update(schema.readingSessions).set({ completedAt: new Date(), discussionDurationSeconds: activeSecs }).where(eq(schema.readingSessions.id, readingSession.id));

    const transcript = messages.map(m => `${m.role === "user" ? "Student" : "AI"}: ${m.content}`).join("\n\n");

    // Report (Opus) and coaching (Sonnet) are independent, so run them side by side
    const [, feedbackResponse] = await Promise.all([
      isTutorial ? Promise.resolve() : saveComprehensionReport({
        anthropic,
        conversationId,
        studentId: session.userId,
        articleId: article.id,
        studentName: student.name,
        articleTitle: article.title,
        articleText: article.bodyText,
        level: student.readingLevel || 2,
        messages,
        transcript,
        forcedClose: turn.closing === "forced",
        inChatScore: newProgressScore,
      }).catch(e => console.error("Report save failed:", e)),
      tracked(anthropic, "coaching", session.userId).messages.create({
        model: MODELS.standard,
        max_tokens: 256,
        messages: [{
          role: "user",
          content: coachingFeedbackPrompt(article.bodyText, transcript, student.readingLevel || 2),
        }],
      }).catch(e => { console.error("Coaching feedback failed:", e); return null; }),
    ]);
    const coachingFeedback = feedbackResponse?.content[0]?.type === "text" ? feedbackResponse.content[0].text.trim() : null;

    // Persist coaching feedback as a message so it appears on resume
    if (coachingFeedback) {
      messages.push({ role: "assistant", content: coachingFeedback, timestamp: new Date().toISOString(), type: "coaching" });
      await db.update(schema.conversations).set({ messages }).where(eq(schema.conversations.id, conversationId));
    }

    return NextResponse.json({ message: cleanText, complete: isComplete, progressScore: newProgressScore, coachingFeedback });
  }

  return NextResponse.json({ message: cleanText, complete: isComplete, progressScore: newProgressScore });
}
