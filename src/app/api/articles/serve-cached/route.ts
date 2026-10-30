export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, sql } from "drizzle-orm";
import { getServingLevels } from "@/lib/level-progression";
import { getAffinities, topicsForCache } from "@/lib/interest-graph";
import { pickForFeed } from "@/lib/interest-graph/serving";

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

  // Candidate pool per level: unseen, unflagged, news no older than 7 days. Falls back to an
  // adjacent level when a level has nothing left.
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fetchPool = async (l: number) => {
    const cached = await db.select().from(schema.articleCache)
      .where(and(
        eq(schema.articleCache.readingLevel, l),
        eq(schema.articleCache.flagged, false),
        sql`(${schema.articleCache.category} != 'news' OR ${schema.articleCache.generatedDate} IS NULL OR ${schema.articleCache.generatedDate} >= ${sevenDaysAgo.toISOString().split('T')[0]})`,
      ))
      .orderBy(sql`RANDOM()`)
      .limit(60);
    return cached.filter(a => !seenTitles.has(a.title) && !currentTitles.has(a.title));
  };
  const pools = new Map<number, typeof schema.articleCache.$inferSelect[]>();
  for (const l of new Set(servingLevels)) {
    let pool = await fetchPool(l);
    if (pool.length === 0) pool = await fetchPool(l < 6 ? l + 1 : l - 1);
    pools.set(l, pool);
  }

  // Rank by the student's interests, with every third slot exploring (see interest-graph/serving)
  const allIds = [...pools.values()].flat().map(a => a.id);
  const [affinities, cacheTopics] = await Promise.all([
    getAffinities(student.id).catch(e => { console.error("Affinities unavailable, serving unranked:", e); return []; }),
    topicsForCache(allIds).catch(() => new Map<number, string[]>()),
  ]);
  const affinityMap = new Map(affinities.map(a => [a.topicSlug, a]));
  const avoid = new Set<string>();
  const taken = new Set<number>();
  const toServe: (typeof schema.articleCache.$inferSelect & { _serveLevel: number })[] = [];
  servingLevels.forEach((serveLevel, position) => {
    const pool = (pools.get(serveLevel) ?? [])
      .filter(a => !taken.has(a.id) && !toServe.some(t => t.title === a.title))
      .map(a => ({ id: a.id, topics: cacheTopics.get(a.id) ?? [], article: a }));
    const [pick] = pickForFeed(pool, affinityMap, 1, { startPosition: position, avoid });
    if (!pick) return;
    taken.add(pick.id);
    toServe.push({ ...pick.article, _serveLevel: serveLevel });
  });

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
