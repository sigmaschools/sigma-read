/**
 * Bookkeeping for the morning batch across resumable cron calls.
 * Uses @neondatabase/serverless directly, like the batch itself.
 */

import { neon } from "@neondatabase/serverless";
import type { BatchResult } from "./morning-batch";

const sql = neon(process.env.DATABASE_URL!);

/** Lease length: longer than one function call (800 s), so a crashed call frees the lock on its own. */
const LEASE_MINUTES = 15;

/** Current date and hour in America/Chicago (the batch's schedule is 5 AM CT). */
export function chicagoNow(now = new Date()): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map(p => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: parseInt(parts.hour) };
}

/**
 * Create the table if it's missing, so the first cron call after deploy works
 * before anyone runs the migration (drizzle/0005_batch_runs.sql, same DDL).
 */
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS batch_runs (
      id serial PRIMARY KEY NOT NULL,
      run_date date NOT NULL UNIQUE,
      status varchar(20) DEFAULT 'running' NOT NULL,
      attempts integer DEFAULT 0 NOT NULL,
      lease_until timestamp,
      started_at timestamp DEFAULT now() NOT NULL,
      finished_at timestamp,
      counts jsonb DEFAULT '{}'::jsonb,
      last_error text,
      alert_sent_at timestamp,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `;
}

/**
 * Take the lock for today's run. Returns null if today's run is already complete,
 * or another call holds an unexpired lease (Vercel can deliver a cron event twice).
 */
export async function acquireRun(runDate: string): Promise<{ id: number; attempts: number } | null> {
  await ensureTable();
  const rows = await sql`
    INSERT INTO batch_runs (run_date, status, attempts, lease_until)
    VALUES (${runDate}, 'running', 1, NOW() + make_interval(mins => ${LEASE_MINUTES}))
    ON CONFLICT (run_date) DO UPDATE SET
      status = 'running',
      attempts = batch_runs.attempts + 1,
      lease_until = NOW() + make_interval(mins => ${LEASE_MINUTES})
    WHERE batch_runs.status <> 'complete'
      AND (batch_runs.lease_until IS NULL OR batch_runs.lease_until < NOW())
    RETURNING id, attempts
  `;
  return rows.length > 0 ? { id: rows[0].id as number, attempts: rows[0].attempts as number } : null;
}

/** Release the lock and record what this call got done. Counts accumulate across calls. */
export async function finishRun(id: number, result: BatchResult): Promise<void> {
  await sql`
    UPDATE batch_runs SET
      status = ${result.status},
      lease_until = NULL,
      finished_at = CASE WHEN ${result.status} = 'complete' THEN NOW() ELSE finished_at END,
      last_error = NULL,
      counts = jsonb_build_object(
        'baseArticles', COALESCE((counts->>'baseArticles')::int, 0) + ${result.baseArticles},
        'adaptations', COALESCE((counts->>'adaptations')::int, 0) + ${result.adaptations},
        'served', COALESCE((counts->>'served')::int, 0) + ${result.served}
      )
    WHERE id = ${id}
  `;
}

export async function failRun(id: number, error: string): Promise<void> {
  await sql`
    UPDATE batch_runs SET status = 'failed', lease_until = NULL, last_error = ${error.slice(0, 2000)}
    WHERE id = ${id}
  `;
}

/**
 * Claim the one alert for a day whose run isn't complete. Returns the run's state
 * if this call should send the alert, or null if it's complete or already alerted.
 */
export async function claimAlert(runDate: string): Promise<{ status: string; attempts: number; lastError: string | null } | null> {
  const rows = await sql`
    UPDATE batch_runs SET alert_sent_at = NOW()
    WHERE run_date = ${runDate} AND status <> 'complete' AND alert_sent_at IS NULL
    RETURNING status, attempts, last_error
  `;
  if (rows.length === 0) return null;
  return { status: rows[0].status as string, attempts: rows[0].attempts as number, lastError: rows[0].last_error as string | null };
}
