export const dynamic = "force-dynamic";
export const maxDuration = 300;

import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { tracked } from "@/lib/ai-usage";
import { NOTES_VERSION, writeGuideNotes } from "@/lib/tutor/guide-notes";

/** Stop starting new articles this long after the call begins, leaving room to respond */
const WORK_BUDGET_MS = 240_000;
const CONCURRENCY = 3;
const PER_CALL = 30;

/**
 * Catch-up for Sigma's prep notes (src/lib/tutor/guide-notes.ts): writes notes for base
 * articles that have none, newest first. The morning batch writes them for new articles, so
 * this is a no-op most of the time; it fills the library that predates the notes and any
 * article whose notes failed in the batch. Vercel Cron calls it every 15 minutes (vercel.json);
 * `scripts/backfill-guide-notes.ts` does the same by hand.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startedAt = Date.now();
  const sql = neon(process.env.DATABASE_URL!);
  const anthropic = tracked(new Anthropic(), "guide_notes");

  const rows = await sql`
    SELECT id, title, body_text FROM article_cache
    WHERE base_article_id IS NULL AND flagged = false
      AND (guide_notes IS NULL OR (guide_notes->>'version') IS DISTINCT FROM ${String(NOTES_VERSION)})
    ORDER BY id DESC LIMIT ${PER_CALL}
  ` as { id: number; title: string; body_text: string }[];

  let written = 0, failed = 0, skipped = 0;
  const queue = [...rows];
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      if (Date.now() - startedAt > WORK_BUDGET_MS) { skipped++; continue; }
      try {
        const notes = await writeGuideNotes(anthropic, row.title, row.body_text);
        if (!notes) { failed++; console.warn(`guide notes: no usable notes for article ${row.id}`); continue; }
        await sql`UPDATE article_cache SET guide_notes = ${JSON.stringify(notes)}::jsonb WHERE id = ${row.id} AND (guide_notes IS NULL OR (guide_notes->>'version') IS DISTINCT FROM ${String(NOTES_VERSION)})`;
        written++;
      } catch (e) {
        failed++;
        console.error(`guide notes: article ${row.id} failed:`, e instanceof Error ? e.message : e);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return NextResponse.json({ missing: rows.length, written, failed, skipped, ms: Date.now() - startedAt });
}
