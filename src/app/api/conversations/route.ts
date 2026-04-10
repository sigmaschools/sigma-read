export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

// Start or resume a conversation for a reading session
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { readingSessionId } = await req.json();

  // Look up the reading session and verify ownership
  const [readingSession] = await db
    .select()
    .from(schema.readingSessions)
    .where(
      and(
        eq(schema.readingSessions.id, readingSessionId),
        eq(schema.readingSessions.studentId, session.userId)
      )
    )
    .limit(1);

  if (!readingSession) return NextResponse.json({ error: "Reading session not found" }, { status: 404 });

  // Check for an existing incomplete conversation for this session
  const existingConv = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.readingSessionId, readingSessionId),
        eq(schema.conversations.complete, false)
      )
    )
    .limit(1);

  if (existingConv.length > 0) {
    return NextResponse.json({
      readingSessionId,
      conversationId: existingConv[0].id,
      resumed: true,
    });
  }

  // Set readingCompletedAt if not already set (belt and suspenders)
  if (!readingSession.readingCompletedAt) {
    await db.update(schema.readingSessions)
      .set({ readingCompletedAt: new Date() })
      .where(eq(schema.readingSessions.id, readingSessionId));
  }

  const [conversation] = await db.insert(schema.conversations).values({
    readingSessionId,
    messages: [],
  }).returning();

  return NextResponse.json({
    readingSessionId,
    conversationId: conversation.id,
    resumed: false,
  });
}
