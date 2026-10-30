export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, isNull, ne } from "drizzle-orm";
import { quietly, recordArticleChoice } from "@/lib/interest-graph";

// Create or resume a reading session when a student opens an article
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { articleId } = await req.json();

  // Article must belong to this student
  const [article] = await db.select({ id: schema.articles.id, category: schema.articles.category })
    .from(schema.articles)
    .where(and(eq(schema.articles.id, articleId), eq(schema.articles.studentId, session.userId)))
    .limit(1);
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Check for existing incomplete session (no completedAt) for this student + article
  const existing = await db
    .select({ id: schema.readingSessions.id })
    .from(schema.readingSessions)
    .where(
      and(
        eq(schema.readingSessions.studentId, session.userId),
        eq(schema.readingSessions.articleId, articleId),
        isNull(schema.readingSessions.completedAt)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ readingSessionId: existing[0].id, resumed: true });
  }

  const [readingSession] = await db.insert(schema.readingSessions).values({
    studentId: session.userId,
    articleId,
  }).returning();

  // Picking this article over the others in the feed says something about their topics
  if (article.category !== "tutorial") {
    const others = await db.select({ id: schema.articles.id }).from(schema.articles)
      .where(and(eq(schema.articles.studentId, session.userId), eq(schema.articles.read, false), ne(schema.articles.id, article.id)));
    await quietly(recordArticleChoice(session.userId, article.id, others.map(o => o.id), readingSession.id), "article choice");
  }

  return NextResponse.json({ readingSessionId: readingSession.id, resumed: false });
}
