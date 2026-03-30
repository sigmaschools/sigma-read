export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, desc, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "guide" && session.role !== "admin")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = parseInt(req.nextUrl.searchParams.get("studentId") || "0");
  if (!studentId) return NextResponse.json({ error: "Missing studentId" }, { status: 400 });

  // Verify this student belongs to this guide (admins can view any student)
  const [student] = session.role === "admin"
    ? await db.select().from(schema.students).where(eq(schema.students.id, studentId)).limit(1)
    : await db.select().from(schema.students).where(
        and(eq(schema.students.id, studentId), eq(schema.students.guideId, session.userId))
      ).limit(1);
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Self-assessment calibration
  const reports = await db.select({
    score: schema.comprehensionReports.score,
    selfAssessment: schema.comprehensionReports.selfAssessment,
    studentAvgWords: schema.comprehensionReports.studentAvgWords,
    conversationStyle: schema.conversations.conversationStyle,
    redirectCount: schema.comprehensionReports.redirectCount,
  }).from(schema.comprehensionReports)
    .innerJoin(schema.conversations, eq(schema.comprehensionReports.conversationId, schema.conversations.id))
    .innerJoin(schema.readingSessions, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
    .where(eq(schema.readingSessions.studentId, studentId))
    .orderBy(desc(schema.comprehensionReports.createdAt))
    .limit(20);

  // Calibration: compare self-assessment to actual score
  let calibration = null;
  const assessed = reports.filter(r => r.selfAssessment && r.score !== null);
  if (assessed.length >= 3) {
    let overcount = 0, undercount = 0, accurate = 0;
    for (const r of assessed) {
      const expectedMin = r.selfAssessment === "really_well" ? 75 : r.selfAssessment === "pretty_well" ? 55 : r.selfAssessment === "not_sure" ? 35 : 0;
      const expectedMax = r.selfAssessment === "really_well" ? 100 : r.selfAssessment === "pretty_well" ? 74 : r.selfAssessment === "not_sure" ? 54 : 34;
      if ((r.score || 0) < expectedMin) overcount++;
      else if ((r.score || 0) > expectedMax) undercount++;
      else accurate++;
    }
    const total = assessed.length;
    if (overcount / total > 0.5) {
      calibration = { pattern: "⚠️ Tends overconfident", detail: `Rates understanding higher than scores suggest (${overcount}/${total} sessions)` };
    } else if (undercount / total > 0.5) {
      calibration = { pattern: "📈 Tends underconfident", detail: `Scores better than they think (${undercount}/${total} sessions)` };
    } else {
      calibration = { pattern: "✓ Well calibrated", detail: `Self-assessment matches scores (${accurate}/${total} accurate)` };
    }
  }

  // Time insights
  const timeSessions = await db.select({
    startedAt: schema.readingSessions.startedAt,
    readingCompletedAt: schema.readingSessions.readingCompletedAt,
    completedAt: schema.readingSessions.completedAt,
  }).from(schema.readingSessions)
    .where(eq(schema.readingSessions.studentId, studentId))
    .orderBy(desc(schema.readingSessions.startedAt))
    .limit(20);

  const readingTimes: number[] = [];
  const discussionTimes: number[] = [];
  for (const ts of timeSessions) {
    if (ts.readingCompletedAt && ts.startedAt) {
      readingTimes.push((new Date(ts.readingCompletedAt).getTime() - new Date(ts.startedAt).getTime()) / 1000);
    }
    if (ts.completedAt && ts.readingCompletedAt) {
      discussionTimes.push((new Date(ts.completedAt).getTime() - new Date(ts.readingCompletedAt).getTime()) / 1000);
    }
  }
  const avgReadingTime = readingTimes.length > 0 ? Math.round(readingTimes.reduce((a, b) => a + b, 0) / readingTimes.length) : null;
  const avgDiscussionTime = discussionTimes.length > 0 ? Math.round(discussionTimes.reduce((a, b) => a + b, 0) / discussionTimes.length) : null;

  // Article preferences
  const liked = await db.select({ title: schema.articles.title }).from(schema.articles)
    .where(and(eq(schema.articles.studentId, studentId), eq(schema.articles.liked, true)))
    .orderBy(desc(schema.articles.createdAt)).limit(5);
  const disliked = await db.select({ title: schema.articles.title }).from(schema.articles)
    .where(and(eq(schema.articles.studentId, studentId), eq(schema.articles.liked, false)))
    .orderBy(desc(schema.articles.createdAt)).limit(5);

  // Feed events
  const feedEvents = await db.select({ eventType: schema.articleFeedEvents.eventType, metadata: schema.articleFeedEvents.metadata })
    .from(schema.articleFeedEvents)
    .where(eq(schema.articleFeedEvents.studentId, studentId))
    .orderBy(desc(schema.articleFeedEvents.createdAt))
    .limit(50);

  const showDifferentCount = feedEvents.filter(e => e.eventType === "show_me_different").length;
  const interestSuggestions = feedEvents
    .filter(e => e.eventType === "interest_suggestion")
    .map(e => {
      try { return (typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata)?.text; }
      catch { return null; }
    })
    .filter(Boolean)
    .slice(0, 5);

  // Favorites
  const favs = await db.select({ title: schema.articles.title })
    .from(schema.articleFavorites)
    .innerJoin(schema.articles, eq(schema.articleFavorites.articleId, schema.articles.id))
    .where(eq(schema.articleFavorites.studentId, studentId))
    .orderBy(desc(schema.articleFavorites.createdAt))
    .limit(5);

  // Level history
  const levelHist = await db.select({
    fromLevel: schema.levelHistory.fromLevel,
    toLevel: schema.levelHistory.toLevel,
    changedAt: schema.levelHistory.changedAt,
  }).from(schema.levelHistory)
    .where(eq(schema.levelHistory.studentId, studentId))
    .orderBy(desc(schema.levelHistory.changedAt))
    .limit(10);

  // Conversation style distribution
  const conversationStyles: Record<string, number> = {};
  for (const r of reports) {
    if (r.conversationStyle) {
      conversationStyles[r.conversationStyle] = (conversationStyles[r.conversationStyle] || 0) + 1;
    }
  }

  // Engagement level
  const avgStudentWords = reports.filter(r => r.studentAvgWords !== null);
  let avgEngagement = null;
  if (avgStudentWords.length >= 3) {
    const avg = avgStudentWords.reduce((a, r) => a + (r.studentAvgWords || 0), 0) / avgStudentWords.length;
    if (avg >= 15) avgEngagement = "High — detailed responses";
    else if (avg >= 8) avgEngagement = "Medium — adequate responses";
    else avgEngagement = "Low — brief responses";
  }

  return NextResponse.json({
    calibration,
    avgReadingTime,
    avgDiscussionTime,
    likedArticles: liked.map(l => l.title),
    dislikedArticles: disliked.map(d => d.title),
    interestSuggestions,
    favorites: favs.map(f => f.title),
    showDifferentCount,
    levelHistory: levelHist,
    conversationStyles,
    avgEngagement,
  });
}
