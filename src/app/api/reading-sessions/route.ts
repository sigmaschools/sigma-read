export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, isNull } from "drizzle-orm";

// Create or resume a reading session when a student opens an article
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { articleId } = await req.json();

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

  return NextResponse.json({ readingSessionId: readingSession.id, resumed: false });
}
