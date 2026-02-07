export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

// Start a new conversation (creates reading session + conversation)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { articleId } = await req.json();

  // Don't mark as read yet — wait until conversation completes

  // Create reading session
  const [readingSession] = await db.insert(schema.readingSessions).values({
    studentId: session.userId,
    articleId,
  }).returning();

  // Create conversation
  const [conversation] = await db.insert(schema.conversations).values({
    readingSessionId: readingSession.id,
    messages: [],
  }).returning();

  return NextResponse.json({ readingSessionId: readingSession.id, conversationId: conversation.id });
}
