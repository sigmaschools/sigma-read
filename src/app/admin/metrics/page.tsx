"use client";

import { useState, useEffect } from "react";

interface Metrics {
  sessionsPerDay: { date: string; count: number }[];
  scoresByLevel: { level: number | null; avgScore: number; count: number }[];
  selfAssessment: { accurate: number; overconfident: number; underconfident: number; total: number };
  conversationStyles: { style: string | null; count: number }[];
  costs: { conversations: number; reports: number; articles: number; total: number };
  counts: { conversations: number; articles: number; reports: number };
}

export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/metrics").then(r => r.json()).then(data => {
      setMetrics(data);
      setLoading(false);
    });
  }, []);

  if (loading || !metrics) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;
  }

  const maxSessions = Math.max(...metrics.sessionsPerDay.map(d => d.count), 1);

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-semibold mb-6">System Metrics</h1>

      {/* Cost Overview */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Est. Total Cost</p>
          <p className="text-2xl font-semibold">${metrics.costs.total.toFixed(2)}</p>
        </div>
        <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Conversations</p>
          <p className="text-lg font-semibold">{metrics.counts.conversations}</p>
          <p className="text-xs text-[var(--muted)]">~${metrics.costs.conversations.toFixed(2)}</p>
        </div>
        <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Reports</p>
          <p className="text-lg font-semibold">{metrics.counts.reports}</p>
          <p className="text-xs text-[var(--muted)]">~${metrics.costs.reports.toFixed(2)}</p>
        </div>
        <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Cached Articles</p>
          <p className="text-lg font-semibold">{metrics.counts.articles}</p>
          <p className="text-xs text-[var(--muted)]">~${metrics.costs.articles.toFixed(2)}</p>
        </div>
      </div>

      {/* Sessions per Day Chart */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Sessions Per Day (Last 30 Days)</h2>
        <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          {metrics.sessionsPerDay.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No session data yet.</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {metrics.sessionsPerDay.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-[var(--accent)] rounded-t"
                    style={{ height: `${(d.count / maxSessions) * 100}%`, minHeight: d.count > 0 ? "4px" : "0" }}
                    title={`${d.date}: ${d.count} sessions`}
                  />
                  {i % 7 === 0 && (
                    <p className="text-[9px] text-[var(--muted)] -rotate-45 origin-top-left mt-1">
                      {new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Score by Level + Self-Assessment + Conversation Styles */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {/* Avg Score by Level */}
        <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-3">Avg Score by Level</p>
          {metrics.scoresByLevel.filter(s => s.level).map(s => (
            <div key={s.level} className="flex items-center justify-between py-1">
              <span className="text-sm">L{s.level}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${s.avgScore}%` }} />
                </div>
                <span className="text-sm font-semibold w-8 text-right">{s.avgScore}</span>
                <span className="text-xs text-[var(--muted)]">({s.count})</span>
              </div>
            </div>
          ))}
        </div>

        {/* Self-Assessment Accuracy */}
        <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-3">Self-Assessment Accuracy</p>
          {metrics.selfAssessment.total > 0 ? (
            <div className="space-y-2">
              <Bar label="Accurate" value={metrics.selfAssessment.accurate} total={metrics.selfAssessment.total} color="bg-green-500" />
              <Bar label="Overconfident" value={metrics.selfAssessment.overconfident} total={metrics.selfAssessment.total} color="bg-amber-500" />
              <Bar label="Underconfident" value={metrics.selfAssessment.underconfident} total={metrics.selfAssessment.total} color="bg-blue-500" />
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">No data yet.</p>
          )}
        </div>

        {/* Conversation Styles */}
        <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-3">Conversation Styles</p>
          {metrics.conversationStyles.filter(s => s.style).map(s => (
            <div key={s.style} className="flex items-center justify-between py-1">
              <span className="text-xs">{(s.style || "").toLowerCase().replace(/_/g, " ")}</span>
              <span className="text-sm font-semibold">{s.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = Math.round((value / total) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span>{pct}% ({value})</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
