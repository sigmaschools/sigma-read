export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { and, desc, eq, gte, inArray, min, sql } from "drizzle-orm";
import { weeklyEngagement, weekOf, localDate } from "@/lib/engagement";

// The engagement baseline, week by week, for all students or one (?student=<id>).
// What each number means: docs/session-analytics.md, "Engagement baseline".

// Weeks of engagement shown: the current week and the seven before it
const ENGAGEMENT_WEEKS = 8;

async function engagement(studentId: number | null) {
  const first = new Date(`${weekOf(localDate(new Date()))}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - 7 * (ENGAGEMENT_WEEKS - 1));
  const firstWeek = first.toISOString().slice(0, 10);
  const since = new Date(first.getTime() - 86400000); // a day early, since the report zone is behind UTC; trimmed below
  const rs = schema.readingSessions;
  const forStudent = (col: typeof rs.studentId) => (studentId === null ? undefined : eq(col, studentId));

  const [sessions, favorites, lookups, firstLookup] = await Promise.all([
    db.select({
      sessionId: rs.id, studentId: rs.studentId, completedAt: rs.completedAt, liked: schema.articles.liked,
      score: schema.comprehensionReports.score, selfAssessment: schema.comprehensionReports.selfAssessment,
    }).from(rs)
      .innerJoin(schema.articles, eq(rs.articleId, schema.articles.id))
      .innerJoin(schema.conversations, and(eq(schema.conversations.readingSessionId, rs.id), eq(schema.conversations.complete, true)))
      .leftJoin(schema.comprehensionReports, eq(schema.comprehensionReports.conversationId, schema.conversations.id))
      .where(and(gte(rs.completedAt, since), forStudent(rs.studentId)))
      // A session with more than one report keeps its latest scored one (first after this order)
      .orderBy(rs.id, sql`${schema.comprehensionReports.score} IS NULL`, desc(schema.comprehensionReports.id)),
    db.select({ studentId: schema.articleFavorites.studentId, createdAt: schema.articleFavorites.createdAt })
      .from(schema.articleFavorites).where(and(gte(schema.articleFavorites.createdAt, since), studentId === null ? undefined : eq(schema.articleFavorites.studentId, studentId))),
    db.select({ studentId: schema.wordLookups.studentId, createdAt: schema.wordLookups.createdAt })
      .from(schema.wordLookups).where(and(gte(schema.wordLookups.createdAt, since), studentId === null ? undefined : eq(schema.wordLookups.studentId, studentId)))
      .catch(e => { console.error("word_lookups query failed:", e); return null; }),
    db.select({ at: min(schema.wordLookups.createdAt) }).from(schema.wordLookups)
      .then(([r]) => r?.at ?? null).catch(() => null),
  ]);
  // Without the lookups, show no lookup rate rather than a false zero
  const lookupsSince = lookups === null ? null : firstLookup;
  // A session can carry more than one report row; count the piece once
  const seen = new Set<number>();
  const pieces = sessions.filter(r => {
    if (!r.completedAt || seen.has(r.sessionId)) return false;
    seen.add(r.sessionId);
    return true;
  }).map(r => ({ ...r, completedAt: r.completedAt! }));

  const ids = [...new Set(pieces.map(p => p.studentId))];
  const students = ids.length === 0 ? [] : await db.select({ id: schema.students.id, name: schema.students.name, goal: schema.students.dailyGoalArticles })
    .from(schema.students).where(inArray(schema.students.id, ids));
  const weeks = weeklyEngagement({ sessions: pieces, favorites, lookups: lookups ?? [], lookupsSince, goals: new Map(students.map(s => [s.id, s.goal])) })
    .filter(w => w.week >= firstWeek);
  return { weeks, lookupsSince, studentId, readers: studentId === null ? students.map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name)) : [] };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentParam = Number(new URL(req.url).searchParams.get("student"));
  return NextResponse.json(await engagement(Number.isInteger(studentParam) && studentParam > 0 ? studentParam : null));
}
