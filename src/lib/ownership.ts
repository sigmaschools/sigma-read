import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

/**
 * Load a conversation and its reading session, but only if the reading session
 * belongs to the given student. Returns null when missing or owned by someone else,
 * so callers can respond 404 without revealing which.
 */
export async function getStudentConversation(conversationId: number, studentId: number) {
  if (!Number.isInteger(conversationId)) return null;

  const [row] = await db.select({
    conversation: schema.conversations,
    readingSession: schema.readingSessions,
  })
    .from(schema.conversations)
    .innerJoin(schema.readingSessions, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
    .where(and(
      eq(schema.conversations.id, conversationId),
      eq(schema.readingSessions.studentId, studentId),
    ))
    .limit(1);

  return row ?? null;
}

/** True if the student is assigned to the given guide. */
export async function guideOwnsStudent(guideId: number, studentId: number): Promise<boolean> {
  const [row] = await db.select({ id: schema.students.id })
    .from(schema.students)
    .where(and(eq(schema.students.id, studentId), eq(schema.students.guideId, guideId)))
    .limit(1);
  return !!row;
}
