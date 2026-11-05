/** A student's recently served articles and topics, for the repeat check and topic spacing (repeats.ts) */

import { sql } from "drizzle-orm";
import { db } from "./db";
import { topicsForCache } from "./interest-graph";
import { MAX_HISTORY, opening, REPEAT_DAYS, TOPIC_SPACING_DAYS, type ArticleGist } from "./repeats";

/** The student's articles served in the last REPEAT_DAYS (read or not), newest first */
export async function recentArticles(studentId: number): Promise<ArticleGist[]> {
  const rows = await db.execute(sql`
    SELECT h.article_title AS title, c.body_text AS body
    FROM student_article_history h
    LEFT JOIN article_cache c ON c.id = h.article_cache_id
    WHERE h.student_id = ${studentId} AND h.served_at > NOW() - make_interval(days => ${REPEAT_DAYS})
    ORDER BY h.served_at DESC
    LIMIT ${MAX_HISTORY}
  `);
  return (rows.rows as { title: string; body: string | null }[]).map(r => ({ title: r.title, opening: opening(r.body) }));
}

/** Topics of the articles served to the student in the last TOPIC_SPACING_DAYS */
export async function recentTopics(studentId: number): Promise<Set<string>> {
  const rows = await db.execute(sql`
    SELECT article_cache_id AS id FROM student_article_history
    WHERE student_id = ${studentId} AND article_cache_id IS NOT NULL
      AND served_at > NOW() - make_interval(days => ${TOPIC_SPACING_DAYS})
  `);
  const topics = await topicsForCache((rows.rows as { id: number }[]).map(r => Number(r.id)));
  return new Set([...topics.values()].flat());
}
