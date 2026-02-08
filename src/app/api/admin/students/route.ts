export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, gte, desc, count, avg, sql } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const students = await db.select({
    id: schema.students.id,
    name: schema.students.name,
    username: schema.students.username,
    guideId: schema.students.guideId,
    readingLevel: schema.students.readingLevel,
    gradeLevel: schema.students.gradeLevel,
    age: schema.students.age,
    onboardingComplete: schema.students.onboardingComplete,
    totalSessionsCompleted: schema.students.totalSessionsCompleted,
    createdAt: schema.students.createdAt,
  }).from(schema.students).orderBy(schema.students.name);

  const guides = await db.select({ id: schema.guides.id, name: schema.guides.name })
    .from(schema.guides);
  const guideMap: Record<number, string> = {};
  guides.forEach(g => { guideMap[g.id] = g.name; });

  // Get weekly sessions per student
  const weekSessions = await db.select({
    studentId: schema.readingSessions.studentId,
    cnt: count(),
  }).from(schema.readingSessions)
    .where(gte(schema.readingSessions.startedAt, weekAgo))
    .groupBy(schema.readingSessions.studentId);
  const weekMap: Record<number, number> = {};
  weekSessions.forEach(w => { weekMap[w.studentId] = w.cnt; });

  // Get avg scores per student (last 5)
  const reports = await db.select({
    studentId: schema.readingSessions.studentId,
    score: schema.comprehensionReports.score,
  }).from(schema.comprehensionReports)
    .innerJoin(schema.conversations, eq(schema.comprehensionReports.conversationId, schema.conversations.id))
    .innerJoin(schema.readingSessions, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
    .orderBy(desc(schema.comprehensionReports.createdAt));

  const scoresByStudent: Record<number, number[]> = {};
  for (const r of reports) {
    if (r.score !== null) {
      if (!scoresByStudent[r.studentId]) scoresByStudent[r.studentId] = [];
      if (scoresByStudent[r.studentId].length < 5) scoresByStudent[r.studentId].push(r.score);
    }
  }

  // Last active per student
  const lastActive = await db.select({
    studentId: schema.readingSessions.studentId,
    lastAt: sql<string>`MAX(${schema.readingSessions.startedAt})`,
  }).from(schema.readingSessions)
    .groupBy(schema.readingSessions.studentId);
  const lastMap: Record<number, string> = {};
  lastActive.forEach(l => { lastMap[l.studentId] = l.lastAt; });

  const result = students.map(s => {
    const scores = scoresByStudent[s.id] || [];
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const sessionsThisWeek = weekMap[s.id] || 0;
    let status: string = "new";
    if (!s.onboardingComplete) status = "new";
    else if (sessionsThisWeek === 0) status = "inactive";
    else if (avgScore !== null && avgScore >= 75) status = "succeeding";
    else if (avgScore !== null && avgScore < 50) status = "struggling";
    else status = "on-track";

    return {
      ...s,
      guideName: guideMap[s.guideId] || "Unknown",
      avgScore,
      sessionsThisWeek,
      lastActive: lastMap[s.id] || null,
      status,
    };
  });

  return NextResponse.json(result);
}
