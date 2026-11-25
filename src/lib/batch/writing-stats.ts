// How much the morning batch writes, against how much students read, week by week.
// Counts and dollars only, in totals: no names, titles, article text or per-student rows.
//
// The morning batch logs it on the first call of each morning's run (Vercel runtime logs, kept a
// day; skipped past 20 seconds; nothing is stored, as every run recomputes the 8 weeks from the
// tables), and
// scripts/writing-stats.ts prints it by hand: DATABASE_URL="..." npx tsx scripts/writing-stats.ts [--weeks=8]
//
// "Explore" is the horizon article (category general). "Base articles read so far" counts a
// week's base articles that any student has finished at any level since.
// "Written" is the article_cache rows a week added: base articles (base_article_id IS NULL) and
// all versions. "Read" is distinct articles finished (reading_sessions.completed_at). Cost is
// ai_usage for the batch's own calls (every batch_* feature and guide_notes), at list price, web searches
// included; reading-level measurement is Compass's and not in it. Articles are counted by batch
// date (Chicago) and cost by UTC time, so a Sunday-night run can split across two weeks.
// Cost per article finished compares a week's writing with that week's reading; an article is
// often read the week after it is written, so the current, partial week reads high.

import { HOME_SHOWS } from "./plan-interests";

/** A tagged-template query, as neon() returns: the report takes one so it can run on any Postgres */
export type Query = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;



type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const usd = (v: unknown) => `$${n(v).toFixed(2)}`;

