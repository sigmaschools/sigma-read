/**
 * Where Sigma's prep notes live: on the base article's article_cache row, shared by every level
 * adaptation and every student who reads it. The morning batch writes them when it writes a base
 * article; scripts/backfill-guide-notes.ts fills in older articles.
 */

import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { isCurrentGuideNotes, type GuideNotes } from "./guide-notes";

/** The notes for the article a student is reading, via the cache row it was copied from; null when there are none or they are from an older prompt */
export async function guideNotesForArticle(sourceCacheId: number | null | undefined): Promise<GuideNotes | null> {
  if (!sourceCacheId) return null;
  const [row] = await db.select({ guideNotes: schema.articleCache.guideNotes, baseArticleId: schema.articleCache.baseArticleId })
    .from(schema.articleCache).where(eq(schema.articleCache.id, sourceCacheId)).limit(1);
  if (!row) return null;
  if (isCurrentGuideNotes(row.guideNotes)) return row.guideNotes;
  if (!row.baseArticleId) return null;
  const [base] = await db.select({ guideNotes: schema.articleCache.guideNotes })
    .from(schema.articleCache).where(eq(schema.articleCache.id, row.baseArticleId)).limit(1);
  const notes = base?.guideNotes;
  return isCurrentGuideNotes(notes) ? notes : null;
}
