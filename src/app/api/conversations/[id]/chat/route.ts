export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, desc, and, ne } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { tracked } from "@/lib/ai-usage";
import { comprehensionConversationPrompt, comprehensionReportPrompt, coachingFeedbackPrompt, pickConversationStyle, tutorialConversationPrompt } from "@/lib/prompts";
import { MODELS } from "@/lib/models";
import { REPORT_SCHEMA, REPORT_PROMPT_VERSION, reportConfidence, clampScore, ratingForScore, verifiedEvidence, type ComprehensionReport } from "@/lib/report-schema";
import { parseJsonResponse } from "@/lib/claude-json";
import { getStudentConversation } from "@/lib/ownership";
import { runTutorTurn } from "@/lib/conversation-turn";

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

  const turn = await runTutorTurn({
    client: tracked(anthropic, "tutor_turn", session.userId),
    model: MODELS.heavy,
    systemPrompt,
    messages,
    priorProgress: conversation.progressScore || 0,
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
        conversationId,
        studentId: session.userId,
        studentName: student.name,
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

/**
 * Generate the guide-facing comprehension report, store it, and run level progression.
 * Retries once if the model returns no usable report; on a second failure it logs and
 * skips, as before, so the student's session still completes.
 */
async function saveComprehensionReport(args: {
  conversationId: number;
  studentId: number;
  studentName: string;
  articleText: string;
  level: number;
  messages: { role: string; content: string }[];
  transcript: string;
  forcedClose: boolean;
  inChatScore: number;
}) {
  let report: ComprehensionReport | null = null;
  for (let attempt = 1; attempt <= 2 && !report; attempt++) {
    try {
      const reportResponse = await tracked(anthropic, "report", args.studentId).messages.create({
        model: MODELS.heavy,
        max_tokens: 2048,
        messages: [{ role: "user", content: comprehensionReportPrompt(args.articleText, args.transcript, args.level) }],
        output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA } },
      });
      report = parseJsonResponse<ComprehensionReport>(reportResponse);
      if (!report) {
        console.error(`Report attempt ${attempt} unusable (stop_reason: ${reportResponse.stop_reason})`);
        // A refusal won't change on an identical retry
        if (reportResponse.stop_reason === "refusal") break;
      }
    } catch (e) {
      console.error(`Report attempt ${attempt} failed:`, e);
    }
  }
  if (!report) {
    console.error(`No comprehension report for conversation ${args.conversationId}`);
    return;
  }

  // Conversation analytics
  const aiMessages = args.messages.filter(m => m.role === "assistant");
  const studentMessages = args.messages.filter(m => m.role === "user");
  const wordCount = (text: string) => text.split(/\s+/).filter(w => w.length > 0).length;
  const aiAvgWords = aiMessages.length > 0 ? Math.round(aiMessages.reduce((sum, m) => sum + wordCount(m.content), 0) / aiMessages.length) : 0;
  const studentAvgWords = studentMessages.length > 0 ? Math.round(studentMessages.reduce((sum, m) => sum + wordCount(m.content), 0) / studentMessages.length) : 0;
  // Count redirections: "actually", "take a look", "take another look", "close, but", "not quite"
  const redirectPatterns = /\b(actually|take a look|take another look|close,? but|not quite|if you look at the article)\b/gi;
  const redirectCount = aiMessages.reduce((count, m) => count + (m.content.match(redirectPatterns) || []).length, 0);
  const exchangeCount = studentMessages.length;

  const score = clampScore(report.score);
  await db.insert(schema.comprehensionReports).values({
    conversationId: args.conversationId,
    score,
    rating: ratingForScore(score),
    understood: report.comprehension,
    missed: report.depth,
    engagementNote: report.engagement,
    aiAvgWords,
    studentAvgWords,
    redirectCount,
    exchangeCount,
    skills: report.skills,
    evidence: verifiedEvidence(report.evidence, studentMessages.map(m => m.content)),
    summary: report.summary,
    nextStep: report.nextStep,
    confidence: reportConfidence({ forcedClose: args.forcedClose, exchangeCount, studentAvgWords }),
    forcedClose: args.forcedClose,
    inChatScore: args.inChatScore,
    model: MODELS.heavy,
    promptVersion: REPORT_PROMPT_VERSION,
  });

  // Gradual Mix Level Progression — evaluate and apply
  try {
    const { evaluateProgression, applyProgressionResult } = await import("@/lib/level-progression");
    const progressionResult = await evaluateProgression(args.studentId);
    if (progressionResult.action !== "none") {
      await applyProgressionResult(args.studentId, progressionResult);
      console.log(`Level progression [${args.studentName}]: ${progressionResult.action}`,
        progressionResult.newLevel ? `→ L${progressionResult.newLevel}` : "",
        progressionResult.alertMessage || "");
    }
  } catch (e) {
    console.error("Level progression error:", e);
  }
}
