export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, sql } from "drizzle-orm";

// Serve pre-cached articles to a student based on their reading level.
// Respects: no repeats (via student_article_history), daily cap, buffer management.
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

  // Get 3 articles from cache that this student hasn't seen
  const allCached = await db.select().from(schema.articleCache)
    .where(and(eq(schema.articleCache.readingLevel, level), eq(schema.articleCache.flagged, false)))
    .orderBy(sql`RANDOM()`)
    .limit(20);
  
  const available = allCached.filter(a => !seenTitles.has(a.title) && !currentTitles.has(a.title));
  const toServe = available.slice(0, 3);

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
      readingLevel: level,
      sources: c.sources || [],
      estimatedReadTime: c.estimatedReadTime || 4,
      category: c.category || "general",
      sourceCacheId: c.id,
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
