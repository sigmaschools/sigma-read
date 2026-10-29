/**
 * Apply pending SQL migrations from drizzle/ to the database.
 *
 * Runs automatically before `next build` on Vercel production deploys (VERCEL_ENV=production),
 * so additive schema changes land before the code that uses them. Skipped everywhere else
 * (local builds, CI, previews) unless forced:
 *
 *   DATABASE_URL="..." MIGRATE=1 node scripts/migrate.mjs
 *
 * Migrations 0000-0004 predate this runner and were applied by hand (drizzle-kit push);
 * on a database that already has the `students` table they are recorded as applied, not re-run.
 * New migrations must be idempotent (IF NOT EXISTS) and additive.
 */

import { neon } from "@neondatabase/serverless";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASELINE = ["0000_faulty_darkstar", "0001_perpetual_mojo", "0002_handy_celestials", "0003_discussion_duration", "0004_article_diversity_longterm"];
const DIR = join(process.cwd(), "drizzle");

const shouldRun = process.env.MIGRATE === "1" || process.env.VERCEL_ENV === "production";
if (!shouldRun) {
  console.log("migrate: skipped (not a Vercel production build; set MIGRATE=1 to force)");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("migrate: DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamp DEFAULT now() NOT NULL)`;

  const applied = new Set((await sql`SELECT name FROM schema_migrations`).map(r => r.name));

  if (applied.size === 0) {
    const [{ exists }] = await sql`SELECT to_regclass('public.students') IS NOT NULL AS exists`;
    if (exists) {
      for (const name of BASELINE) {
        await sql`INSERT INTO schema_migrations (name) VALUES (${name}) ON CONFLICT DO NOTHING`;
        applied.add(name);
      }
      console.log(`migrate: recorded ${BASELINE.length} pre-existing migrations as applied`);
    }
  }

  const files = readdirSync(DIR).filter(f => f.endsWith(".sql")).sort();
  let count = 0;
  for (const file of files) {
    const name = file.replace(/\.sql$/, "");
    if (applied.has(name)) continue;

    // drizzle-kit separates statements with "--> statement-breakpoint"; hand-written files use ";" at line end
    const statements = readFileSync(join(DIR, file), "utf8")
      .split(/--> statement-breakpoint|;\s*$/m)
      .map(s => s.trim())
      .filter(s => s && !/^(--[^\n]*\n?)+$/.test(s));

    console.log(`migrate: applying ${name} (${statements.length} statements)`);
    for (const statement of statements) {
      await sql.query(statement);
    }
    await sql`INSERT INTO schema_migrations (name) VALUES (${name})`;
    count++;
  }

  console.log(count === 0 ? "migrate: up to date" : `migrate: applied ${count} migration(s)`);
}

main().catch(e => {
  console.error("migrate: failed —", e.message);
  process.exit(1);
});
