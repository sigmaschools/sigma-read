export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { desc, eq, sql, and, lt, count } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Today's date
  const today = new Date().toISOString().split("T")[0];

  // Today's articles (base articles only, grouped by topic)
  const todayArticles = await db.select().from(schema.articleCache)
    .where(and(
      eq(schema.articleCache.generatedDate, today),
      sql`${schema.articleCache.baseArticleId} IS NULL`
    ))
    .orderBy(schema.articleCache.topic);

  // For each today topic, get all level versions
  const todayTopics = [];
  for (const base of todayArticles) {
    const versions = await db.select({
      id: schema.articleCache.id,
      title: schema.articleCache.title,
      readingLevel: schema.articleCache.readingLevel,
      flagged: schema.articleCache.flagged,
    }).from(schema.articleCache)
      .where(sql`${schema.articleCache.id} = ${base.id} OR ${schema.articleCache.baseArticleId} = ${base.id}`)
      .orderBy(schema.articleCache.readingLevel);

    todayTopics.push({
      id: base.id,
      topic: base.topic,
      category: base.category,
      source: base.headlineSource,
      flagged: versions.every(v => v.flagged),
      versions,
    });
  }

  // If no articles today, check latest batch date
  let latestBatchDate = today;
  if (todayArticles.length === 0) {
    const [latest] = await db.select({ date: schema.articleCache.generatedDate })
      .from(schema.articleCache)
      .where(sql`${schema.articleCache.baseArticleId} IS NULL`)
      .orderBy(desc(schema.articleCache.createdAt))
      .limit(1);
    if (latest?.date) {
      latestBatchDate = latest.date;
      // Fetch that batch instead
      const batchArticles = await db.select().from(schema.articleCache)
        .where(and(
          eq(schema.articleCache.generatedDate, latestBatchDate),
          sql`${schema.articleCache.baseArticleId} IS NULL`
        ))
        .orderBy(schema.articleCache.topic);

      for (const base of batchArticles) {
        const versions = await db.select({
          id: schema.articleCache.id,
          title: schema.articleCache.title,
          readingLevel: schema.articleCache.readingLevel,
          flagged: schema.articleCache.flagged,
        }).from(schema.articleCache)
          .where(sql`${schema.articleCache.id} = ${base.id} OR ${schema.articleCache.baseArticleId} = ${base.id}`)
          .orderBy(schema.articleCache.readingLevel);

        todayTopics.push({
          id: base.id,
          topic: base.topic,
          category: base.category,
          source: base.headlineSource,
          flagged: versions.every(v => v.flagged),
          versions,
        });
      }
    }
  }

  // Category mix for current batch
  const catMix: Record<string, number> = {};
  todayTopics.forEach(t => { catMix[t.category] = (catMix[t.category] || 0) + 1; });

  // Archive: older batches (just date + count + topics as L4 headlines)
  const archiveDates = await db.select({
    date: schema.articleCache.generatedDate,
    count: count(),
  }).from(schema.articleCache)
    .where(and(
      sql`${schema.articleCache.baseArticleId} IS NULL`,
      sql`${schema.articleCache.generatedDate} != ${latestBatchDate}`
    ))
    .groupBy(schema.articleCache.generatedDate)
    .orderBy(desc(schema.articleCache.generatedDate));

  // Buffer health: how many onboarded students have 12+ unread articles
  const allStudents = await db.select({ id: schema.students.id })
    .from(schema.students)
    .where(eq(schema.students.onboardingComplete, true));

  let fullBuffers = 0;
  for (const s of allStudents) {
    const [unread] = await db.select({ count: count() })
      .from(schema.articles)
      .where(and(eq(schema.articles.studentId, s.id), eq(schema.articles.read, false)));
    if (unread.count >= 12) fullBuffers++;
  }

  return NextResponse.json({
    batchDate: latestBatchDate,
    isToday: latestBatchDate === today,
    topics: todayTopics,
    categoryMix: catMix,
    archive: archiveDates,
    bufferHealth: { full: fullBuffers, total: allStudents.length },
  });
}

// Fetch archive articles for a specific date
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { date } = await req.json();
  if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

  // Get base articles for that date, return L4 headline (or highest level)
  const articles = await db.select({
    id: schema.articleCache.id,
    title: schema.articleCache.title,
    topic: schema.articleCache.topic,
    category: schema.articleCache.category,
    readingLevel: schema.articleCache.readingLevel,
    flagged: schema.articleCache.flagged,
  }).from(schema.articleCache)
    .where(and(
      eq(schema.articleCache.generatedDate, date),
      sql`${schema.articleCache.baseArticleId} IS NULL`
    ))
    .orderBy(schema.articleCache.topic);

  // For each, get the L4 version title (most descriptive)
  const result = [];
  for (const a of articles) {
    const [l4] = await db.select({ title: schema.articleCache.title })
      .from(schema.articleCache)
      .where(and(
        sql`(${schema.articleCache.baseArticleId} = ${a.id} OR ${schema.articleCache.id} = ${a.id})`,
        eq(schema.articleCache.readingLevel, 4)
      ))
      .limit(1);
    result.push({
      id: a.id,
      topic: a.topic,
      headline: l4?.title || a.title,
      category: a.category,
      flagged: a.flagged,
    });
  }

  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, flagged } = await req.json();
  if (!id || typeof flagged !== "boolean") return NextResponse.json({ error: "Missing id or flagged" }, { status: 400 });

  // Flag/unflag this article and all its adaptations
  const [article] = await db.select().from(schema.articleCache).where(eq(schema.articleCache.id, id)).limit(1);
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const baseId = article.baseArticleId || article.id;
  await db.update(schema.articleCache).set({ flagged })
    .where(sql`${schema.articleCache.id} = ${baseId} OR ${schema.articleCache.baseArticleId} = ${baseId}`);

  // If flagging, add to blocked topics
  if (flagged) {
    const existing = await db.select().from(schema.blockedTopics)
      .where(eq(schema.blockedTopics.topic, article.topic)).limit(1);
    if (existing.length === 0) {
      await db.insert(schema.blockedTopics).values({
        topic: article.topic,
        reason: "Flagged by admin",
        blockedBy: session.userId,
      });
    }
  } else {
    // Unflagging removes from blocked
    await db.delete(schema.blockedTopics).where(eq(schema.blockedTopics.topic, article.topic));
  }

  return NextResponse.json({ ok: true, flagged });
}
