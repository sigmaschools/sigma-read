/**
 * Article Cache Expiry
 * 
 * Deletes expired articles from article_cache:
 * - News: 7 days
 * - Interest/Explore: 30 days
 * 
 * Run daily after the morning batch, or standalone.
 * Usage: DATABASE_URL=... npx tsx scripts/expire-cache.ts [--dry-run]
 */

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`\n🧹 Article Cache Expiry${dryRun ? " (DRY RUN)" : ""}\n`);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Find expired news articles (7 days)
  const expiredNews = await sql`
    SELECT id, title, topic, generated_date FROM article_cache
    WHERE category = 'news' AND generated_date < ${sevenDaysAgo}
  `;

  // Find expired interest/explore articles (30 days)
  const expiredOther = await sql`
    SELECT id, title, topic, generated_date FROM article_cache
    WHERE category != 'news' AND generated_date < ${thirtyDaysAgo}
  `;

  const allExpired = [...expiredNews, ...expiredOther];

  if (allExpired.length === 0) {
    console.log("  No expired articles found.\n");
    return;
  }

  console.log(`  Found ${expiredNews.length} expired news articles (>7 days)`);
  console.log(`  Found ${expiredOther.length} expired interest/explore articles (>30 days)`);

  for (const a of allExpired) {
    console.log(`  🗑️ ${a.topic} (${a.generated_date})`);
  }

  if (!dryRun) {
    const ids = allExpired.map(a => a.id);
    await sql`DELETE FROM article_cache WHERE id = ANY(${ids})`;
    console.log(`\n  ✅ Deleted ${ids.length} articles from cache.`);
  } else {
    console.log(`\n  Would delete ${allExpired.length} articles.`);
  }

  console.log();
}

main().catch(console.error);
