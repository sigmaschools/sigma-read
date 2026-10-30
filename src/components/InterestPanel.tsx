"use client";

import { useEffect, useState } from "react";

interface Topic { slug: string; label: string; isNew?: boolean }
interface Summary { current: Topic[]; fading: Topic[]; removed: Topic[] }

/**
 * "What they're into" for guides, parents and admins: the student's current interests from the
 * interest graph, the ones fading, and the ones removed, with a way to remove or restore each.
 * Falls back to the plain profile list until the graph has anything for this student.
 */
export default function InterestPanel({ studentId, profileInterests }: { studentId: number; profileInterests: string[] }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/students/${studentId}/interests`)
      .then(r => (r.ok ? r.json() : null))
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [studentId]);

  async function setRemoved(slug: string, removed: boolean) {
    setBusy(slug);
    const res = await fetch(`/api/students/${studentId}/interests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, removed }),
    }).catch(() => null);
    if (res?.ok) setSummary(await res.json());
    setBusy(null);
  }

  const hasGraph = summary && (summary.current.length + summary.fading.length + summary.removed.length) > 0;
  if (!hasGraph && profileInterests.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-2">Interests</h2>
      {!hasGraph ? (
        <div className="flex flex-wrap gap-2">
          {profileInterests.map(t => (
            <span key={t} className="px-3 py-1 bg-[var(--accent)]/10 text-[var(--accent)] text-sm rounded-full font-medium">{t}</span>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {summary.current.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {summary.current.map(t => (
                <span key={t.slug} className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 bg-[var(--accent)]/10 text-[var(--accent)] text-sm rounded-full font-medium">
                  {t.label}
                  {t.isNew && <span className="text-[10px] uppercase tracking-wide opacity-70">new</span>}
                  <button
                    onClick={() => setRemoved(t.slug, true)}
                    disabled={busy === t.slug}
                    title={`Stop serving ${t.label}`}
                    aria-label={`Remove ${t.label}`}
                    className="ml-0.5 w-5 h-5 rounded-full hover:bg-[var(--accent)]/20 leading-none disabled:opacity-40"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {summary.fading.length > 0 && (
            <p className="text-xs text-[var(--muted)]">
              Fading: {summary.fading.map(t => t.label).join(", ")}
            </p>
          )}
          {summary.removed.length > 0 && (
            <p className="text-xs text-[var(--muted)]">
              Not into anymore:{" "}
              {summary.removed.map((t, i) => (
                <span key={t.slug}>
                  {i > 0 && ", "}
                  {t.label}{" "}
                  <button
                    onClick={() => setRemoved(t.slug, false)}
                    disabled={busy === t.slug}
                    className="underline hover:text-[var(--fg)] disabled:opacity-40"
                  >
                    restore
                  </button>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
