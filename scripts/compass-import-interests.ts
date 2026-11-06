// One-time load of SigmaRead's interest history into Compass's interest graph (app contract
// section 6.2, POST /api/v1/interests/import), then a check of each student's top five.
//
// Run with:
//   DATABASE_URL=... COMPASS_URL=... COMPASS_INTERESTS_KEY=... npx tsx scripts/compass-import-interests.ts          # dry run
//   ... npx tsx scripts/compass-import-interests.ts --send                                                         # import
//   ... npx tsx scripts/compass-import-interests.ts --compare                                                      # top five only
//
// Only students with a Compass learner id in external_id are sent; the rest are counted. Safe
// to re-run: Compass ignores an event it already has (same learner, app, type and source ref).
// Never prints a student's words.

import { neon } from "@neondatabase/serverless";
import { computeAffinities, type SignalType } from "../src/lib/interest-graph/affinity";
import { fetchInterests, learnerIdFrom, sendEvidence, toEvidence, type EvidenceEvent } from "../src/lib/interest-graph/compass";

const sql = neon(process.env.DATABASE_URL!);
const send = process.argv.includes("--send");
const compareOnly = process.argv.includes("--compare");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if ((send || compareOnly) && !(process.env.COMPASS_URL && process.env.COMPASS_INTERESTS_KEY)) {
    throw new Error("COMPASS_URL and COMPASS_INTERESTS_KEY are required to send or compare");
  }

  const students = await sql`SELECT id, name, external_id FROM students ORDER BY id`;
  const linked = students.map(s => ({ id: s.id as number, name: s.name as string, learnerId: learnerIdFrom(s.external_id) }))
    .filter((s): s is { id: number; name: string; learnerId: string } => !!s.learnerId);
  const unlinked = students.length - linked.length;
  console.log(`${students.length} students: ${linked.length} linked to Compass, ${unlinked} skipped (no Compass learner id)`);
  if (linked.length === 0) return;

  const signals = await sql`
    SELECT student_id, topic_slug, phrase, signal_type, weight, source_ref, created_at
    FROM interest_signals WHERE student_id = ANY(${linked.map(s => s.id)}) ORDER BY created_at, id`;

  const events: EvidenceEvent[] = [];
  const perStudent = new Map<number, { sent: number; skipped: number }>();
  for (const s of linked) perStudent.set(s.id, { sent: 0, skipped: 0 });
  for (const r of signals) {
    const student = linked.find(s => s.id === r.student_id)!;
    const e = toEvidence(student.learnerId, {
      topicSlug: r.topic_slug, phrase: r.phrase, signalType: r.signal_type as SignalType,
      weight: Number(r.weight), sourceRef: r.source_ref, createdAt: new Date(r.created_at),
    }, { importing: true });
    const counts = perStudent.get(student.id)!;
    if (e) { events.push(e); counts.sent++; } else counts.skipped++;
  }
  for (const s of linked) {
    const c = perStudent.get(s.id)!;
    console.log(`  ${s.name}: ${c.sent} events${c.skipped ? `, ${c.skipped} without a source ref or topic, skipped` : ""}`);
  }

  if (send && !compareOnly) {
    const results = await sendEvidence(events, { importing: true });
    if (!results) throw new Error("Compass refused or did not answer the import (see the error above)");
    const count = (status: string) => results.filter(r => r.status === status).length;
    console.log(`Imported: ${count("new")} new, ${count("duplicate")} already there, ${count("refused")} refused`);
    const reasons = new Map<string, number>();
    for (const r of results) if (r.status === "refused") reasons.set(r.reason ?? "?", (reasons.get(r.reason ?? "?") ?? 0) + 1);
    for (const [reason, n] of reasons) console.log(`  refused ×${n}: ${reason}`);
  } else if (!compareOnly) {
    console.log(`Dry run: ${events.length} events would be imported. Pass --send to import.`);
    return;
  }

  // Each student's top five here and in Compass. They should match, except where Compass's
  // spreading or a more specific topic changes the order.
  console.log("\nTop five, SigmaRead | Compass:");
  for (const s of linked) {
    const local = computeAffinities(signals.filter(r => r.student_id === s.id && r.topic_slug).map(r => ({
      topicSlug: r.topic_slug as string, signalType: r.signal_type as SignalType, weight: Number(r.weight),
      sourceRef: r.source_ref, createdAt: new Date(r.created_at),
    }))).filter(a => a.status !== "rejected").slice(0, 5).map(a => a.topicSlug);
    const remote = await fetchInterests(s.learnerId, 20);
    const theirs = remote?.interests.filter(i => i.status === "declared" || i.status === "inferred").slice(0, 5).map(i => i.topicId);
    const same = theirs && local.every(t => theirs.includes(t));
    console.log(`  ${same ? "✅" : "⚠️ "} ${s.name}: ${local.join(", ") || "(none)"} | ${theirs ? theirs.join(", ") || "(none)" : "unavailable"}`);
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
