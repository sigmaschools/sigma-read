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

interface Guide {
  id: number;
  name: string;
  email: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(r => r.json())
      .then(data => {
        setStats(data.stats);
        setGuides(data.guides || []);
        setAlerts(data.alerts || []);
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
