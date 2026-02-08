export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, gte, sql } from "drizzle-orm";

const DAILY_GOAL = 3;

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Count reading sessions completed today (with a completed conversation)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const completed = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.readingSessions)
    .innerJoin(schema.conversations, and(
      eq(schema.conversations.readingSessionId, schema.readingSessions.id),
      eq(schema.conversations.complete, true),
    ))
    .where(and(
      eq(schema.readingSessions.studentId, session.userId),
      gte(schema.readingSessions.completedAt, todayStart),
    ));

  const completedToday = Number(completed[0]?.count ?? 0);

  return NextResponse.json({
    completedToday,
    dailyGoal: DAILY_GOAL,
    done: completedToday >= DAILY_GOAL,
  });
}
