/**
 * Retire the generic encyclopedia rewrites the Oct 29 to Nov 8 2026 pipeline wrote: base
 * articles whose source was a Grokipedia overview page on a whole subject ("Animal", "Cooking",
 * the interest word itself), plus their level adaptations. Retiring flags them (never served
 * again) and removes students' unread feed copies, so the next batch's specific stories fill the
 * feed instead. Read copies, history, sessions and conversations are left alone.
 *
 * Dry run by default; --apply makes the changes. --ids 12,34 retires those base articles
 * instead of the detected ones (for articles an admin judged generic by eye).
 * Usage: DATABASE_URL=... npx tsx scripts/retire-generic-articles.ts [--apply] [--ids 12,34]
 */

import { neon } from "@neondatabase/serverless";

const apply = process.argv.includes("--apply");
const idsArg = process.argv.includes("--ids") ? process.argv[process.argv.indexOf("--ids") + 1] : undefined;
const givenIds = idsArg === undefined ? null : idsArg.split(",").map(s => parseInt(s.trim(), 10)).filter(n => n > 0);
if (process.argv.includes("--ids") && (!givenIds || givenIds.length === 0)) {
  console.error("--ids needs a comma-separated list of article_cache ids, e.g. --ids 12,34");
  process.exit(1);
}

const SINCE = "2026-10-29"; // the first day of the shared-pool planner

/** The subject a Grokipedia URL is about, as plain lowercase words; null for other sites */
export function grokipediaSubject(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/grokipedia\.com\/page\/([^?#]+)/i);
  if (!m) return null;
  return decodeURIComponent(m[1]).replace(/_/g, " ").trim().toLowerCase();
}

/**
 * An overview page: the page on the interest itself ("Animal" for "animals", "Cooking" for
 * "cooking"), as opposed to a specific page. A one-word subject alone is not enough ("Wombat",
 * "Minecraft" are specific); the dry run lists every Grokipedia-sourced article so an admin can
 * add the rest with --ids.
 */
export function isOverviewPage(subject: string, query: string | null): boolean {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return false;
  const base = (w: string) => w.replace(/\s*\((.*)\)$/, "").replace(/s$/, "");
  return base(subject) === base(q);
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  console.log(`\n🧹 Retire generic articles${apply ? "" : " (DRY RUN: add --apply to make changes)"}\n`);

  let targets: { id: number; title: string; reason: string }[];
  if (givenIds) {
    const rows = await sql`SELECT id, title FROM article_cache WHERE id = ANY(${givenIds}) AND base_article_id IS NULL`;
    targets = rows.map(r => ({ id: r.id as number, title: r.title as string, reason: "listed with --ids" }));
  } else {
    const rows = await sql`
      SELECT ac.id, ac.title, ac.source_url, ac.generated_date,
        (SELECT gt.query FROM generated_topics gt WHERE gt.topic = ac.topic AND gt.generated_date = ac.generated_date LIMIT 1) AS query
      FROM article_cache ac
      WHERE ac.base_article_id IS NULL AND ac.flagged = false AND ac.generated_date >= ${SINCE}
        AND ac.source_url ILIKE '%grokipedia.com/page/%'
      ORDER BY ac.generated_date, ac.id
    `;
    targets = [];
    for (const r of rows) {
      const subject = grokipediaSubject(r.source_url as string);
      if (!subject) continue;
      const generic = isOverviewPage(subject, r.query as string | null);
      console.log(`  ${generic ? "🗑️" : "  "} #${r.id} ${r.generated_date} "${r.title}" ← Grokipedia "${subject}"${r.query ? ` (interest: ${r.query})` : ""}`);
      if (generic) targets.push({ id: r.id as number, title: r.title as string, reason: `overview page "${subject}"` });
    }
  }

  if (targets.length === 0) { console.log("\n  Nothing to retire.\n"); return; }

  const baseIds = targets.map(t => t.id);
  const versions = await sql`SELECT id FROM article_cache WHERE id = ANY(${baseIds}) OR base_article_id = ANY(${baseIds})`;
  const versionIds = versions.map(v => v.id as number);
  // Unread copies nothing else points at (reading_sessions and article_favorites are the only
  // tables that reference articles.id; conversations hang off reading_sessions)
  const unread = await sql`
    SELECT a.id, a.student_id, a.title FROM articles a
    WHERE a.source_cache_id = ANY(${versionIds}) AND a.read = false
      AND NOT EXISTS (SELECT 1 FROM reading_sessions s WHERE s.article_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM article_favorites f WHERE f.article_id = a.id)
  `;

  console.log(`\n  ${targets.length} base articles (${versionIds.length} versions with adaptations), ${unread.length} unread feed copies:`);
  for (const t of targets) console.log(`   - #${t.id} "${t.title}": ${t.reason}`);
  for (const u of unread) console.log(`   - feed copy #${u.id} for student ${u.student_id}: "${u.title}"`);

  if (!apply) { console.log(`\n  Would flag ${versionIds.length} cache rows and remove ${unread.length} unread copies.\n`); return; }

  await sql`UPDATE article_cache SET flagged = true WHERE id = ANY(${versionIds})`;
  if (unread.length > 0) await sql`DELETE FROM articles WHERE id = ANY(${unread.map(u => u.id as number)})`;
  console.log(`\n  ✅ Flagged ${versionIds.length} cache rows and removed ${unread.length} unread feed copies.\n`);
}

if (process.argv[1] && /retire-generic-articles\.ts$/.test(process.argv[1])) main().catch(e => { console.error(e); process.exit(1); });
