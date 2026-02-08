export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, gte, desc } from "drizzle-orm";

const DAILY_GOAL = 3;

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  return NextResponse.json({
    completedToday: completedToday.map(c => ({ title: c.articleTitle, id: c.articleId })),
    count: completedToday.length,
    dailyGoal: DAILY_GOAL,
    done: completedToday.length >= DAILY_GOAL,
  });
}
