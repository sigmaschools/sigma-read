/**
 * Writes Sigma's prep notes (src/lib/tutor/guide-notes.ts) for every base article in the cache
 * that has none, so the redesigned tutor has something of its own to say about older articles.
 * The morning batch writes them for new articles.
 *
 * Run with: DATABASE_URL="..." ANTHROPIC_API_KEY="..." npx tsx scripts/backfill-guide-notes.ts [--limit=N] [--dry-run]
 */

import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { NOTES_VERSION, writeGuideNotes } from "../src/lib/tutor/guide-notes";

const sql = neon(process.env.DATABASE_URL!);
const anthropic = new Anthropic();
const args = process.argv.slice(2);
const limit = parseInt(args.find(a => a.startsWith("--limit="))?.slice(8) ?? "") || 500;
const dryRun = args.includes("--dry-run");

async function main() {
  // Base articles (no base_article_id) without notes, newest first, unflagged
  const rows = await sql`
    SELECT id, title, body_text FROM article_cache
    WHERE base_article_id IS NULL AND flagged = false
      AND (guide_notes IS NULL OR (guide_notes->>'version') IS DISTINCT FROM ${String(NOTES_VERSION)})
    ORDER BY id DESC LIMIT ${limit}
  `;
  console.log(`${rows.length} base articles without notes${dryRun ? " (dry run)" : ""}`);
  let written = 0, failed = 0;
  for (const row of rows) {
    if (dryRun) { console.log(`  would write: ${row.id} "${row.title}"`); continue; }
    try {
      const notes = await writeGuideNotes(anthropic, row.title, row.body_text);
      if (!notes) { failed++; console.log(`  ✗ ${row.id} "${row.title}": no usable notes`); continue; }
      await sql`UPDATE article_cache SET guide_notes = ${JSON.stringify(notes)}::jsonb WHERE id = ${row.id}`;
      written++;
      console.log(`  ✓ ${row.id} "${row.title}": ${notes.worthTalkingAbout.length} ideas, ${notes.vividDetails.length} details`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${row.id} "${row.title}": ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Done: ${written} written, ${failed} failed`);
}

main().catch(e => { console.error(e); process.exit(1); });
