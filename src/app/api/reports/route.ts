export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, desc, isNotNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "guide" && session.role !== "admin" && session.role !== "parent")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = parseInt(req.nextUrl.searchParams.get("studentId") || "0");
  if (!studentId) return NextResponse.json({ error: "Student ID required" }, { status: 400 });

  // Parent must own this student
  if (session.role === "parent") {
    const [link] = await db.select({ id: schema.studentParents.id })
      .from(schema.studentParents)
      .where(and(eq(schema.studentParents.parentId, session.userId), eq(schema.studentParents.studentId, studentId)))
      .limit(1);
    if (!link) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all reading sessions for this student with their reports
  const sessions = await db.select({
    sessionId: schema.readingSessions.id,
    articleId: schema.readingSessions.articleId,
    startedAt: schema.readingSessions.startedAt,
    readingCompletedAt: schema.readingSessions.readingCompletedAt,
    completedAt: schema.readingSessions.completedAt,
    articleTitle: schema.articles.title,
    articleTopic: schema.articles.topic,
    articleLiked: schema.articles.liked,
    reportId: schema.comprehensionReports.id,
    score: schema.comprehensionReports.score,
    rating: schema.comprehensionReports.rating,
    understood: schema.comprehensionReports.understood,
    missed: schema.comprehensionReports.missed,
    engagementNote: schema.comprehensionReports.engagementNote,
    selfAssessment: schema.comprehensionReports.selfAssessment,
    aiAvgWords: schema.comprehensionReports.aiAvgWords,
    studentAvgWords: schema.comprehensionReports.studentAvgWords,
    redirectCount: schema.comprehensionReports.redirectCount,
    exchangeCount: schema.comprehensionReports.exchangeCount,
    conversationId: schema.conversations.id,
    conversationStyle: schema.conversations.conversationStyle,
    messages: schema.conversations.messages,
  })
    .from(schema.readingSessions)
    .leftJoin(schema.articles, eq(schema.readingSessions.articleId, schema.articles.id))
    .leftJoin(schema.conversations, eq(schema.readingSessions.id, schema.conversations.readingSessionId))
    .leftJoin(schema.comprehensionReports, eq(schema.conversations.id, schema.comprehensionReports.conversationId))
    .where(eq(schema.readingSessions.studentId, studentId))
    .orderBy(desc(schema.readingSessions.startedAt));

  // Separate completed from in-progress for the client
  const completed = sessions.filter(s => s.completedAt !== null);
  const inProgress = sessions.filter(s => s.completedAt === null);

  return NextResponse.json({ completed, inProgress });
}
