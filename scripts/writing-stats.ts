// How much the morning batch writes, against how much students read, week by week.
// Counts and dollars only: no names, titles or article text, so the output can sit in a public
// Actions log. Students appear by number, test accounts marked.
//
// Run: DATABASE_URL="..." npx tsx scripts/writing-stats.ts [--weeks=8]
// Or label a pull request "writing-stats" (.github/workflows/writing-stats.yml).
//
// "Explore" is the horizon article (category general). "Base articles read so far" counts a
// week's base articles that any student has finished at any level since.
// "Written" is the article_cache rows a week added: base articles (base_article_id IS NULL) and
// all versions. "Read" is distinct articles finished (reading_sessions.completed_at). Cost is
// ai_usage for the batch's own calls (batch_* and guide_notes), at list price, web searches
// included; reading-level measurement is Compass's and not in it.

import { neon } from "@neondatabase/serverless";

/** A tagged-template query, as neon() returns: the report takes one so it can run on any Postgres */
export type Query = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;
const weeksArg = process.argv.find(a => a.startsWith("--weeks="));
const WEEKS = Math.max(1, Math.min(26, Number(weeksArg?.split("=")[1]) || 8));

const BATCH_FEATURES = ["batch_adjacent", "batch_search", "batch_source_pick", "batch_filter", "batch_rewrite",
  "batch_adapt", "batch_dedup", "batch_angles", "batch_write", "batch_revise", "guide_notes"];

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const usd = (v: unknown) => `$${n(v).toFixed(2)}`;

export async function report(sql: Query): Promise<string> {
  // Weeks start Monday (date_trunc('week')), UTC
  const written = await sql`
    SELECT date_trunc('week', generated_date::timestamp)::date AS week,
      COUNT(*) FILTER (WHERE base_article_id IS NULL)::int AS base,
      COUNT(*)::int AS versions,
      COUNT(*) FILTER (WHERE base_article_id IS NULL AND category = 'news')::int AS news,
      COUNT(*) FILTER (WHERE base_article_id IS NULL AND category = 'general')::int AS explore,
      COUNT(*) FILTER (WHERE base_article_id IS NULL AND EXISTS (
        SELECT 1 FROM article_cache v JOIN articles a ON a.source_cache_id = v.id AND a.read = true
        WHERE v.id = article_cache.id OR v.base_article_id = article_cache.id))::int AS base_read,
      COUNT(DISTINCT generated_date) FILTER (WHERE base_article_id IS NULL)::int AS writing_days
    FROM article_cache
    WHERE generated_date >= date_trunc('week', CURRENT_DATE) - (${WEEKS - 1} * INTERVAL '7 days')
    GROUP BY 1 ORDER BY 1
  ` as Row[];

  const read = await sql`
    SELECT date_trunc('week', completed_at)::date AS week, student_id,
      COUNT(DISTINCT article_id)::int AS finished,
      COUNT(DISTINCT completed_at::date)::int AS days
    FROM reading_sessions
    WHERE completed_at >= date_trunc('week', CURRENT_DATE) - (${WEEKS - 1} * INTERVAL '7 days')
    GROUP BY 1, 2 ORDER BY 1, 2
  ` as Row[];

  const cost = await sql`
    SELECT date_trunc('week', created_at)::date AS week, SUM(cost_usd) AS usd, COUNT(*)::int AS calls
    FROM ai_usage
    WHERE feature = ANY(${BATCH_FEATURES})
      AND created_at >= date_trunc('week', CURRENT_DATE) - (${WEEKS - 1} * INTERVAL '7 days')
    GROUP BY 1 ORDER BY 1
  ` as Row[];

  const costByFeature = await sql`
    SELECT feature, SUM(cost_usd) AS usd, COUNT(*)::int AS calls
    FROM ai_usage
    WHERE feature = ANY(${BATCH_FEATURES}) AND created_at >= CURRENT_DATE - INTERVAL '28 days'
    GROUP BY 1 ORDER BY 2 DESC NULLS LAST
  ` as Row[];

  const students = await sql`
    SELECT id, (external_id IS NULL) AS local_only, onboarding_complete, reading_level,
      (SELECT COUNT(*) FROM articles a WHERE a.student_id = s.id AND a.read = false)::int AS unread,
      (SELECT MAX(completed_at)::date FROM reading_sessions rs WHERE rs.student_id = s.id) AS last_read
    FROM students s ORDER BY id
  ` as Row[];

  const runs = await sql`
    SELECT run_date, status FROM batch_runs
    WHERE run_date >= CURRENT_DATE - INTERVAL '21 days' ORDER BY run_date
  ` as Row[];

  const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
  const weeks = [...new Set([...written, ...read, ...cost].map(r => day(r.week)))].sort();

  const out: string[] = [];
  out.push(`# Sigma Read: articles written against articles read, last ${WEEKS} weeks (weeks start Monday, UTC)`, "");
  out.push("| Week of | Days written | Base articles | All versions | News | Explore | Base articles read so far | Articles finished | Readers | Batch AI cost | Cost per article finished |");
  out.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const w of weeks) {
    const wr = written.find(r => day(r.week) === w) ?? {};
    const rd = read.filter(r => day(r.week) === w);
    const c = cost.find(r => day(r.week) === w) ?? {};
    const finished = rd.reduce((s, r) => s + n(r.finished), 0);
    out.push(`| ${w} | ${n(wr.writing_days)} | ${n(wr.base)} | ${n(wr.versions)} | ${n(wr.news)} | ${n(wr.explore)} | ${n(wr.base_read)} | ${finished} | ${rd.length} | ${usd(c.usd)} | ${finished ? usd(n(c.usd) / finished) : "-"} |`);
  }

  out.push("", "## Articles finished, by student and week", "", "| Week of | Student | Finished | Days read |", "|---|---|---|---|");
  for (const r of read) out.push(`| ${day(r.week)} | ${r.student_id} | ${n(r.finished)} | ${n(r.days)} |`);

  out.push("", "## Batch AI cost by step, last 28 days", "", "| Step | Calls | Cost |", "|---|---|---|");
  for (const r of costByFeature) out.push(`| ${r.feature} | ${n(r.calls)} | ${usd(r.usd)} |`);

  out.push("", "## Students now", "", "| Student | Signed in from Compass | Onboarded | Level | Unread | Last finished |", "|---|---|---|---|---|---|");
  for (const s of students) out.push(`| ${s.id} | ${s.local_only ? "no" : "yes"} | ${s.onboarding_complete ? "yes" : "no"} | ${s.reading_level ?? "-"} | ${n(s.unread)} | ${s.last_read ? day(s.last_read) : "never"} |`);

  out.push("", "## Batch runs, last 21 days", "", runs.map(r => `${day(r.run_date)} ${r.status}`).join(", ") || "none");
  return out.join("\n");
}

if (process.argv[1]?.endsWith("writing-stats.ts")) {
  report(neon(process.env.DATABASE_URL!) as unknown as Query)
    .then(text => console.log(text))
    .catch(e => { console.error(e); process.exit(1); });
}
