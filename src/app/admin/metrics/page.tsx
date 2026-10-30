"use client";

import { useState, useEffect } from "react";

interface Usage {
  byFeature: { feature: string; calls: number; pricedCalls: number; cost: number; inputTokens: number; outputTokens: number }[];
  byDay: { date: string; cost: number }[];
  total30d: number;
  unpricedCalls: number;
}

const FEATURE_LABELS: Record<string, string> = {
  tutor_turn: "Tutor conversation", report: "Comprehension report", coaching: "Coaching feedback",
  onboarding: "Onboarding", definition: "Word definitions", pre_reading: "Pre-reading prompt",
  feed_event: "Interest tags", interest_resolve: "Interest matching", article_generate: "On-demand articles", parent_chat: "Parent chat",
  batch_adjacent: "Batch: adjacent interests", batch_filter: "Batch: source filter",
  batch_rewrite: "Batch: base articles", batch_adapt: "Batch: level adaptations",
};

const usd = (n: number) => n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString()}`;

interface Metrics {
  usage: Usage;
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

      {/* Tracked AI spend */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">AI Spend (Last 30 Days)</h2>
        {metrics.usage.byFeature.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No tracked calls yet. The estimates below are rough per-item guesses.</p>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-baseline justify-between">
              <p className="text-2xl font-semibold">{usd(metrics.usage.total30d)}</p>
              <p className="text-xs text-[var(--muted)]">
                {metrics.usage.byDay.length > 0 && `about ${usd(metrics.usage.total30d / metrics.usage.byDay.length)} per active day`}
                {metrics.usage.unpricedCalls > 0 && ` · ${metrics.usage.unpricedCalls} calls on models with no listed price`}
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)] uppercase tracking-wider border-b border-[var(--border)]">
                  <th className="px-4 py-2">Feature</th>
                  <th className="px-4 py-2 text-right">Calls</th>
                  <th className="px-4 py-2 text-right">Tokens in / out</th>
                  <th className="px-4 py-2 text-right">Cost</th>
                  <th className="px-4 py-2 text-right">Per call</th>
                </tr>
              </thead>
              <tbody>
                {metrics.usage.byFeature.map(f => (
                  <tr key={f.feature} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2">{FEATURE_LABELS[f.feature] ?? f.feature}</td>
                    <td className="px-4 py-2 text-right">{f.calls.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-[var(--muted)]">{f.inputTokens.toLocaleString()} / {f.outputTokens.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-medium">{usd(f.cost)}</td>
                    <td className="px-4 py-2 text-right text-[var(--muted)]">{f.pricedCalls > 0 ? `$${(f.cost / f.pricedCalls).toFixed(4)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cost Overview */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Est. Total Cost (rough, all time)</p>
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
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Articles</p>
          <p className="text-lg font-semibold">{Math.ceil((metrics.counts.articles || 0) / 4)}</p>
          <p className="text-xs text-[var(--muted)]">{metrics.counts.articles} versions · ~${metrics.costs.articles.toFixed(2)}</p>
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
