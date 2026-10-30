/** Shapes /api/v1 returns for students, shared by the list and detail routes */

import { and, count, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { skillSummary } from "@/lib/skills";

type StudentRow = typeof schema.students.$inferSelect;

/** Last active time and sessions completed this week, for a page of students */
export async function activityFor(studentIds: number[]) {
  if (studentIds.length === 0) return new Map<number, { lastActiveAt: string | null; sessionsThisWeek: number }>();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rs = schema.readingSessions;
  const [last, week] = await Promise.all([
    db.select({ studentId: rs.studentId, at: sql<string>`MAX(${rs.startedAt})` }).from(rs)
      .where(inArray(rs.studentId, studentIds)).groupBy(rs.studentId),
    db.select({ studentId: rs.studentId, n: count() }).from(rs)
      .where(and(inArray(rs.studentId, studentIds), gte(rs.completedAt, weekAgo))).groupBy(rs.studentId),
  ]);
  const map = new Map(studentIds.map(id => [id, { lastActiveAt: null as string | null, sessionsThisWeek: 0 }]));
  for (const l of last) map.get(l.studentId)!.lastActiveAt = l.at ? new Date(l.at).toISOString() : null;
  for (const w of week) map.get(w.studentId)!.sessionsThisWeek = w.n;
  return map;
}

export function studentOut(
  s: StudentRow,
  guideExternalIds: Map<number, string | null>,
  activity: { lastActiveAt: string | null; sessionsThisWeek: number } | undefined,
) {
  return {
    id: s.id,
    externalId: s.externalId,
    name: s.name,
    gradeLevel: s.gradeLevel,
    readingLevel: s.readingLevel,
    onboardingComplete: s.onboardingComplete,
    guide: { id: s.guideId, externalId: guideExternalIds.get(s.guideId) ?? null },
    lastActiveAt: activity?.lastActiveAt ?? null,
    sessionsThisWeek: activity?.sessionsThisWeek ?? 0,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function guideExternalIds(guideIds: number[]) {
  if (guideIds.length === 0) return new Map<number, string | null>();
  const rows = await db.select({ id: schema.guides.id, externalId: schema.guides.externalId })
    .from(schema.guides).where(inArray(schema.guides.id, [...new Set(guideIds)]));
  return new Map(rows.map(r => [r.id, r.externalId]));
}

/** One student with level history and a 30-day score and skill trend */
export async function studentDetail(s: StudentRow) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [guides, activity, levels, reports] = await Promise.all([
    guideExternalIds([s.guideId]),
    activityFor([s.id]),
    db.select({ fromLevel: schema.levelHistory.fromLevel, toLevel: schema.levelHistory.toLevel, changedAt: schema.levelHistory.changedAt })
      .from(schema.levelHistory).where(eq(schema.levelHistory.studentId, s.id)).orderBy(desc(schema.levelHistory.changedAt)),
    db.select({ score: schema.comprehensionReports.score, skills: schema.comprehensionReports.skills })
      .from(schema.conversations)
      .innerJoin(schema.readingSessions, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
      // Latest report per conversation
      .innerJoin(schema.comprehensionReports, eq(schema.comprehensionReports.id, sql`(SELECT max(id) FROM comprehension_reports WHERE conversation_id = ${schema.conversations.id})`))
      .where(and(eq(schema.readingSessions.studentId, s.id), isNotNull(schema.readingSessions.completedAt), gte(schema.readingSessions.completedAt, thirtyDaysAgo)))
      .orderBy(desc(schema.comprehensionReports.id)),
  ]);
  const skills = skillSummary(reports, reports.length);
  return {
    ...studentOut(s, guides, activity.get(s.id)),
    levelHistory: levels.map(l => ({ fromLevel: l.fromLevel, toLevel: l.toLevel, changedAt: l.changedAt.toISOString() })),
    last30Days: {
      reports: reports.length,
      averageScore: reports.length ? Math.round(reports.reduce((sum, r) => sum + r.score, 0) / reports.length) : null,
      skills: skills.rows.map(r => ({ skill: r.skill, tested: r.tested, shown: r.shown, partly: r.partly, notShown: r.notShown })),
    },
  };
}
