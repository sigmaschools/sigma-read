export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { count, gte, sql, eq, desc } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Sessions per day (last 30 days)
  const sessionsPerDay = await db.select({
    date: sql<string>`DATE(${schema.readingSessions.startedAt})`,
    count: count(),
  }).from(schema.readingSessions)
    .where(gte(schema.readingSessions.startedAt, thirtyDaysAgo))
    .groupBy(sql`DATE(${schema.readingSessions.startedAt})`)
    .orderBy(sql`DATE(${schema.readingSessions.startedAt})`);

  // Avg score by level
  const scoresByLevel = await db.select({
    level: schema.students.readingLevel,
    avgScore: sql<number>`ROUND(AVG(${schema.comprehensionReports.score}))`,
    count: count(),
  }).from(schema.comprehensionReports)
    .innerJoin(schema.conversations, eq(schema.comprehensionReports.conversationId, schema.conversations.id))
    .innerJoin(schema.readingSessions, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
    .innerJoin(schema.students, eq(schema.readingSessions.studentId, schema.students.id))
    .groupBy(schema.students.readingLevel);

  // Self-assessment accuracy
  const assessments = await db.select({
    selfAssessment: schema.comprehensionReports.selfAssessment,
    score: schema.comprehensionReports.score,
  }).from(schema.comprehensionReports)
    .where(sql`${schema.comprehensionReports.selfAssessment} IS NOT NULL`);

  let accurate = 0, over = 0, under = 0;
  for (const a of assessments) {
    if (!a.score || !a.selfAssessment) continue;
    const expectedMin = a.selfAssessment === "really_well" ? 75 : a.selfAssessment === "pretty_well" ? 55 : a.selfAssessment === "not_sure" ? 35 : 0;
    const expectedMax = a.selfAssessment === "really_well" ? 100 : a.selfAssessment === "pretty_well" ? 74 : a.selfAssessment === "not_sure" ? 54 : 34;
    if (a.score < expectedMin) over++;
    else if (a.score > expectedMax) under++;
    else accurate++;
  }
  const assessTotal = accurate + over + under;

  // Conversation style distribution
  const styles = await db.select({
    style: schema.conversations.conversationStyle,
    count: count(),
  }).from(schema.conversations)
    .where(sql`${schema.conversations.conversationStyle} IS NOT NULL`)
    .groupBy(schema.conversations.conversationStyle);

  // Cost estimates (rough)
  const [convCount] = await db.select({ count: count() }).from(schema.conversations);
  const [cacheCount] = await db.select({ count: count() }).from(schema.articleCache);
  const [reportCount] = await db.select({ count: count() }).from(schema.comprehensionReports);

  // Very rough: Opus conversation ~$0.10/conversation, Opus report ~$0.03, Opus base article ~$0.08, Sonnet adaptation ~$0.01
  const conversationCost = (convCount.count || 0) * 0.10;
  const reportCost = (reportCount.count || 0) * 0.03;
  // Estimate base articles from cache (unique base_article_id count or total/4)
  const baseArticleCount = Math.ceil((cacheCount.count || 0) / 4);
  const articleCost = baseArticleCount * 0.08 + ((cacheCount.count || 0) - baseArticleCount) * 0.01;

  return NextResponse.json({
    sessionsPerDay,
    scoresByLevel,
    selfAssessment: { accurate, overconfident: over, underconfident: under, total: assessTotal },
    conversationStyles: styles,
    costs: {
      conversations: Math.round(conversationCost * 100) / 100,
      reports: Math.round(reportCost * 100) / 100,
      articles: Math.round(articleCost * 100) / 100,
      total: Math.round((conversationCost + reportCost + articleCost) * 100) / 100,
    },
    counts: {
      conversations: convCount.count,
      articles: cacheCount.count,
      reports: reportCount.count,
    },
  });
}
