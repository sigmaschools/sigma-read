export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sql, eq, gte, count, desc, and } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Student stats
  const allStudents = await db.select().from(schema.students);
  const totalStudents = allStudents.length;
  const onboarded = allStudents.filter(s => s.onboardingComplete).length;

  // Guide stats
  const allGuides = await db.select({ id: schema.guides.id, name: schema.guides.name, email: schema.guides.email }).from(schema.guides);

  // Session stats
  const [sessionsToday] = await db.select({ count: count() }).from(schema.readingSessions)
    .where(gte(schema.readingSessions.startedAt, today));
  const [sessionsThisWeek] = await db.select({ count: count() }).from(schema.readingSessions)
    .where(gte(schema.readingSessions.startedAt, weekAgo));
  const [sessionsTotal] = await db.select({ count: count() }).from(schema.readingSessions);

  // Article cache counts by level
  const cacheCounts = await db.select({
    level: schema.articleCache.readingLevel,
    count: count(),
  }).from(schema.articleCache)
    .groupBy(schema.articleCache.readingLevel);

  // Recent batch run — check article_cache for latest generated_date
  const [latestBatch] = await db.select({ date: schema.articleCache.generatedDate })
    .from(schema.articleCache)
    .orderBy(desc(schema.articleCache.createdAt))
    .limit(1);

  // Alerts
  const alerts: string[] = [];

  // Inactive students (7+ days no sessions)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentSessions = await db.select({ studentId: schema.readingSessions.studentId })
    .from(schema.readingSessions)
    .where(gte(schema.readingSessions.startedAt, sevenDaysAgo));
  const activeStudentIds = new Set(recentSessions.map(r => r.studentId));
  const inactiveOnboarded = allStudents.filter(s => s.onboardingComplete && !activeStudentIds.has(s.id));
  if (inactiveOnboarded.length > 0) {
    alerts.push(`${inactiveOnboarded.length} student${inactiveOnboarded.length > 1 ? "s" : ""} inactive for 7+ days`);
  }

  // Low cache levels
  const cacheMap: Record<number, number> = {};
  cacheCounts.forEach(c => { if (c.level) cacheMap[c.level] = c.count; });
  for (let level = 1; level <= 6; level++) {
    if ((cacheMap[level] || 0) < 5) {
      alerts.push(`Article cache low for L${level}: only ${cacheMap[level] || 0} articles`);
    }
  }

  // Morning batch check
  if (latestBatch?.date) {
    const batchDate = new Date(latestBatch.date);
    const hoursSince = (now.getTime() - batchDate.getTime()) / (1000 * 60 * 60);
    if (hoursSince > 36) {
      alerts.push(`Morning batch hasn't run in ${Math.round(hoursSince)} hours`);
    }
  }

  // Level changes this week
  const levelChanges = await db.select({
    studentId: schema.levelHistory.studentId,
    fromLevel: schema.levelHistory.fromLevel,
    toLevel: schema.levelHistory.toLevel,
  }).from(schema.levelHistory).where(gte(schema.levelHistory.changedAt, weekAgo));

  for (const lc of levelChanges) {
    const student = allStudents.find(s => s.id === lc.studentId);
    if (student) {
      const dir = lc.toLevel > lc.fromLevel ? "up" : "down";
      alerts.push(`${student.name.split(" ")[0]} moved ${dir}: L${lc.fromLevel} → L${lc.toLevel}`);
    }
  }

  return NextResponse.json({
    stats: {
      totalStudents,
      onboardedStudents: onboarded,
      totalGuides: allGuides.length,
      sessionsToday: sessionsToday.count,
      sessionsThisWeek: sessionsThisWeek.count,
      sessionsTotal: sessionsTotal.count,
      cacheByLevel: cacheMap,
      lastBatchDate: latestBatch?.date || null,
    },
    guides: allGuides,
    alerts,
  });
}
