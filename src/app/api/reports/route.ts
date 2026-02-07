import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "guide") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = parseInt(req.nextUrl.searchParams.get("studentId") || "0");
  if (!studentId) return NextResponse.json({ error: "Student ID required" }, { status: 400 });

  // Get all reading sessions for this student with their reports
  const sessions = await db.select({
    sessionId: schema.readingSessions.id,
    articleId: schema.readingSessions.articleId,
    startedAt: schema.readingSessions.startedAt,
    completedAt: schema.readingSessions.completedAt,
    articleTitle: schema.articles.title,
    articleTopic: schema.articles.topic,
    reportId: schema.comprehensionReports.id,
    score: schema.comprehensionReports.score,
    rating: schema.comprehensionReports.rating,
    understood: schema.comprehensionReports.understood,
    missed: schema.comprehensionReports.missed,
    engagementNote: schema.comprehensionReports.engagementNote,
    conversationId: schema.conversations.id,
    messages: schema.conversations.messages,
  })
    .from(schema.readingSessions)
    .leftJoin(schema.articles, eq(schema.readingSessions.articleId, schema.articles.id))
    .leftJoin(schema.conversations, eq(schema.readingSessions.id, schema.conversations.readingSessionId))
    .leftJoin(schema.comprehensionReports, eq(schema.conversations.id, schema.comprehensionReports.conversationId))
    .where(eq(schema.readingSessions.studentId, studentId))
    .orderBy(desc(schema.readingSessions.startedAt));

  return NextResponse.json(sessions);
}
