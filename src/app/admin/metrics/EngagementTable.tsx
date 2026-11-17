"use client";

import { useEffect, useState } from "react";
import type { EngagementWeek } from "@/lib/engagement";

interface Engagement {
  weeks: EngagementWeek[];
  readers: { id: number; name: string }[];
  lookupsSince: string | null;
}

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const num = (n: number | null, digits = 1) => (n === null ? "—" : n.toFixed(digits));
const weekLabel = (w: string) => new Date(`${w}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

// The numbers every reading change is checked against (docs/session-analytics.md, "Engagement baseline")
export default function EngagementTable() {
  const [student, setStudent] = useState("");
  const [readers, setReaders] = useState<Engagement["readers"]>([]);
  const [weeks, setWeeks] = useState<EngagementWeek[] | null>(null);
  const [lookupsSince, setLookupsSince] = useState<string | null>(null);

  useEffect(() => {
    let current = true; // a slower answer for an earlier choice is dropped
    fetch(`/api/admin/metrics/engagement${student ? `?student=${student}` : ""}`)
      .then(r => r.json())
      .then((d: Engagement) => {
        if (!current) return;
        setLookupsSince(d.lookupsSince ?? null);
        setWeeks(d.weeks ?? []);
        if (!student) setReaders(d.readers ?? []);
      })
      .catch(() => { if (current) setWeeks([]); });
    return () => { current = false; };
  }, [student]);

  const rows: { label: string; hint: string; value: (w: EngagementWeek) => string }[] = [
    { label: "Students reading", hint: "finished at least one piece", value: w => String(w.students) },
    { label: "Pieces finished", hint: "discussion completed", value: w => String(w.pieces) },
    { label: "Pieces per student", hint: "", value: w => num(w.piecesPerStudent) },
    { label: "Daily goal reached", hint: "of days with reading", value: w => `${pct(w.goalRate)} (${w.goalDays}/${w.daysRead})` },
    { label: "Like rate", hint: "thumbs up of thumbs given", value: w => `${pct(w.likeRate)} (${w.liked}/${w.liked + w.disliked})` },
    { label: "Favorites picked", hint: "per goal day", value: w => `${pct(w.favoriteRate)} (${w.favorites})` },
    { label: "Felt it went well", hint: "really or pretty well", value: w => {
      const total = Object.values(w.selfAssessment).reduce((a, b) => a + b, 0);
      return total ? `${pct((w.selfAssessment.really_well + w.selfAssessment.pretty_well) / total)} (${total})` : "—";
    } },
    { label: "Score, middle half", hint: "25th to 75th percentile", value: w => (w.scoreP25 === null ? "—" : `${Math.round(w.scoreP25)}–${Math.round(w.scoreP75!)}`) },
    { label: "Score median", hint: "", value: w => (w.scoreMedian === null ? "—" : String(Math.round(w.scoreMedian))) },
    { label: "Scores in 60–75", hint: "the target zone", value: w => pct(w.inTargetZone) },
    { label: "Lookups per piece", hint: lookupsSince ? `saved from ${new Date(lookupsSince).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : "none saved yet", value: w => num(w.lookupsPerPiece, 2) },
  ];

  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold">Engagement by Week</h2>
        <select value={student} onChange={e => { setWeeks(null); setStudent(e.target.value); }}
          className="text-sm border border-[var(--border)] rounded-lg px-2 py-1 bg-white">
          <option value="">All students</option>
          {readers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-x-auto">
        {weeks === null ? (
          <p className="p-4 text-sm text-[var(--muted)]">Loading…</p>
        ) : weeks.length === 0 ? (
          <p className="p-4 text-sm text-[var(--muted)]">No reading in the last eight weeks.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)] uppercase tracking-wider border-b border-[var(--border)]">
                <th className="px-4 py-2">Week of</th>
                {weeks.map(w => <th key={w.week} className="px-3 py-2 text-right whitespace-nowrap">{weekLabel(w.week)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.label} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {r.label}
                    {r.hint && <span className="block text-xs text-[var(--muted)]">{r.hint}</span>}
                  </td>
                  {weeks.map(w => <td key={w.week} className="px-3 py-2 text-right whitespace-nowrap">{r.value(w)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-[var(--muted)] mt-2">Weeks start Monday, US Central time. The daily goal is each student&apos;s current goal.</p>
    </div>
  );
}
