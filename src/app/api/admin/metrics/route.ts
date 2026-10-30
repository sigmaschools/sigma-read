export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { count, gte, sql, eq, desc, and, isNull } from "drizzle-orm";

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
  const [cacheCount] = await db.select({ count: count() }).from(schema.articleCache)
    .where(sql`${schema.articleCache.baseArticleId} IS NULL`);
  const [reportCount] = await db.select({ count: count() }).from(schema.comprehensionReports);

  // Very rough: Opus conversation ~$0.10/conversation, Opus report ~$0.03, Opus base article ~$0.08, Sonnet adaptation ~$0.01
  const conversationCost = (convCount.count || 0) * 0.10;
  const reportCost = (reportCount.count || 0) * 0.03;
  // cacheCount now already counts only base articles
  const articleCost = (cacheCount.count || 0) * 0.09;

  // Tracked spend (ai_usage), last 30 days. Empty until the table exists and calls are recorded.
  const u = schema.aiUsage;
  const spendSum = sql<string>`COALESCE(SUM(${u.costUsd}), 0)`;
  const usage = await Promise.all([
    db.select({ feature: u.feature, calls: count(), cost: spendSum, inputTokens: sql<string>`SUM(${u.inputTokens})`, outputTokens: sql<string>`SUM(${u.outputTokens})` })
      .from(u).where(gte(u.createdAt, thirtyDaysAgo)).groupBy(u.feature).orderBy(desc(spendSum)),
    db.select({ date: sql<string>`DATE(${u.createdAt})`, cost: spendSum })
      .from(u).where(gte(u.createdAt, thirtyDaysAgo)).groupBy(sql`DATE(${u.createdAt})`).orderBy(sql`DATE(${u.createdAt})`),
    db.select({ unpriced: count() }).from(u).where(and(gte(u.createdAt, thirtyDaysAgo), isNull(u.costUsd))),
  ]).then(([byFeature, byDay, [unpriced]]) => ({
    byFeature: byFeature.map(f => ({ feature: f.feature, calls: f.calls, cost: Number(f.cost), inputTokens: Number(f.inputTokens), outputTokens: Number(f.outputTokens) })),
    byDay: byDay.map(d => ({ date: d.date, cost: Number(d.cost) })),
    total30d: byFeature.reduce((sum, f) => sum + Number(f.cost), 0),
    unpricedCalls: unpriced.unpriced,
  })).catch(e => {
    console.error("ai_usage query failed:", e);
    return { byFeature: [], byDay: [], total30d: 0, unpricedCalls: 0 };
  });

  return NextResponse.json({
    usage,
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
