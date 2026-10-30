export const dynamic = "force-dynamic";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiRoute, apiError, apiJson, visibleStudent } from "@/lib/api-v1/auth";
import { hasScope } from "@/lib/api-v1/keys";

/** GET /api/v1/sessions/{id} — a completed session's full report; the transcript only with transcripts:read */
export const GET = apiRoute<{ id: string }>("reports:read", async (_req, client, { id }) => {
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) return apiError(404, "Session not found");

  const [row] = await db.select({ session: schema.readingSessions, article: schema.articles, conversation: schema.conversations })
    .from(schema.readingSessions)
    .innerJoin(schema.articles, eq(schema.readingSessions.articleId, schema.articles.id))
    .leftJoin(schema.conversations, eq(schema.conversations.id, sql`(SELECT max(id) FROM conversations WHERE reading_session_id = ${schema.readingSessions.id})`))
    .where(eq(schema.readingSessions.id, sessionId))
    .limit(1);
  // Like the list, only completed sessions: an in-progress chat isn't a record yet
  if (!row || row.session.completedAt === null || !(await visibleStudent(client, row.session.studentId))) {
    return apiError(404, "Session not found");
  }

  const [report] = row.conversation
    ? await db.select().from(schema.comprehensionReports)
      .where(eq(schema.comprehensionReports.conversationId, row.conversation.id))
      .orderBy(desc(schema.comprehensionReports.id)).limit(1)
    : [];
  const { session: s, article: a, conversation: c } = row;

  return apiJson({
    id: s.id,
    studentId: s.studentId,
    article: { title: a.title, topic: a.topic, readingLevel: a.readingLevel },
    startedAt: s.startedAt.toISOString(),
    readingCompletedAt: s.readingCompletedAt?.toISOString() ?? null,
    completedAt: s.completedAt?.toISOString() ?? null,
    discussionSeconds: s.discussionDurationSeconds,
    conversationStyle: c?.conversationStyle ?? null,
    report: report ? {
      score: report.score,
      rating: report.rating,
      summary: report.summary,
      nextStep: report.nextStep,
      skills: report.skills,
      // Evidence quotes the student verbatim, so it needs the same scope as the transcript
      evidence: hasScope(client.scopes, "transcripts:read") ? report.evidence : undefined,
      comprehension: report.understood,
      depth: report.missed,
      engagement: report.engagementNote,
      selfAssessment: report.selfAssessment,
      confidence: report.confidence,
      forcedClose: report.forcedClose,
      disputed: report.guideFlag !== null,
      promptVersion: report.promptVersion,
      createdAt: report.createdAt.toISOString(),
    } : null,
    // Coaching tips are app UI, not part of the conversation
    transcript: hasScope(client.scopes, "transcripts:read") && c
      ? (c.messages || [])
        .filter(m => m.type !== "coaching" && (m.role === "user" || m.role === "assistant"))
        .map(m => ({ role: m.role === "user" ? "student" : "tutor", content: m.content, timestamp: m.timestamp ?? null }))
      : undefined,
  });
});
