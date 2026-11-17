import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { cleanLookup } from "./word-lookup-clean";

// Save a tap-to-define lookup. Best effort: a failure is logged and the definition still shows.
// The article must be the student's own; otherwise the lookup is kept without it.
export async function recordLookup(studentId: number, articleId: number, rawWord: unknown, rawSentence: unknown): Promise<void> {
  const clean = cleanLookup(rawWord, rawSentence);
  if (!clean) return;
  try {
    const [own] = Number.isInteger(articleId)
      ? await db.select({ id: schema.articles.id }).from(schema.articles)
        .where(and(eq(schema.articles.id, articleId), eq(schema.articles.studentId, studentId))).limit(1)
      : [];
    await db.insert(schema.wordLookups).values({ studentId, articleId: own?.id ?? null, word: clean.word, sentence: clean.sentence });
  } catch (e) {
    console.error("Word lookup not saved:", e);
  }
}
