export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, desc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { parentChatPrompt } from "@/lib/prompts";

const anthropic = new Anthropic();

const levelInfo: Record<number, { label: string; lexile: string }> = {
  1: { label: "L1 (Gr 2-3)", lexile: "~400-500" },
  2: { label: "L2 (Gr 3-4)", lexile: "~550-650" },
  3: { label: "L3 (Gr 5-6)", lexile: "~700-800" },
  4: { label: "L4 (Gr 7)", lexile: "~850-950" },
  5: { label: "L5 (Gr 8)", lexile: "~1000-1100" },
  6: { label: "L6 (Gr 8+)", lexile: "~1150+" },
};

async function verifyParentOwnership(parentId: number, studentId: number) {
  const [link] = await db.select({ id: schema.studentParents.id })
    .from(schema.studentParents)
    .where(and(eq(schema.studentParents.parentId, parentId), eq(schema.studentParents.studentId, studentId)))
    .limit(1);
  return !!link;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "parent") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = parseInt(req.nextUrl.searchParams.get("studentId") || "0");
  if (!studentId) return NextResponse.json({ error: "Missing studentId" }, { status: 400 });

  if (!(await verifyParentOwnership(session.userId, studentId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [conversation] = await db.select()
    .from(schema.parentConversations)
    .where(and(
      eq(schema.parentConversations.parentId, session.userId),
      eq(schema.parentConversations.studentId, studentId),
    ))
    .orderBy(desc(schema.parentConversations.updatedAt))
    .limit(1);

  return NextResponse.json({
    messages: conversation?.messages || [],
    conversationId: conversation?.id || null,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "parent") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
  const { studentId, message } = await req.json();
  if (!studentId || !message) return NextResponse.json({ error: "Missing studentId or message" }, { status: 400 });

  if (!(await verifyParentOwnership(session.userId, studentId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find or create conversation
  let [conversation] = await db.select()
    .from(schema.parentConversations)
    .where(and(
      eq(schema.parentConversations.parentId, session.userId),
      eq(schema.parentConversations.studentId, studentId),
    ))
    .orderBy(desc(schema.parentConversations.updatedAt))
    .limit(1);

  if (!conversation) {
    const [created] = await db.insert(schema.parentConversations).values({
      parentId: session.userId,
      studentId,
      messages: [],
    }).returning();
    conversation = created;
  }

  // Append user message
  const messages = [...(conversation.messages || [])];
  messages.push({ role: "user", content: message, timestamp: new Date().toISOString() });

  // Build student context
  const [student] = await db.select().from(schema.students)
    .where(eq(schema.students.id, studentId)).limit(1);
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const [parent] = await db.select({ name: schema.parents.name }).from(schema.parents)
    .where(eq(schema.parents.id, session.userId)).limit(1);

  // Fetch last 10 comprehension scores
  const reports = await db.select({
    score: schema.comprehensionReports.score,
    selfAssessment: schema.comprehensionReports.selfAssessment,
    studentAvgWords: schema.comprehensionReports.studentAvgWords,
  }).from(schema.comprehensionReports)
    .innerJoin(schema.conversations, eq(schema.comprehensionReports.conversationId, schema.conversations.id))
    .innerJoin(schema.readingSessions, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
    .where(eq(schema.readingSessions.studentId, studentId))
    .orderBy(desc(schema.comprehensionReports.createdAt))
    .limit(10);

  const recentScores = reports.map(r => r.score);
  const avgScore = recentScores.length > 0
    ? Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length)
    : 0;

  // Calibration
  let calibration = "Not enough data";
  const assessed = reports.filter(r => r.selfAssessment && r.score !== null);
  if (assessed.length >= 3) {
    let overcount = 0, undercount = 0;
    for (const r of assessed) {
      const expectedMin = r.selfAssessment === "really_well" ? 75 : r.selfAssessment === "pretty_well" ? 55 : r.selfAssessment === "not_sure" ? 35 : 0;
      const expectedMax = r.selfAssessment === "really_well" ? 100 : r.selfAssessment === "pretty_well" ? 74 : r.selfAssessment === "not_sure" ? 54 : 34;
      if ((r.score || 0) < expectedMin) overcount++;
      else if ((r.score || 0) > expectedMax) undercount++;
    }
    const total = assessed.length;
    if (overcount / total > 0.5) calibration = `Tends overconfident (${overcount}/${total} sessions)`;
    else if (undercount / total > 0.5) calibration = `Tends underconfident (${undercount}/${total} sessions)`;
    else calibration = "Well calibrated";
  }

  // Engagement
  const avgStudentWords = reports.filter(r => r.studentAvgWords !== null);
  let avgEngagement = "Not enough data";
  if (avgStudentWords.length >= 3) {
    const avg = avgStudentWords.reduce((a, r) => a + (r.studentAvgWords || 0), 0) / avgStudentWords.length;
    if (avg >= 15) avgEngagement = "High — detailed responses";
    else if (avg >= 8) avgEngagement = "Medium — adequate responses";
    else avgEngagement = "Low — brief responses";
  }

  // Level history
  const levelHist = await db.select({
    fromLevel: schema.levelHistory.fromLevel,
    toLevel: schema.levelHistory.toLevel,
    changedAt: schema.levelHistory.changedAt,
  }).from(schema.levelHistory)
    .where(eq(schema.levelHistory.studentId, studentId))
    .orderBy(desc(schema.levelHistory.changedAt))
    .limit(5);

  const levelHistoryStr = levelHist.length > 0
    ? levelHist.map(h => `L${h.fromLevel}→L${h.toLevel} (${new Date(h.changedAt).toLocaleDateString()})`).join(", ")
    : "No level changes yet";

  // Recent sessions (last 5 completed with article info)
  const recentSessions = await db.select({
    articleTitle: schema.articles.title,
    articleTopic: schema.articles.topic,
    score: schema.comprehensionReports.score,
    completedAt: schema.readingSessions.completedAt,
    selfAssessment: schema.comprehensionReports.selfAssessment,
  }).from(schema.readingSessions)
    .innerJoin(schema.articles, eq(schema.readingSessions.articleId, schema.articles.id))
    .innerJoin(schema.conversations, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
    .innerJoin(schema.comprehensionReports, eq(schema.comprehensionReports.conversationId, schema.conversations.id))
    .where(eq(schema.readingSessions.studentId, studentId))
    .orderBy(desc(schema.readingSessions.completedAt))
    .limit(5);

  const recentSessionsStr = recentSessions.length > 0
    ? recentSessions.map(s =>
      `- "${s.articleTitle}" (${s.articleTopic}) — Score: ${s.score}, Self-assessed: ${s.selfAssessment || "N/A"}, ${s.completedAt ? new Date(s.completedAt).toLocaleDateString() : "N/A"}`
    ).join("\n")
    : "No completed sessions yet";

  // Build interests string
  const interestProfile = student.interestProfile as { interests?: string[] } | null;
  const interests = interestProfile?.interests?.join(", ") || "Not set";

  const info = levelInfo[student.readingLevel || 3] || levelInfo[3];

  // Build system prompt
  const systemPrompt = parentChatPrompt({
    parentName: parent?.name || "Parent",
    studentName: student.name,
    gradeLevel: student.gradeLevel ? `Grade ${student.gradeLevel}` : "Not set",
    levelLabel: info.label,
    lexileRange: info.lexile,
    interests,
    recentScores: recentScores.length > 0 ? recentScores.join(", ") : "No scores yet",
    avgScore: avgScore > 0 ? String(avgScore) : "N/A",
    levelHistory: levelHistoryStr,
    totalSessions: String(student.totalSessionsCompleted || 0),
    calibration,
    avgEngagement,
    recentSessions: recentSessionsStr,
  });

  // Call Claude with last 20 messages
  const contextMessages = messages.slice(-20).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: contextMessages,
  });

  let assistantMessage = response.content[0].type === "text" ? response.content[0].text : "";

  // Parse feedback block
  let feedback: { category: string; sentiment: string; summary: string } | null = null;
  const feedbackMatch = assistantMessage.match(/```feedback\s*\n([\s\S]*?)\n```/);
  if (feedbackMatch) {
    try {
      feedback = JSON.parse(feedbackMatch[1].trim());
      // Strip feedback block from visible message
      assistantMessage = assistantMessage.replace(/```feedback\s*\n[\s\S]*?\n```/, "").trim();
    } catch {
      // Ignore parse errors
    }
  }

  // Append assistant message
  messages.push({ role: "assistant", content: assistantMessage, timestamp: new Date().toISOString() });

  // Save conversation
  await db.update(schema.parentConversations).set({
    messages,
    updatedAt: new Date(),
  }).where(eq(schema.parentConversations.id, conversation.id));

  // Save feedback if extracted
  if (feedback) {
    await db.insert(schema.parentFeedback).values({
      parentId: session.userId,
      studentId,
      parentConversationId: conversation.id,
      category: feedback.category,
      sentiment: feedback.sentiment,
      summary: feedback.summary,
      sourceMessageIndex: messages.length - 2, // index of the user message
    });
  }

  return NextResponse.json({
    message: assistantMessage,
    conversationId: conversation.id,
  });
  } catch (err: unknown) {
    console.error("Parent chat error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
