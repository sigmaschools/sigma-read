export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, desc, and, ne } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { tracked, trackedStreaming } from "@/lib/ai-usage";
import { comprehensionConversationPrompt, springConversationPrompt, coachingFeedbackPrompt, pickConversationStyle, tutorialConversationPrompt, maxWordsForLevel } from "@/lib/prompts";
import { MODELS, forJob, requestSettings } from "@/lib/models";
import { getStudentConversation } from "@/lib/ownership";
import { runTutorTurn, type ClosingKind } from "@/lib/conversation-turn";
import { saveComprehensionReport } from "@/lib/comprehension-report";
import { stripMarkdown } from "@/lib/plain-text";
import { safeComprehensionCompassReport } from "@/lib/compass-report-data";
import { tutorInterestContext } from "@/lib/interest-graph";
import { sigmaExchange } from "@/lib/tutor/conversation";
import { guideNotesForArticle } from "@/lib/tutor/notes-store";
import { tutorDesignForNewConversation, type TutorDesign } from "@/lib/tutor/design";

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

type StoredMessage = { role: string; content: string; timestamp?: string; type?: string };

/** What the client gets back after a turn; on the closing turn, the report block for Compass too */
interface TurnResponse {
  message: string;
  complete: boolean;
  progressScore: number;
  coachingFeedback?: string | null;
  compassReport?: object | null;
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
        compassReport: conversation.complete ? await safeComprehensionCompassReport(conversationId) : null,
      });
    }
    // No existing messages — fall through to generate opener
  }

  // Build messages (with timestamps)
  const messages: StoredMessage[] = [...(conversation.messages || [])];
  const now = new Date().toISOString();
  const isOpener = message === "__resume_check__" && messages.length === 0;
  if (!isOpener) {
    if (message !== "__resume_check__") {
      messages.push({ role: "user", content: message, timestamp: now });
    }
  }

  const exchangeNumber = messages.filter(m => m.role === "user").length;
  const isTutorial = article.category === "tutorial";
  const level = student.readingLevel || 2;

  // Which tutor runs this conversation is fixed on its first turn, so a switch of the default
  // mid-conversation never changes the voice halfway through
  const design: TutorDesign = isTutorial ? "classic" : (conversation.tutorDesign as TutorDesign | null) ?? (isOpener ? tutorDesignForNewConversation() : "classic");

  const finish = async (cleanText: string, closing: ClosingKind | null, newProgressScore: number): Promise<TurnResponse> => {
    // Mark article as read, close the reading session, and generate the report and coaching tip
    const summaryText = `${article.title}: ${article.topic}`;
    await db.update(schema.articles).set({ read: true, summary: summaryText }).where(eq(schema.articles.id, article.id));
    const activeSecs = computeActiveDiscussionSeconds(messages);
    await db.update(schema.readingSessions).set({ completedAt: new Date(), discussionDurationSeconds: activeSecs }).where(eq(schema.readingSessions.id, readingSession.id));

    const transcript = messages.map(m => `${m.role === "user" ? "Student" : "AI"}: ${m.content}`).join("\n\n");

    // Report and coaching tip are independent, so run them side by side
    const [, feedbackResponse] = await Promise.all([
      isTutorial ? Promise.resolve() : saveComprehensionReport({
        anthropic,
        conversationId,
        studentId: session.userId,
        articleId: article.id,
        studentName: student.name,
        articleTitle: article.title,
        articleText: article.bodyText,
        level,
        messages,
        transcript,
        forcedClose: closing === "forced",
        inChatScore: newProgressScore,
      }).catch(e => console.error("Report save failed:", e)),
      tracked(anthropic, "coaching", session.userId).messages.create(forJob("standard", {
        max_tokens: 256,
        messages: [{
          role: "user" as const,
          content: coachingFeedbackPrompt(article.bodyText, transcript, level),
        }],
      })).catch(e => { console.error("Coaching feedback failed:", e); return null; }),
    ]);
    // The card shows plain text: strip any *emphasis* or _emphasis_ the model adds anyway
    const feedbackText = feedbackResponse?.content.find(b => b.type === "text");
    const coachingFeedback = feedbackText?.type === "text" ? stripMarkdown(feedbackText.text) : null;

    // Persist coaching feedback as a message so it appears on resume
    if (coachingFeedback) {
      messages.push({ role: "assistant", content: coachingFeedback, timestamp: new Date().toISOString(), type: "coaching" });
      await db.update(schema.conversations).set({ messages }).where(eq(schema.conversations.id, conversationId));
    }

    // For Compass: the report block on the finished discussion (null for tutorials or a failed report)
    const compassReport = isTutorial ? null : await safeComprehensionCompassReport(conversationId);

    return { message: cleanText, complete: true, progressScore: newProgressScore, coachingFeedback, compassReport };
  };

  if (design === "sigma") {
    const guideNotes = await guideNotesForArticle(article.sourceCacheId).catch(e => { console.error("Guide notes unavailable:", e); return null; });
    const run = async (onDelta?: (text: string) => void): Promise<TurnResponse> => {
      const turn = await sigmaExchange({
        tutorClient: trackedStreaming(anthropic, "tutor_turn", session.userId),
        observerClient: tracked(anthropic, "observer", session.userId),
        articleTitle: article.title,
        articleText: article.bodyText,
        level,
        guideNotes,
        messages,
        priorProgress: conversation.progressScore || 0,
        previousNotes: conversation.observerNotes ?? null,
        onDelta,
      });
      messages.push({ role: "assistant", content: turn.message, timestamp: new Date().toISOString() });
      await db.update(schema.conversations).set({
        messages, complete: turn.complete, progressScore: turn.progressScore, observerNotes: turn.notes, tutorDesign: "sigma",
      }).where(eq(schema.conversations.id, conversationId));
      if (turn.complete) return finish(turn.message, turn.closing, turn.progressScore);
      return { message: turn.message, complete: false, progressScore: turn.progressScore };
    };

    // The reply streams to the student as it is written when the client asks for events; the
    // final event carries everything the JSON response would have
    if (req.headers.get("accept")?.includes("text/event-stream")) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          try {
            const result = await run(text => send({ type: "delta", text }));
            send({ type: "done", ...result });
          } catch (e) {
            console.error("Sigma turn failed:", e);
            send({ type: "error", error: "The tutor didn't answer. Try sending that again." });
          }
          controller.close();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
    }
    return NextResponse.json(await run());
  }

  // ─── Classic tutor (and the spring 2026 tutor, which shares its turn logic) ───
  const spring = design === "spring";

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
  // Compass's interest summary for a student linked to it (used as given, contract 6.6); the
  // profile as before otherwise, when Compass has nothing yet (linked but not imported), or when
  // Compass doesn't answer within two seconds
  const interests = isTutorial || spring ? null : await tutorInterestContext(session.userId)
    .catch(e => { console.error("Interest summary unavailable:", e); return null; });

  // Get AI response — use tutorial prompt for tutorial articles
  const systemPrompt = isTutorial
    ? tutorialConversationPrompt(article.bodyText, level)
    : spring
    ? springConversationPrompt(article.bodyText, level, article.liked)
    : comprehensionConversationPrompt(
        article.bodyText,
        level,
        interests || JSON.stringify(student.interestProfile || {}),
        article.liked,
        conversationStyle,
        exchangeNumber
      );

  const turn = await runTutorTurn({
    client: tracked(anthropic, "tutor_turn", session.userId),
    model: spring ? MODELS.springTutor : MODELS.tutor,
    settings: spring ? requestSettings(MODELS.springTutor, "springTutor") : requestSettings(MODELS.tutor, "tutor"),
    systemPrompt,
    messages,
    priorProgress: conversation.progressScore || 0,
    maxWords: maxWordsForLevel(level),
    spring,
  });
  const cleanText = turn.message;
  const isComplete = turn.complete;
  const newProgressScore = turn.progressScore;

  messages.push({ role: "assistant", content: cleanText, timestamp: new Date().toISOString() });

  // Save updated messages, conversation style, and progress score
  const updateData: { messages: StoredMessage[]; complete: boolean; progressScore: number; conversationStyle?: string; tutorDesign?: string } = { messages, complete: isComplete, progressScore: newProgressScore };
  if (spring) updateData.tutorDesign = "spring";
  if (!conversation.conversationStyle) {
    updateData.conversationStyle = conversationStyle;
  }
  await db.update(schema.conversations).set(updateData).where(eq(schema.conversations.id, conversationId));

  if (isComplete) return NextResponse.json(await finish(cleanText, turn.closing, newProgressScore));
  return NextResponse.json({ message: cleanText, complete: isComplete, progressScore: newProgressScore });
}