export async function writingStats(sql: Query, weeksWanted = 8): Promise<string> {
  const WEEKS = Math.max(1, Math.min(26, Math.floor(weeksWanted) || 8));
  // Weeks start Monday (date_trunc('week')), UTC
  // A base article counts as read when some student has finished it at any level
  const writtenQ = sql`
    WITH read_bases AS (
      SELECT DISTINCT COALESCE(v.base_article_id, v.id) AS id
      FROM articles a JOIN article_cache v ON v.id = a.source_cache_id
      WHERE a.read = true
    ), c AS (
      SELECT ac.generated_date, ac.category, ac.base_article_id,
        (ac.base_article_id IS NULL AND rb.id IS NOT NULL) AS base_read
      FROM article_cache ac LEFT JOIN read_bases rb ON rb.id = ac.id
      WHERE ac.generated_date >= date_trunc('week', CURRENT_DATE) - (${WEEKS - 1} * INTERVAL '7 days')
    )
    SELECT date_trunc('week', generated_date::timestamp)::date::text AS week,
      COUNT(*) FILTER (WHERE base_article_id IS NULL)::int AS base,
      COUNT(*)::int AS versions,
      COUNT(*) FILTER (WHERE base_article_id IS NULL AND category = 'news')::int AS news,
      COUNT(*) FILTER (WHERE base_article_id IS NULL AND category = 'general')::int AS explore,
      COUNT(*) FILTER (WHERE base_read)::int AS base_read,
      COUNT(*) FILTER (WHERE base_read AND category = 'news')::int AS news_read,
      COUNT(*) FILTER (WHERE base_read AND category = 'general')::int AS explore_read,
      COUNT(DISTINCT generated_date) FILTER (WHERE base_article_id IS NULL)::int AS writing_days
    FROM c
    GROUP BY 1 ORDER BY 1
  `;

  // Per week: articles finished (article ids are per student, so distinct ids add up across
  // students), readers, and the most any one reader finished
  const readQ = sql`
    WITH per AS (
      SELECT date_trunc('week', completed_at)::date::text AS week, student_id, COUNT(DISTINCT article_id)::int AS finished
      FROM reading_sessions
      WHERE completed_at >= date_trunc('week', CURRENT_DATE) - (${WEEKS - 1} * INTERVAL '7 days')
      GROUP BY 1, 2
    )
    SELECT week, SUM(finished)::int AS finished, COUNT(*)::int AS readers, MAX(finished)::int AS most
    FROM per GROUP BY 1 ORDER BY 1
  `;

  const costQ = sql`
    SELECT date_trunc('week', created_at)::date::text AS week, SUM(cost_usd) AS usd, COUNT(*)::int AS calls
    FROM ai_usage
    WHERE (starts_with(feature, 'batch_') OR feature = 'guide_notes')
      AND created_at >= date_trunc('week', CURRENT_DATE) - (${WEEKS - 1} * INTERVAL '7 days')
    GROUP BY 1 ORDER BY 1
  `;

  const costByFeatureQ = sql`
    SELECT feature, SUM(cost_usd) AS usd, COUNT(*)::int AS calls
    FROM ai_usage
    WHERE (starts_with(feature, 'batch_') OR feature = 'guide_notes') AND created_at >= CURRENT_DATE - INTERVAL '28 days'
    GROUP BY 1 ORDER BY 2 DESC NULLS LAST
  `;

  // Everyone in one pass (no per-student subqueries, no per-student rows): does every student
  // who reads have enough unread to fill the home screen?
  const studentsQ = sql`
    WITH unread AS (SELECT student_id, COUNT(*)::int AS n FROM articles WHERE read = false GROUP BY 1),
    last_read AS (SELECT student_id, MAX(completed_at) AS at FROM reading_sessions GROUP BY 1),
    s AS (
      SELECT COALESCE(u.n, 0) AS unread, lr.at AS last_read
      FROM students st LEFT JOIN unread u ON u.student_id = st.id LEFT JOIN last_read lr ON lr.student_id = st.id
      WHERE st.onboarding_complete = true AND st.reading_level IS NOT NULL
    )
    SELECT COUNT(*)::int AS onboarded,
      COUNT(*) FILTER (WHERE last_read >= NOW() - INTERVAL '7 days')::int AS read_7d,
      COUNT(*) FILTER (WHERE last_read >= NOW() - INTERVAL '30 days')::int AS read_30d,
      COUNT(*) FILTER (WHERE unread < ${HOME_SHOWS})::int AS short,
      COUNT(*) FILTER (WHERE unread < ${HOME_SHOWS} AND last_read >= NOW() - INTERVAL '30 days')::int AS short_readers,
      MIN(unread) FILTER (WHERE last_read >= NOW() - INTERVAL '30 days')::int AS min_unread_readers,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY unread)::int AS median_unread
    FROM s
  `;

  const runsQ = sql`
    SELECT run_date::text AS run_date, status FROM batch_runs
    WHERE run_date >= CURRENT_DATE - INTERVAL '21 days' ORDER BY run_date
  `;

  // Independent queries, together: one round trip's wait. (A timed-out report stops waiting; the
  // queries already sent finish on their own.)
  const [written, read, cost, costByFeature, [students], runs] = await Promise.all([writtenQ, readQ, costQ, costByFeatureQ, studentsQ, runsQ]) as Row[][];

  const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
  const weeks = [...new Set([...written, ...read, ...cost].map(r => day(r.week)))].sort();

  const out: string[] = [];
  out.push(`# Sigma Read: articles written against articles read, last ${WEEKS} weeks (weeks start Monday, UTC)`, "");
  out.push("| Week of | Days written | Base articles | All versions | News (read) | Explore (read) | Base articles read so far | Articles finished | Readers (most by one) | Batch AI cost | Cost per article finished |");
  out.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const w of weeks) {
    const wr = written.find(r => day(r.week) === w) ?? {};
    const rd = read.find(r => day(r.week) === w) ?? {};
    const c = cost.find(r => day(r.week) === w) ?? {};
    const finished = n(rd.finished);
    out.push(`| ${w} | ${n(wr.writing_days)} | ${n(wr.base)} | ${n(wr.versions)} | ${n(wr.news)} (${n(wr.news_read)}) | ${n(wr.explore)} (${n(wr.explore_read)}) | ${n(wr.base_read)} | ${finished} | ${n(rd.readers)} (most ${n(rd.most)}) | ${usd(c.usd)} | ${finished ? usd(n(c.usd) / finished) : "-"} |`);
  }

  out.push("", "## Batch AI cost by step, last 28 days", "", "| Step | Calls | Cost |", "|---|---|---|");
  for (const r of costByFeature) out.push(`| ${r.feature} | ${n(r.calls)} | ${usd(r.usd)} |`);

  const st = students ?? {};
  out.push("", "## Students now (onboarded)", "",
    `${n(st.onboarded)} onboarded; ${n(st.read_7d)} read in the last 7 days, ${n(st.read_30d)} in the last 30. ` +
    `Median unread ${n(st.median_unread)}. Fewer than ${HOME_SHOWS} unread (a short home screen until the next batch tops it up): ` +
    `${n(st.short)} in all, ${n(st.short_readers)} of the recent readers (fewest unread among them: ${st.min_unread_readers ?? "-"}).`);

  out.push("", "## Batch runs, last 21 days", "", runs.map(r => `${day(r.run_date)} ${r.status}`).join(", ") || "none");
  return out.join("\n");
}

