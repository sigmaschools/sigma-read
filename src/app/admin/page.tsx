"use client";

import { useState, useEffect } from "react";

interface Stats {
  totalStudents: number;
  onboardedStudents: number;
  totalGuides: number;
  sessionsToday: number;
  sessionsThisWeek: number;
  sessionsTotal: number;
  cacheByLevel: Record<number, number>;
  baseArticles: number;
  totalVersions: number;
  lastBatchDate: string | null;
}

interface BatchRun {
  runDate: string;
  status: string;
  attempts: number;
  startedAt: string;
  finishedAt: string | null;
  counts: { baseArticles?: number; adaptations?: number; served?: number } | null;
  lastError: string | null;
}

const BATCH_STATUS_COLORS: Record<string, string> = {
  complete: "bg-green-50 text-green-700", partial: "bg-amber-50 text-amber-700",
  running: "bg-blue-50 text-blue-700", failed: "bg-red-50 text-red-700",
};

interface Guide {
  id: number;
  name: string;
  email: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [batchRuns, setBatchRuns] = useState<BatchRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(r => r.json())
      .then(data => {
        setStats(data.stats);
        setGuides(data.guides || []);
        setAlerts(data.alerts || []);
        setBatchRuns(data.batchRuns || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const levelsWithVersions = stats ? Object.keys(stats.cacheByLevel).length : 0;

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-medium text-amber-800 mb-1">⚠️ Alerts</p>
          {alerts.map((a, i) => (
            <p key={i} className="text-sm text-amber-700">{a}</p>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card label="Students" value={`${stats.onboardedStudents}/${stats.totalStudents}`} sub="onboarded / total" />
          <Card label="Guides" value={stats.totalGuides} />
          <Card label="Sessions Today" value={stats.sessionsToday} />
          <Card label="Sessions This Week" value={stats.sessionsThisWeek} />
          <Card label="Total Sessions" value={stats.sessionsTotal} />
          <Card label="Articles" value={stats.baseArticles} sub={`${stats.totalVersions} versions across ${levelsWithVersions} levels`} />
          <Card
            label="Last Batch"
            value={stats.lastBatchDate ? new Date(stats.lastBatchDate).toLocaleDateString() : "Never"}
            sub={stats.lastBatchDate ? new Date(stats.lastBatchDate).toLocaleTimeString() : undefined}
          />
          <Card label="Alerts" value={alerts.length} color={alerts.length > 0 ? "text-amber-600" : "text-green-600"} />
        </div>
      )}

      {/* Morning batch runs */}
      <h2 className="text-lg font-semibold mb-3">Morning Batch</h2>
      {batchRuns.length === 0 ? (
        <p className="text-sm text-[var(--muted)] mb-8">No runs recorded by the Vercel cron yet.</p>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)] uppercase tracking-wider border-b border-[var(--border)]">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Articles</th>
                <th className="px-4 py-3">Finished</th>
                <th className="px-4 py-3">Last error</th>
              </tr>
            </thead>
            <tbody>
              {batchRuns.map(run => (
                <tr key={run.runDate} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">{run.runDate}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${BATCH_STATUS_COLORS[run.status] ?? "bg-gray-100"}`}>{run.status}</span>
                  </td>
                  <td className="px-4 py-3">{run.attempts}</td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {run.counts ? `${run.counts.baseArticles ?? 0} base · ${run.counts.adaptations ?? 0} adapted · ${run.counts.served ?? 0} served` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">{run.finishedAt ? new Date(run.finishedAt).toLocaleTimeString() : "—"}</td>
                  <td className="px-4 py-3 text-xs text-[var(--danger)]"><p className="line-clamp-2">{run.lastError ?? ""}</p></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Guides Quick View */}
      <h2 className="text-lg font-semibold mb-3">Guides</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        {guides.map(g => (
          <div key={g.id} className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="font-medium">{g.name}</p>
            <p className="text-sm text-[var(--muted)]">{g.email}</p>
          </div>
        ))}
      </div>

      {/* spacer */}
    </div>
  );
}

function Card({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
      <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${color || ""}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--muted)] mt-0.5">{sub}</p>}
    </div>
  );
}
