export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";

// Get completed reading sessions with scores for the current student
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results = await db
    .select({
      articleId: schema.articles.id,
      title: schema.articles.title,
      topic: schema.articles.topic,
      category: schema.articles.category,
      completedAt: schema.readingSessions.completedAt,
      score: schema.comprehensionReports.score,
      rating: schema.comprehensionReports.rating,
    })
    .from(schema.readingSessions)
    .innerJoin(schema.articles, eq(schema.readingSessions.articleId, schema.articles.id))
    .innerJoin(schema.conversations, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
    .leftJoin(schema.comprehensionReports, eq(schema.comprehensionReports.conversationId, schema.conversations.id))
    .where(eq(schema.readingSessions.studentId, session.userId))
    .orderBy(desc(schema.readingSessions.completedAt));

  return NextResponse.json(results);
}
