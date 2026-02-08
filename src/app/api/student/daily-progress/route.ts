export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, gte, desc, sql } from "drizzle-orm";

const DAILY_GOAL = 3;

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, session.userId)).limit(1);
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Get articles completed today (with finished conversations)
  const completedToday = await db
    .select({
      articleTitle: schema.articles.title,
      articleId: schema.articles.id,
      completedAt: schema.readingSessions.completedAt,
    })
    .from(schema.readingSessions)
    .innerJoin(schema.articles, eq(schema.readingSessions.articleId, schema.articles.id))
    .innerJoin(schema.conversations, and(
      eq(schema.conversations.readingSessionId, schema.readingSessions.id),
      eq(schema.conversations.complete, true),
    ))
    .where(and(
      eq(schema.readingSessions.studentId, session.userId),
      gte(schema.readingSessions.completedAt, todayStart),
    ))
    .orderBy(desc(schema.readingSessions.completedAt));

  // Get total sessions completed (all time)
  const [totalResult] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.readingSessions)
    .innerJoin(schema.conversations, and(
      eq(schema.conversations.readingSessionId, schema.readingSessions.id),
      eq(schema.conversations.complete, true),
    ))
    .where(eq(schema.readingSessions.studentId, session.userId));

  const totalSessions = Number(totalResult?.count || 0);

  // Check if they already picked a favorite today
  const [favResult] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.articleFavorites)
    .where(and(
      eq(schema.articleFavorites.studentId, session.userId),
      gte(schema.articleFavorites.createdAt, todayStart),
    ));
  const favoritePicked = Number(favResult?.count || 0) > 0;

  return NextResponse.json({
    completedToday: completedToday.map(c => ({ title: c.articleTitle, id: c.articleId })),
    count: completedToday.length,
    dailyGoal: DAILY_GOAL,
    dailyCap: student.dailyArticleCap || 5,
    done: completedToday.length >= DAILY_GOAL,
    totalSessions,
    favoritePicked,
  });
}
