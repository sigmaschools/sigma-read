/**
 * Run the morning article batch by hand (local runs, backfills).
 * In production it runs from Vercel Cron via /api/cron/morning-batch.
 *
 * Run with: DATABASE_URL="..." ANTHROPIC_API_KEY="..." BRAVE_API_KEY="..." npx tsx scripts/morning-batch.ts
 */

import { runMorningBatch } from "../src/lib/batch/morning-batch";

runMorningBatch()
  .then(result => console.log(result))
  .catch(console.error);
