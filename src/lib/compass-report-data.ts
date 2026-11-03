/**
 * Load the data for Compass report blocks (see src/lib/compass-report.ts).
 */

import { db, schema } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import { buildLevelReport, buildComprehensionReport, type LevelReport, type ComprehensionCompassReport } from "@/lib/compass-report";

/** The student's `level` report, or null before a level is set (during onboarding). */
export async function getLevelReport(studentId: number): Promise<LevelReport | null> {
  const [student] = await db.select({ readingLevel: schema.students.readingLevel, createdAt: schema.students.createdAt })
    .from(schema.students).where(eq(schema.students.id, studentId)).limit(1);
  if (!student || student.readingLevel === null) return null;

  const changes = await db.select({
    fromLevel: schema.levelHistory.fromLevel,
    toLevel: schema.levelHistory.toLevel,
    changedAt: schema.levelHistory.changedAt,
  }).from(schema.levelHistory)
    .where(eq(schema.levelHistory.studentId, studentId))
    .orderBy(asc(schema.levelHistory.changedAt));

  return buildLevelReport({ currentLevel: student.readingLevel, firstSetAt: student.createdAt, changes });
}

/** The `comprehension` report for a finished conversation, or null if it has no report (tutorials, failures). */
export async function getComprehensionCompassReport(conversationId: number): Promise<ComprehensionCompassReport | null> {
  const [row] = await db.select({
    report: schema.comprehensionReports,
    articleTitle: schema.articles.title,
    articleText: schema.articles.bodyText,
    articleLevel: schema.articles.readingLevel,
    finishedAt: schema.readingSessions.completedAt,
    currentLevel: schema.students.readingLevel,
  })
    .from(schema.comprehensionReports)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.comprehensionReports.conversationId))
    .innerJoin(schema.readingSessions, eq(schema.readingSessions.id, schema.conversations.readingSessionId))
    .innerJoin(schema.articles, eq(schema.articles.id, schema.readingSessions.articleId))
    .innerJoin(schema.students, eq(schema.students.id, schema.readingSessions.studentId))
    .where(eq(schema.comprehensionReports.conversationId, conversationId))
    .limit(1);
  if (!row) return null;

  return buildComprehensionReport({
    articleTitle: row.articleTitle,
    articleText: row.articleText,
    articleLevel: row.articleLevel,
    score: row.report.score,
    skills: row.report.skills,
    selfAssessment: row.report.selfAssessment,
    finishedAt: row.finishedAt,
    levelBefore: row.report.levelBefore,
    levelAfter: row.report.levelAfter,
    currentLevel: row.currentLevel ?? 2,
  });
}

/** Like getComprehensionCompassReport, but never throws: the report is extra data for Compass and must not fail a student's request. */
export async function safeComprehensionCompassReport(conversationId: number): Promise<ComprehensionCompassReport | null> {
  try {
    return await getComprehensionCompassReport(conversationId);
  } catch (e) {
    console.error(`Compass report for conversation ${conversationId} failed:`, e);
    return null;
  }
}
