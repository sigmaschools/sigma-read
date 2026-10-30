export const dynamic = "force-dynamic";
import { and, desc, eq, gte, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiRoute, apiError, apiJson, visibleStudent } from "@/lib/api-v1/auth";
import { pageParams, pageOf, sinceParam } from "@/lib/api-v1/keys";

/** GET /api/v1/students/{id}/sessions?since=&limit=&cursor= — completed sessions, newest first */
export const GET = apiRoute<{ id: string }>("reports:read", async (req, client, { id }) => {
  const student = await visibleStudent(client, Number(id));
  if (!student) return apiError(404, "Student not found");

  const page = pageParams(req.nextUrl.searchParams);
  if ("error" in page) return apiError(400, page.error);
  const since = sinceParam(req.nextUrl.searchParams.get("since"));
  if (since && "error" in since) return apiError(400, since.error);

  const rs = schema.readingSessions;
  const r = schema.comprehensionReports;
  const conditions: SQL[] = [eq(rs.studentId, student.id), isNotNull(rs.completedAt)];
  if (since) conditions.push(gte(rs.completedAt, since));
  if (page.after !== null) conditions.push(lt(rs.id, page.after));

  const rows = await db.select({
    id: rs.id,
    startedAt: rs.startedAt,
    readingCompletedAt: rs.readingCompletedAt,
    completedAt: rs.completedAt,
    discussionSeconds: rs.discussionDurationSeconds,
    articleTitle: schema.articles.title,
    articleTopic: schema.articles.topic,
    articleLevel: schema.articles.readingLevel,
    score: r.score,
    rating: r.rating,
    skills: r.skills,
    selfAssessment: r.selfAssessment,
    confidence: r.confidence,
    guideFlag: r.guideFlag,
  })
    .from(rs)
    .innerJoin(schema.articles, eq(rs.articleId, schema.articles.id))
    // One conversation per session (the latest, should there ever be two), so rows and cursors stay unique
    .leftJoin(schema.conversations, eq(schema.conversations.id, sql`(SELECT max(id) FROM conversations WHERE reading_session_id = ${rs.id})`))
    // Latest report only
    .leftJoin(r, eq(r.id, sql`(SELECT max(id) FROM comprehension_reports WHERE conversation_id = ${schema.conversations.id})`))
    .where(and(...conditions))
    .orderBy(desc(rs.id))
    .limit(page.limit + 1);
  const { data, nextCursor } = pageOf(rows, page.limit);

  return apiJson({
    data: data.map(s => ({
      id: s.id,
      article: { title: s.articleTitle, topic: s.articleTopic, readingLevel: s.articleLevel },
      startedAt: s.startedAt.toISOString(),
      readingCompletedAt: s.readingCompletedAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
      discussionSeconds: s.discussionSeconds,
      report: s.score === null ? null : {
        score: s.score, rating: s.rating, skills: s.skills, selfAssessment: s.selfAssessment, confidence: s.confidence,
        disputed: s.guideFlag !== null,
      },
    })),
    nextCursor,
  });
});
