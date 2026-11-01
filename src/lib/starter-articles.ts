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
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getRelated, resolveTopics, topicLabels } from "@/lib/interest-graph";
import { STARTER_COUNT, starterInterests, starterPending, starterProgress } from "@/lib/starter-plan";

/** Mark the job done by now, inside the time the page waits; a write still running may land in the feed later, or be cut off; the home page tops up either way */
const JOB_TIMEOUT_MS = 140_000;

export async function markStarterPending(studentId: number) {
  await db.update(schema.students)
    .set({ starterArticlesStatus: "pending", starterArticlesStartedAt: new Date() })
    .where(eq(schema.students.id, studentId));
}

async function markStarterDone(studentId: number) {
  await db.update(schema.students).set({ starterArticlesStatus: "done" }).where(eq(schema.students.id, studentId));
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

/** Topics next to the student's (closest first), with labels to search for; none they already named */
async function relatedInterests(slugs: string[], named: string[]): Promise<{ label: string; slug: string }[]> {
  const taken = new Set([...slugs, ...named.map(n => n.toLowerCase())]);
  const related = (await Promise.all(slugs.map(s => getRelated(s)))).flat().sort((a, b) => b.weight - a.weight);
  const fresh = [...new Set(related.map(r => r.slug))].filter(s => !taken.has(s));
  const labels = await topicLabels(fresh);
  return fresh.filter(s => labels.has(s) && !taken.has(labels.get(s)!.toLowerCase())).map(s => ({ slug: s, label: labels.get(s)! }));
}

export async function prepareStarterArticles(studentId: number, client: Anthropic): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>(resolve => {
    timer = setTimeout(() => { console.error("Starter articles: timed out, the home page fills the rest"); resolve(); }, JOB_TIMEOUT_MS);
  });
  try {
    await Promise.race([findOrWrite(studentId, client), timeout]);
  } finally {
    clearTimeout(timer);
    await markStarterDone(studentId).catch(e => console.error("Starter articles: status update failed:", e));
  }
}

async function findOrWrite(studentId: number, client: Anthropic): Promise<void> {
  try {
    const [student] = await db.select().from(schema.students).where(eq(schema.students.id, studentId)).limit(1);
    if (!student) return;
    const level = student.readingLevel || 2;
    const interests = starterInterests(student.interestProfile);

    const slugs = await resolveTopics(interests, { client, studentId })
      .catch(e => { console.error("Starter articles: topic lookup failed, writing every interest:", e); return new Map<string, string | null>(); });

    // Fewer interests than articles: fill with topics next to theirs, so it's still three
    if (interests.length < STARTER_COUNT) {
      const extra = await relatedInterests([...slugs.values()].filter((s): s is string => !!s), interests)
        .catch(e => { console.error("Starter articles: related topics unavailable:", e); return [] as { label: string; slug: string }[]; });
      for (const t of extra.slice(0, STARTER_COUNT - interests.length)) {
        interests.push(t.label);
        slugs.set(t.label, t.slug);
      }
    }

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
  }
}

/** Progress for the onboarding screen: only articles added since the job started count */
export async function starterStatus(studentId: number) {
  const [student] = await db.select({
    status: schema.students.starterArticlesStatus,
    startedAt: schema.students.starterArticlesStartedAt,
  }).from(schema.students).where(eq(schema.students.id, studentId)).limit(1);
  if (!student) return null;
  const pending = starterPending(student.status, student.startedAt);
  let ready = 0;
  if (student.startedAt) {
    const [row] = await db.select({ n: sql<number>`count(*)` }).from(schema.articles)
      .where(and(
        eq(schema.articles.studentId, studentId),
        // A few seconds of slack for clock differences between the app and the database
        gte(schema.articles.createdAt, new Date(student.startedAt.getTime() - 5000)),
        sql`COALESCE(${schema.articles.category}, '') <> 'tutorial'`,
      ));
    ready = Number(row?.n || 0);
  }
  return starterProgress(pending, ready);
}
