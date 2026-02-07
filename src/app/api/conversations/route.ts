export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, desc } from "drizzle-orm";

// Start or resume a conversation for an article
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { articleId } = await req.json();

  // Check for an existing incomplete conversation for this article
  const existingSessions = await db
    .select({ id: schema.readingSessions.id })
    .from(schema.readingSessions)
    .where(
      and(
        eq(schema.readingSessions.studentId, session.userId),
        eq(schema.readingSessions.articleId, articleId)
      )
    )
    .orderBy(desc(schema.readingSessions.id))
    .limit(1);

  if (existingSessions.length > 0) {
    // Check if there's an incomplete conversation for this session
    const existingConv = await db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.readingSessionId, existingSessions[0].id),
          eq(schema.conversations.complete, false)
        )
      )
      .limit(1);

    if (existingConv.length > 0) {
      // Resume existing conversation
      return NextResponse.json({
        readingSessionId: existingSessions[0].id,
        conversationId: existingConv[0].id,
        resumed: true,
      });
    }
  }

  // Create new reading session + conversation
  const [readingSession] = await db.insert(schema.readingSessions).values({
    studentId: session.userId,
    articleId,
  }).returning();

  const [conversation] = await db.insert(schema.conversations).values({
    readingSessionId: readingSession.id,
    messages: [],
  }).returning();

  return NextResponse.json({
    readingSessionId: readingSession.id,
    conversationId: conversation.id,
    resumed: false,
  });
}
