import { db, schema } from "../src/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  const counts = await db.execute(sql`SELECT reading_level, category, count(*) as cnt FROM article_cache GROUP BY reading_level, category ORDER BY reading_level, category`);
  console.log("Current cache:");
  for (const row of counts.rows) {
    console.log(`  L${row.reading_level} ${row.category}: ${row.cnt}`);
  }
  const total = await db.execute(sql`SELECT count(*) as cnt FROM article_cache`);
  console.log(`\nTotal: ${total.rows[0].cnt}`);
  process.exit(0);
}
main().catch(console.error);
