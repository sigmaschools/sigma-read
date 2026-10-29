export const dynamic = "force-dynamic";
export const maxDuration = 800; // Vercel Pro maximum

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runMorningBatch } from "@/lib/batch/morning-batch";
import { acquireRun, finishRun, failRun, claimAlert, chicagoNow } from "@/lib/batch/runs";

/** Stop starting new work this long after the call begins, leaving room to save and respond. */
const WORK_BUDGET_MS = 740_000;
const RUN_FROM_HOUR = 5; // 5 AM CT
const ALERT_FROM_HOUR = 7; // alert if today's run isn't complete by 7 AM CT

// Vercel Cron calls this several times each morning (see vercel.json). Cron times are UTC,
// so each call checks the Chicago clock: it starts or resumes today's run from 5 AM CT,
// and does nothing once the run is complete. `?force=1` skips the clock check for manual runs.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startedAt = Date.now();
  const { date, hour } = chicagoNow();
  const force = req.nextUrl.searchParams.get("force") === "1";

  if (!force && hour < RUN_FROM_HOUR) {
    return NextResponse.json({ date, skipped: "before 5 AM CT" });
  }

  let outcome: Record<string, unknown> = { date };
  const run = await acquireRun(date);
  if (!run) {
    outcome.skipped = "already complete or running";
  } else {
    try {
      const result = await runMorningBatch({ deadline: startedAt + WORK_BUDGET_MS });
      await finishRun(run.id, result);
      outcome = { ...outcome, attempt: run.attempts, ...result };
    } catch (e) {
      const message = e instanceof Error ? e.stack || e.message : String(e);
      console.error("Morning batch failed:", message);
      await failRun(run.id, message);
      outcome = { ...outcome, attempt: run.attempts, status: "failed", error: String(e) };
    }
  }

  if (hour >= ALERT_FROM_HOUR) await sendAlertIfIncomplete(date);

  return NextResponse.json(outcome);
}

async function sendAlertIfIncomplete(date: string) {
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to || !process.env.RESEND_API_KEY) return;

  const state = await claimAlert(date);
  if (!state) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.EMAIL_FROM || "SigmaRead <noreply@sigmaread.app>",
    to,
    subject: `SigmaRead morning batch not complete (${date})`,
    text: [
      `Today's morning batch is "${state.status}" after ${state.attempts} attempt(s).`,
      state.lastError ? `\nLast error:\n${state.lastError}` : "",
      `\nStudents still have their article buffer, so nothing is urgent, but check the Vercel logs for /api/cron/morning-batch.`,
    ].join("\n"),
  }).catch(e => console.error("Failed to send batch alert:", e));
}
