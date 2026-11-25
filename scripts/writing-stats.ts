// Articles written against articles read, week by week, with the batch AI cost (counts and
// dollars only). The morning batch logs the same report at the start of every run.
// Run with: DATABASE_URL="..." npx tsx scripts/writing-stats.ts [--weeks=8]

import { neon } from "@neondatabase/serverless";
import { writingStats, type Query } from "../src/lib/batch/writing-stats";

const weeksArg = process.argv.find(a => a.startsWith("--weeks="));
const weeks = Number(weeksArg?.split("=")[1]) || 8;

writingStats(neon(process.env.DATABASE_URL!) as unknown as Query, weeks)
  .then(text => console.log(text))
  .catch(e => { console.error(e); process.exit(1); });
