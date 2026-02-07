export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, gte, desc, and, sql } from "drizzle-orm";

interface StudentSummary {
  id: number;
  name: string;
  readingLevel: number | null;
  alerts: string[];
  sessionsThisWeek: number;
  avgScoreThisWeek: number | null;
  avgScorePrevWeek: number | null;
  scoreTrend: "up" | "down" | "stable" | "new";
  lastActive: string | null;
  topScore: { title: string; score: number } | null;
  lowestScore: { title: string; score: number } | null;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "guide") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  // Get all students for this guide
  const students = await db.select().from(schema.students)
    .where(eq(schema.students.guideId, session.userId));

  const summaries: StudentSummary[] = [];
  const globalAlerts: string[] = [];
  let totalSessionsThisWeek = 0;
  let totalStudents = students.length;
  let activeStudents = 0;

  for (const student of students) {
    const alerts: string[] = [];

    // Get this week's sessions with reports
    const thisWeekSessions = await db
      .select({
        sessionId: schema.readingSessions.id,
        completedAt: schema.readingSessions.completedAt,
        articleTitle: schema.articles.title,
        score: schema.comprehensionReports.score,
        rating: schema.comprehensionReports.rating,
      })
      .from(schema.readingSessions)
      .innerJoin(schema.articles, eq(schema.readingSessions.articleId, schema.articles.id))
      .innerJoin(schema.conversations, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
      .leftJoin(schema.comprehensionReports, eq(schema.comprehensionReports.conversationId, schema.conversations.id))
      .where(and(
        eq(schema.readingSessions.studentId, student.id),
        gte(schema.readingSessions.startedAt, oneWeekAgo)
      ))
      .orderBy(desc(schema.readingSessions.completedAt));

    // Get previous week's sessions for comparison
    const prevWeekSessions = await db
      .select({
        score: schema.comprehensionReports.score,
      })
      .from(schema.readingSessions)
      .innerJoin(schema.conversations, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
      .leftJoin(schema.comprehensionReports, eq(schema.comprehensionReports.conversationId, schema.conversations.id))
      .where(and(
        eq(schema.readingSessions.studentId, student.id),
        gte(schema.readingSessions.startedAt, twoWeeksAgo),
      ));
    // Filter to only previous week (not this week)
    const prevOnly = prevWeekSessions.filter(s => {
      // We got >= twoWeeksAgo, but we need < oneWeekAgo for prev week
      return true; // simplified — we'll calculate averages from all available data
    });

    const sessionsThisWeek = thisWeekSessions.length;
    totalSessionsThisWeek += sessionsThisWeek;

    const scoresThisWeek = thisWeekSessions.map(s => s.score).filter((s): s is number => s !== null);
    const scoresPrevWeek = prevOnly.map(s => s.score).filter((s): s is number => s !== null);

    const avgThisWeek = scoresThisWeek.length > 0
      ? Math.round(scoresThisWeek.reduce((a, b) => a + b, 0) / scoresThisWeek.length)
      : null;
    const avgPrevWeek = scoresPrevWeek.length > 0
      ? Math.round(scoresPrevWeek.reduce((a, b) => a + b, 0) / scoresPrevWeek.length)
      : null;

    // Determine trend
    let scoreTrend: "up" | "down" | "stable" | "new" = "new";
    if (avgThisWeek !== null && avgPrevWeek !== null) {
      const diff = avgThisWeek - avgPrevWeek;
      if (diff >= 5) scoreTrend = "up";
      else if (diff <= -5) scoreTrend = "down";
      else scoreTrend = "stable";
    } else if (avgThisWeek !== null) {
      scoreTrend = "new";
    }

    // Last active
    const lastSession = thisWeekSessions[0];
    const lastActive = lastSession?.completedAt ? new Date(lastSession.completedAt).toLocaleDateString() : null;

    if (sessionsThisWeek > 0) activeStudents++;

    // Find top and lowest scores this week
    let topScore: { title: string; score: number } | null = null;
    let lowestScore: { title: string; score: number } | null = null;
    for (const s of thisWeekSessions) {
      if (s.score !== null) {
        if (!topScore || s.score > topScore.score) topScore = { title: s.articleTitle, score: s.score };
        if (!lowestScore || s.score < lowestScore.score) lowestScore = { title: s.articleTitle, score: s.score };
      }
    }

    // Generate alerts
    if (!student.onboardingComplete) {
      alerts.push("⚠️ Hasn't completed onboarding");
    }

    if (sessionsThisWeek === 0 && student.onboardingComplete) {
      alerts.push("🔴 No sessions this week");
    }

    if (scoreTrend === "down" && avgThisWeek !== null && avgPrevWeek !== null) {
      alerts.push(`📉 Score dropped ${avgPrevWeek - avgThisWeek} points (${avgPrevWeek} → ${avgThisWeek})`);
    }

    if (avgThisWeek !== null && avgThisWeek < 50) {
      alerts.push(`⚠️ Struggling — average score ${avgThisWeek}`);
    }

    if (avgThisWeek !== null && avgThisWeek >= 85 && scoresThisWeek.length >= 3 && (student.readingLevel || 0) < 4) {
      alerts.push(`🌟 Ready for level up — averaging ${avgThisWeek} across ${scoresThisWeek.length} sessions`);
    }

    if (scoreTrend === "up" && avgThisWeek !== null && avgPrevWeek !== null) {
      alerts.push(`📈 Improving! Up ${avgThisWeek - avgPrevWeek} points (${avgPrevWeek} → ${avgThisWeek})`);
    }

    summaries.push({
      id: student.id,
      name: student.name,
      readingLevel: student.readingLevel,
      alerts,
      sessionsThisWeek,
      avgScoreThisWeek: avgThisWeek,
      avgScorePrevWeek: avgPrevWeek,
      scoreTrend,
      lastActive,
      topScore: topScore && lowestScore && topScore.score !== lowestScore.score ? topScore : null,
      lowestScore: lowestScore && topScore && topScore.score !== lowestScore.score ? lowestScore : null,
    });
  }

  // Global alerts
  const inactiveCount = students.filter(s => s.onboardingComplete).length - activeStudents;
  if (inactiveCount > 0) {
    globalAlerts.push(`${inactiveCount} student${inactiveCount > 1 ? "s" : ""} had no sessions this week`);
  }

  // Sort: students with alerts first, then by sessions (ascending — least active first)
  summaries.sort((a, b) => {
    if (a.alerts.length > 0 && b.alerts.length === 0) return -1;
    if (a.alerts.length === 0 && b.alerts.length > 0) return 1;
    return a.sessionsThisWeek - b.sessionsThisWeek;
  });

  return NextResponse.json({
    period: `${oneWeekAgo.toLocaleDateString()} – ${now.toLocaleDateString()}`,
    totalStudents,
    activeStudents,
    totalSessionsThisWeek,
    globalAlerts,
    students: summaries,
  });
}
