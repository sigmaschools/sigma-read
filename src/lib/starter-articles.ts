/**
 * A new student's first articles: one per top interest, ready by the time the onboarding
 * tutorial ends. Each interest is served from the shared cache when an unseen article on that
 * topic exists at the student's level, and written on the spot (same source-first steps as the
 * morning batch) when not.
 *
 * Runs in the background after the interest chat saves the profile. The student's
 * starter_articles_status is "pending" until it finishes, then "done", even if some failed:
 * the home page tops up the feed from the cache as usual.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resolveTopics } from "@/lib/interest-graph";
import { starterInterests } from "@/lib/starter-plan";

async function setStatus(studentId: number, status: "pending" | "done") {
  await db.update(schema.students).set({ starterArticlesStatus: status }).where(eq(schema.students.id, studentId));
}

export async function markStarterPending(studentId: number) {
  await setStatus(studentId, "pending");
}

/** Copies a cache row into the student's feed and history; false if they already have it */
async function serveCacheRow(studentId: number, cacheId: number): Promise<boolean> {
  const [row] = await db.select().from(schema.articleCache).where(eq(schema.articleCache.id, cacheId)).limit(1);
  if (!row) return false;
  const [had] = await db.select({ id: schema.studentArticleHistory.id }).from(schema.studentArticleHistory)
    .where(and(eq(schema.studentArticleHistory.studentId, studentId), eq(schema.studentArticleHistory.articleTitle, row.title)))
    .limit(1);
  if (had) return false;
  await db.insert(schema.articles).values({
    studentId,
    title: row.title,
    topic: row.topic,
    bodyText: row.bodyText,
    readingLevel: row.readingLevel,
    sources: row.sources || [],
    estimatedReadTime: row.estimatedReadTime || 4,
    category: row.category || "interest",
    sourceCacheId: row.id,
  });
  await db.insert(schema.studentArticleHistory).values({ studentId, articleCacheId: row.id, articleTitle: row.title });
  return true;
}

/** Newest unseen, unflagged cache article at `level` tagged with `slug` */
async function cachedForTopic(studentId: number, level: number, slug: string, skip: number[]): Promise<number | null> {
  const c = schema.articleCache;
  const rows = await db.select({ id: c.id }).from(c)
    .where(and(
      eq(c.readingLevel, level),
      eq(c.flagged, false),
      sql`EXISTS (SELECT 1 FROM article_topics t WHERE t.article_cache_id = COALESCE(${c.baseArticleId}, ${c.id}) AND t.topic_slug = ${slug})`,
      sql`NOT EXISTS (SELECT 1 FROM student_article_history h WHERE h.student_id = ${studentId} AND h.article_title = ${c.title})`,
    ))
    .orderBy(desc(c.createdAt))
    .limit(skip.length + 1);
  return rows.find(r => !skip.includes(r.id))?.id ?? null;
}

export async function prepareStarterArticles(studentId: number, client: Anthropic): Promise<void> {
  try {
    const [student] = await db.select().from(schema.students).where(eq(schema.students.id, studentId)).limit(1);
    if (!student) return;
    const level = student.readingLevel || 2;
    const interests = starterInterests(student.interestProfile);

    const slugs = await resolveTopics(interests, { client, studentId })
      .catch(e => { console.error("Starter articles: topic lookup failed, writing every interest:", e); return new Map<string, string | null>(); });

    // Cache first: instant, and nothing to write
    const served: number[] = [];
    const toWrite: string[] = [];
    for (const interest of interests) {
      const slug = slugs.get(interest);
      const cacheId = slug ? await cachedForTopic(studentId, level, slug, served) : null;
      if (cacheId && await serveCacheRow(studentId, cacheId)) served.push(cacheId);
      else toWrite.push(interest);
    }

    if (toWrite.length > 0) {
      // Imported here so the batch module (and its DB and API clients) loads only when needed
      const { writeInterestArticle } = await import("@/lib/batch/morning-batch");
      await Promise.all(toWrite.map(async interest => {
        try {
          const cacheId = await writeInterestArticle(interest, level);
          if (cacheId) await serveCacheRow(studentId, cacheId);
          else console.error(`Starter articles: no article written for "${interest}"`);
        } catch (e) {
          console.error(`Starter articles: writing "${interest}" failed:`, e);
        }
      }));
    }
  } catch (e) {
    console.error("Starter articles failed:", e);
  } finally {
    await setStatus(studentId, "done").catch(e => console.error("Starter articles: status update failed:", e));
  }
}

/** Unread, non-tutorial articles in the student's feed */
export async function feedArticleCount(studentId: number): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(schema.articles)
    .where(and(
      eq(schema.articles.studentId, studentId),
      eq(schema.articles.read, false),
      sql`COALESCE(${schema.articles.category}, '') <> 'tutorial'`,
    ));
  return Number(row?.n || 0);
}
