export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, desc, and, gte, sql } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "guide") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all students for this guide
  const students = await db
    .select()
    .from(schema.students)
    .where(eq(schema.students.guideId, session.userId));

  if (students.length === 0) {
    return NextResponse.json({ students: [] });
  }

  const studentIds = students.map((s) => s.id);

  // Batch: get all reports for all students in one query
  const allReports = await db
    .select({
      studentId: schema.readingSessions.studentId,
      score: schema.comprehensionReports.score,
      rating: schema.comprehensionReports.rating,
      selfAssessment: schema.comprehensionReports.selfAssessment,
      completedAt: schema.readingSessions.completedAt,
    })
    .from(schema.comprehensionReports)
    .innerJoin(
      schema.conversations,
      eq(schema.comprehensionReports.conversationId, schema.conversations.id)
    )
    .innerJoin(
      schema.readingSessions,
      eq(schema.conversations.readingSessionId, schema.readingSessions.id)
    )
    .where(
      sql`${schema.readingSessions.studentId} IN (${sql.join(
        studentIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    )
    .orderBy(desc(schema.readingSessions.completedAt));

  // Group reports by student
  const reportsByStudent: Record<number, typeof allReports> = {};
  for (const r of allReports) {
    if (!reportsByStudent[r.studentId]) reportsByStudent[r.studentId] = [];
    reportsByStudent[r.studentId].push(r);
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Build dashboard data
  const dashboardStudents = students.map((s) => {
    const reports = reportsByStudent[s.id] || [];
    const thisWeek = reports.filter(
      (r) => r.completedAt && new Date(r.completedAt) > weekAgo
    );
    const avgScore =
      thisWeek.length > 0
        ? Math.round(
            thisWeek.reduce((a, r) => a + (r.score || 0), 0) / thisWeek.length
          )
        : null;
    const totalSessions = reports.length;
    const sessionsThisWeek = thisWeek.length;

    // Status: succeeding, on-track, struggling, inactive
    let status: "succeeding" | "on-track" | "struggling" | "inactive" | "new" = "new";
    if (!s.onboardingComplete) {
      status = "new";
    } else if (totalSessions === 0) {
      status = "inactive";
    } else if (avgScore !== null) {
      if (avgScore >= 80) status = "succeeding";
      else if (avgScore >= 60) status = "on-track";
      else status = "struggling";
    } else if (sessionsThisWeek === 0) {
      status = "inactive";
    }

    const weeklySessionTarget = s.weeklySessionTarget || (s.dailyArticleCap || 5) * 5;

    return {
      id: s.id,
      name: s.name,
      username: s.username,
      readingLevel: s.readingLevel,
      gradeLevel: s.gradeLevel,
      age: s.age,
      onboardingComplete: s.onboardingComplete,
      avgScore,
      totalSessions,
      sessionsThisWeek,
      weeklySessionTarget,
      status,
    };
  });

  // Sort: struggling first, then on-track, succeeding, inactive, new
  const statusOrder: Record<string, number> = {
    struggling: 0,
    "on-track": 1,
    succeeding: 2,
    inactive: 3,
    new: 4,
  };
  dashboardStudents.sort((a, b) => {
    const orderDiff = statusOrder[a.status] - statusOrder[b.status];
    if (orderDiff !== 0) return orderDiff;
    if (a.avgScore !== null && b.avgScore !== null) return a.avgScore - b.avgScore;
    if (a.avgScore === null) return 1;
    return -1;
  });

  // Class-level analytics
  const activeStudents = dashboardStudents.filter(s => s.sessionsThisWeek > 0).length;
  const totalStudents = dashboardStudents.length;
  const totalSessionsThisWeek = dashboardStudents.reduce((a, s) => a + s.sessionsThisWeek, 0);
  const studentsWithScores = dashboardStudents.filter(s => s.avgScore !== null);
  const classAvgScore = studentsWithScores.length > 0
    ? Math.round(studentsWithScores.reduce((a, s) => a + (s.avgScore || 0), 0) / studentsWithScores.length)
    : null;
  const needsAttention = dashboardStudents.filter(s => s.status === "struggling" || s.status === "inactive").length;

  // Generate alerts
  const alerts: string[] = [];
  const inactiveStudents = dashboardStudents.filter(s => s.status === "inactive" && s.onboardingComplete);
  if (inactiveStudents.length > 0) {
    alerts.push(`${inactiveStudents.length} student${inactiveStudents.length > 1 ? "s haven't" : " hasn't"} read this week`);
  }

  // Check for level changes this week
  const levelChanges = await db.select({
    studentId: schema.levelHistory.studentId,
    fromLevel: schema.levelHistory.fromLevel,
    toLevel: schema.levelHistory.toLevel,
  }).from(schema.levelHistory).where(gte(schema.levelHistory.changedAt, weekAgo));
  
  for (const lc of levelChanges) {
    const student = students.find(s => s.id === lc.studentId);
    if (student && lc.toLevel > lc.fromLevel) {
      alerts.push(`${student.name.split(" ")[0]} moved up to Level ${lc.toLevel}! 🎉`);
    } else if (student && lc.toLevel < lc.fromLevel) {
      alerts.push(`${student.name.split(" ")[0]} dropped to Level ${lc.toLevel}`);
    }
  }

  // Check for consecutive low scores
  for (const s of students) {
    const reports = reportsByStudent[s.id] || [];
    const recent = reports.slice(0, 2);
    if (recent.length >= 2 && recent.every(r => (r.score || 100) < 40)) {
      alerts.push(`${s.name.split(" ")[0]} scored below 40 on 2 consecutive sessions`);
    }
  }

  return NextResponse.json({
    students: dashboardStudents,
    classStats: { activeStudents, totalStudents, totalSessionsThisWeek, classAvgScore, needsAttention },
    alerts,
  });
}
