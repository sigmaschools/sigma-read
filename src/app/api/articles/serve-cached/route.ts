export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, sql } from "drizzle-orm";
import { getServingLevels } from "@/lib/level-progression";

// Serve pre-cached articles to a student based on their reading level and feed mix.
// Respects: no repeats (via student_article_history), daily cap, buffer management, gradual mix.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, session.userId)).limit(1);
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level = student.readingLevel || 2;

  // Check daily cap — how many articles has this student completed today?
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const [todayCount] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.readingSessions)
    .innerJoin(schema.conversations, and(
      eq(schema.conversations.readingSessionId, schema.readingSessions.id),
      eq(schema.conversations.complete, true),
    ))
    .where(and(
      eq(schema.readingSessions.studentId, student.id),
      sql`${schema.readingSessions.completedAt} >= ${todayStart}`,
    ));
  
  const dailyCap = student.dailyArticleCap || 5;
  const completedToday = Number(todayCount?.count || 0);
  
  if (completedToday >= dailyCap) {
    return NextResponse.json({ message: "Daily reading goal reached", count: 0, goalReached: true });
  }

  // Get titles this student has already been served (via history tracking)
  const historyRows = await db.select({ title: schema.studentArticleHistory.articleTitle })
    .from(schema.studentArticleHistory)
    .where(eq(schema.studentArticleHistory.studentId, student.id));
  const seenTitles = new Set(historyRows.map(h => h.title));

  // Also get current unread article titles to avoid duplicates in current feed
  const currentArticles = await db.select({ title: schema.articles.title })
    .from(schema.articles)
    .where(and(eq(schema.articles.studentId, student.id), eq(schema.articles.read, false)));
  const currentTitles = new Set(currentArticles.map(a => a.title));

  // Determine serving levels based on feed mix (gradual progression)
  const feedMix = student.feedMix as any;
  const servingLevels = getServingLevels(level, feedMix, 3);

  // Group levels needed and fetch articles for each
  const toServe: (typeof schema.articleCache.$inferSelect & { _serveLevel: number })[] = [];
  const levelCounts = new Map<number, number>();
  for (const l of servingLevels) {
    levelCounts.set(l, (levelCounts.get(l) || 0) + 1);
  }

  for (const [serveLevel, count] of levelCounts) {
    // News articles expire after 7 days — don't serve stale news to new students
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const cached = await db.select().from(schema.articleCache)
      .where(and(
        eq(schema.articleCache.readingLevel, serveLevel),
        eq(schema.articleCache.flagged, false),
        sql`(${schema.articleCache.category} != 'news' OR ${schema.articleCache.generatedDate} IS NULL OR ${schema.articleCache.generatedDate} >= ${sevenDaysAgo.toISOString().split('T')[0]})`,
      ))
      .orderBy(sql`RANDOM()`)
      .limit(20);

    const available = cached.filter(a => !seenTitles.has(a.title) && !currentTitles.has(a.title));
    for (const a of available.slice(0, count)) {
      toServe.push({ ...a, _serveLevel: serveLevel });
    }
  }

  if (toServe.length === 0) {
    return NextResponse.json({ message: "No new articles available", count: 0 });
  }

  // Copy cached articles to the student's feed and track in history
  const inserted = [];
  for (const c of toServe) {
    const [article] = await db.insert(schema.articles).values({
      studentId: student.id,
      title: c.title,
      topic: c.topic,
      bodyText: c.bodyText,
      readingLevel: c._serveLevel,
      sources: c.sources || [],
      estimatedReadTime: c.estimatedReadTime || 4,
      category: c.category || "general",
      sourceCacheId: c.id,
      servedAsLevel: c._serveLevel !== level ? c._serveLevel : null, // only set if different from base
    }).returning();
    inserted.push(article);

    // Track in history so this student never sees this article again
    await db.insert(schema.studentArticleHistory).values({
      studentId: student.id,
      articleCacheId: c.id,
      articleTitle: c.title,
    });
  }

  return NextResponse.json({ message: "Served cached articles", count: inserted.length, articles: inserted });
}
