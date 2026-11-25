import assert from "node:assert/strict";
import { writingStats, type Query } from "./writing-stats";

// A fake database: answers each of the report's queries by what it selects
const fake: Query = async (strings) => {
  const text = strings.join("?");
  if (text.includes("FROM students")) return [{ onboarded: 3, read_7d: 2, read_30d: 2, short: 1, short_readers: 0, min_unread_readers: 18, median_unread: 18 }];
  if (text.includes("FROM article_cache")) return [{ week: "2026-11-16", base: 7, versions: 21, news: 1, explore: 1, base_read: 4, news_read: 0, explore_read: 1, writing_days: 2 }];
  if (text.includes("FROM reading_sessions")) return [{ week: "2026-11-16", finished: 8, readers: 2, most: 6 }];
  if (text.includes("SUM(cost_usd)") && text.includes("date_trunc")) return [{ week: "2026-11-16", usd: "4.00", calls: 90 }];
  if (text.includes("SUM(cost_usd)")) return [{ feature: "batch_rewrite", usd: "2.5", calls: 7 }];
  if (text.includes("FROM batch_runs")) return [{ run_date: "2026-11-17", status: "complete" }];
  throw new Error("unexpected query");
};

writingStats(fake).then(out => {
// 8 articles finished by 2 readers for $4.00: 50 cents an article
assert.match(out, /\| 2026-11-16 \| 2 \| 7 \| 21 \| 1 \(0\) \| 1 \(1\) \| 4 \| 8 \| 2 \(most 6\) \| \$4\.00 \| \$0\.50 \|/);
assert.match(out, /\| batch_rewrite \| 7 \| \$2\.50 \|/);
assert.match(out, /3 onboarded; 2 read in the last 7 days, 2 in the last 30\. Median unread 18\. Fewer than 5 unread .*: 1 in all, 0 of the recent readers \(fewest unread among them: 18\)/);
assert.match(out, /2026-11-17 complete/);
// Counts and dollars only: no names or titles are selected
assert.doesNotMatch(out, /name|title/i);
console.log("✅ writing stats: weekly table, cost per article finished, no names");
}).catch(e => { console.error(e); process.exit(1); });
