export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, desc, and, ne } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { comprehensionConversationPrompt, comprehensionReportPrompt, coachingFeedbackPrompt, pickConversationStyle, tutorialConversationPrompt } from "@/lib/prompts";
import { parseProgressResponse, clampDelta, isConversationComplete } from "@/lib/progress-scoring";
import { MODELS } from "@/lib/models";

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

  // Exchange tracking: count real student messages only (no synthetic offset)
  const studentMessageCount = messages.filter(m => m.role === "user").length;
  const exchangeNumber = studentMessageCount;

  // Safety backstop — force wrap-up after 6 real student messages
  const forceComplete = studentMessageCount >= 6;

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

  // Build messages for AI — if at hard limit OR already at threshold, inject closing instruction
  const alreadyComplete = (conversation.progressScore || 0) >= 100 && exchangeNumber >= 3;
  const finalMessages = messages.length > 0
    ? messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content }))
    : [{ role: "user" as const, content: "[Begin the conversation with your Step 1 opener. The student has not said anything yet.]" }];
  if (forceComplete || alreadyComplete) {
    finalMessages.push({ role: "user" as const, content: `[SYSTEM: The student has demonstrated sufficient understanding. This is your final message. Wrap up in one warm sentence acknowledging what they got right. Do not ask a question. Respond with JSON: {"message": "your closing sentence", "progressDelta": 0}]` });
  }

  const response = await anthropic.messages.create({
    model: MODELS.heavy,
    max_tokens: 1024,
    system: systemPrompt,
    messages: finalMessages,
  });

  const assistantText = response.content[0].type === "text" ? response.content[0].text : "";
  const parsedResponse = parseProgressResponse(assistantText);
  const clampedDelta = clampDelta(parsedResponse.progressDelta);
  const newProgressScore = (conversation.progressScore || 0) + clampedDelta;
  let isComplete = isConversationComplete({ progressScore: newProgressScore, exchangeNumber, forceComplete });
  let cleanText = parsedResponse.message.replace("[CONVERSATION_COMPLETE]", "").trim();

  // Safety net: if AI's closing instruction was active and the AI still asked a question,
  // replace with a canned closing so the session doesn't end on an unanswerable question.
  if ((forceComplete || alreadyComplete) && cleanText.trim().endsWith("?")) {
    cleanText = "You've clearly engaged with this article thoughtfully — great work today.";
  }

  // Defer completion if the closing instruction wasn't explicitly injected.
  // When alreadyComplete/forceComplete was false, the AI was in mid-conversation mode and
  // almost certainly ended with a directive or question expecting a reply — always defer so
  // the student can answer. On the next exchange, alreadyComplete will be true and the proper
  // closing will be triggered cleanly.
  if (isComplete && !forceComplete && !alreadyComplete) {
    isComplete = false;
  }

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
    await db.update(schema.readingSessions).set({ completedAt: new Date() }).where(eq(schema.readingSessions.id, readingSession.id));

    const transcript = messages.map(m => `${m.role === "user" ? "Student" : "AI"}: ${m.content}`).join("\n\n");

    // Skip comprehension report and level progression for tutorials
    if (!isTutorial) {
      // Generate comprehension report
      const reportResponse = await anthropic.messages.create({
        model: MODELS.heavy,
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
            understood: report.comprehension || report.understood,
            missed: report.depth || report.missed,
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

    // Generate coaching feedback for the student
    const feedbackResponse = await anthropic.messages.create({
      model: MODELS.standard,
      max_tokens: 256,
      messages: [{
        role: "user",
        content: coachingFeedbackPrompt(article.bodyText, transcript, student.readingLevel || 2),
      }],
    });
    const coachingFeedback = feedbackResponse.content[0].type === "text" ? feedbackResponse.content[0].text.trim() : null;

    // Persist coaching feedback as a message so it appears on resume
    if (coachingFeedback) {
      messages.push({ role: "assistant", content: coachingFeedback, timestamp: new Date().toISOString(), type: "coaching" });
      await db.update(schema.conversations).set({ messages }).where(eq(schema.conversations.id, conversationId));
    }

    return NextResponse.json({ message: cleanText, complete: isComplete, progressScore: newProgressScore, coachingFeedback });
  }

  return NextResponse.json({ message: cleanText, complete: isComplete, progressScore: newProgressScore });
}
