export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { and, desc, eq, isNull, isNotNull, ne, or, lt, gt, sql } from "drizzle-orm";

type ReviewFilter = "all" | "low" | "forced" | "gap" | "missing";

/**
 * Report review queue: recent comprehension reports, or completed conversations with no report.
 *   ?filter=all      latest reports
 *   ?filter=low      low-confidence reports
 *   ?filter=forced   conversations that hit the 6-message backstop
 *   ?filter=gap      self-assessment far from the score (said "really well" under 60, or "lost" over 80)
 *   ?filter=missing  completed conversations with no report at all
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const FILTERS: ReviewFilter[] = ["all", "low", "forced", "gap", "missing"];
  const requested = req.nextUrl.searchParams.get("filter") as ReviewFilter;
  const filter: ReviewFilter = FILTERS.includes(requested) ? requested : "all";
  const limit = Math.max(1, Math.min(200, parseInt(req.nextUrl.searchParams.get("limit") || "50") || 50));
  const r = schema.comprehensionReports;

  const conditions = [
    eq(schema.conversations.complete, true),
    // Tutorials are practice, not assessed
    or(isNull(schema.articles.category), ne(schema.articles.category, "tutorial")),
  ];
  if (filter === "missing") {
    conditions.push(isNull(r.id));
    // The report is written a few seconds after completion; don't flag ones still being generated
    conditions.push(or(
      isNull(schema.readingSessions.completedAt),
      lt(schema.readingSessions.completedAt, new Date(Date.now() - 10 * 60 * 1000)),
    )!);
  } else {
    conditions.push(isNotNull(r.id));
  }
  if (filter === "low") conditions.push(eq(r.confidence, "low"));
  if (filter === "forced") conditions.push(eq(r.forcedClose, true));
  if (filter === "gap") {
    conditions.push(or(
      and(eq(r.selfAssessment, "really_well"), lt(r.score, 60)),
      and(eq(r.selfAssessment, "lost"), gt(r.score, 80)),
    )!);
  }

  const rows = await db.select({
    conversationId: schema.conversations.id,
    completedAt: schema.readingSessions.completedAt,
    studentId: schema.students.id,
    studentName: schema.students.name,
    readingLevel: schema.students.readingLevel,
    articleTitle: schema.articles.title,
    articleLevel: schema.articles.readingLevel,
    style: schema.conversations.conversationStyle,
    progressScore: schema.conversations.progressScore,
    reportId: r.id,
    score: r.score,
    rating: r.rating,
    confidence: r.confidence,
    forcedClose: r.forcedClose,
    selfAssessment: r.selfAssessment,
    exchangeCount: r.exchangeCount,
    summary: r.summary,
    promptVersion: r.promptVersion,
  })
    .from(schema.conversations)
    .innerJoin(schema.readingSessions, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
    .innerJoin(schema.students, eq(schema.readingSessions.studentId, schema.students.id))
    .innerJoin(schema.articles, eq(schema.readingSessions.articleId, schema.articles.id))
    // Latest report only, in case a conversation was ever reported twice
    .leftJoin(r, eq(r.id, sql`(SELECT max(id) FROM comprehension_reports WHERE conversation_id = ${schema.conversations.id})`))
    .where(and(...conditions))
    .orderBy(sql`${schema.readingSessions.completedAt} DESC NULLS LAST`)
    .limit(limit);

  return NextResponse.json(rows);
}
