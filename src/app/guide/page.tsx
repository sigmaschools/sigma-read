"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Student {
  id: number;
  name: string;
  username: string;
  readingLevel: number | null;
  onboardingComplete: boolean;
  createdAt: string;
}

interface SessionData {
  score: number | null;
  completedAt: string | null;
}

interface WeeklySummary {
  period: string;
  totalStudents: number;
  activeStudents: number;
  totalSessionsThisWeek: number;
  globalAlerts: string[];
  students: {
    id: number;
    name: string;
    readingLevel: number | null;
    alerts: string[];
    sessionsThisWeek: number;
    avgScoreThisWeek: number | null;
    avgScorePrevWeek: number | null;
    scoreTrend: "up" | "down" | "stable" | "new";
    lastActive: string | null;
    topScore: { title: string; score: number } | null;
    lowestScore: { title: string; score: number } | null;
  }[];
}

export default function GuideDashboard() {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentScores, setStudentScores] = useState<Record<number, SessionData[]>>({});
  const [loading, setLoading] = useState(true);
  const [guideName, setGuideName] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const meRes = await fetch("/api/auth/me");
    const me = await meRes.json();
    if (me.error || me.role !== "guide") { router.push("/login"); return; }
    setGuideName(me.name);

    const studRes = await fetch("/api/students");
    const studs = await studRes.json();
    setStudents(studs);

    // Load recent scores for each student
    const scores: Record<number, SessionData[]> = {};
    for (const s of studs) {
      const repRes = await fetch(`/api/reports?studentId=${s.id}`);
      const reps = await repRes.json();
      scores[s.id] = reps.filter((r: any) => r.score !== null).map((r: any) => ({ score: r.score, completedAt: r.completedAt }));
    }
    setStudentScores(scores);
    setLoading(false);
  }

  async function openSummary() {
    setShowSummary(true);
    setSummaryLoading(true);
    const res = await fetch("/api/guide/weekly-summary");
    const data = await res.json();
    setSummary(data);
    setSummaryLoading(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const levelLabel = (level: number | null) => {
    if (!level) return "Not assessed";
    const labels: Record<number, string> = { 1: "Level 1 (Grade 4)", 2: "Level 2 (Grade 5-6)", 3: "Level 3 (Grade 7)", 4: "Level 4 (Grade 8+)" };
    return labels[level] || `Level ${level}`;
  };

  function sparkline(scores: SessionData[]) {
    if (scores.length < 2) return null;
    const vals = scores.slice(-10).map(s => s.score || 0);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const w = 80;
    const h = 24;
    const points = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
    return (
      <svg width={w} height={h} className="inline-block ml-2">
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-[var(--border)] p-5 flex flex-col">
        <h1 className="text-lg font-semibold tracking-tight mb-1">SigmaRead</h1>
        <p className="text-sm text-[var(--muted)] mb-8">{guideName}</p>
        <nav className="space-y-1 flex-1">
          <a className="block px-3 py-2 text-sm font-medium bg-[var(--surface-hover)] rounded-lg">Students</a>
          <Link href="/guide/add-student" className="block px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--fg)] rounded-lg hover:bg-[var(--surface-hover)] transition">
            + Add Student
          </Link>
        </nav>
        <button onClick={handleLogout} className="text-sm text-[var(--muted)] hover:text-[var(--fg)] text-left">
          Sign out
        </button>
      </aside>

      <main className="flex-1 p-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Your Students</h2>
          <button
            onClick={openSummary}
            className="text-sm px-3 py-1.5 border border-[var(--border)] rounded-lg text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--accent)] transition"
          >
            📊 Weekly Summary
          </button>
        </div>

        {students.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[var(--muted)] mb-4">No students yet.</p>
            <Link
              href="/guide/add-student"
              className="inline-block px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition"
            >
              Add Your First Student
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {students.map((student) => {
              const scores = studentScores[student.id] || [];
              const thisWeek = scores.filter(s => {
                if (!s.completedAt) return false;
                const d = new Date(s.completedAt);
                const now = new Date();
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                return d > weekAgo;
              });

              return (
                <Link
                  key={student.id}
                  href={`/guide/student/${student.id}`}
                  className="block p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-[15px]">{student.name}</h3>
                      <p className="text-sm text-[var(--muted)] mt-1">
                        {levelLabel(student.readingLevel)}
                        {!student.onboardingComplete && " · Onboarding incomplete"}
                      </p>
                    </div>
                    <div className="text-right flex items-center">
                      <div>
                        <p className="text-sm font-medium">{thisWeek.length} this week</p>
                        <p className="text-xs text-[var(--muted)]">{scores.length} total sessions</p>
                      </div>
                      {sparkline(scores)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      {/* Weekly Summary Modal */}
      {showSummary && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowSummary(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-[var(--border)] px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-semibold">📊 Weekly Summary</h2>
                {summary && <p className="text-xs text-[var(--muted)]">{summary.period}</p>}
              </div>
              <button onClick={() => setShowSummary(false)} className="text-[var(--muted)] hover:text-[var(--fg)] text-xl">×</button>
            </div>

            <div className="px-6 py-4">
              {summaryLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : summary ? (
                <div className="space-y-6">
                  {/* Overview */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-[var(--surface)] rounded-xl text-center">
                      <p className="text-2xl font-semibold">{summary.activeStudents}/{summary.totalStudents}</p>
                      <p className="text-xs text-[var(--muted)]">Active students</p>
                    </div>
                    <div className="p-3 bg-[var(--surface)] rounded-xl text-center">
                      <p className="text-2xl font-semibold">{summary.totalSessionsThisWeek}</p>
                      <p className="text-xs text-[var(--muted)]">Sessions this week</p>
                    </div>
                    <div className="p-3 bg-[var(--surface)] rounded-xl text-center">
                      <p className="text-2xl font-semibold">
                        {summary.students.filter(s => s.avgScoreThisWeek !== null).length > 0
                          ? Math.round(summary.students.filter(s => s.avgScoreThisWeek !== null).reduce((a, s) => a + (s.avgScoreThisWeek || 0), 0) / summary.students.filter(s => s.avgScoreThisWeek !== null).length)
                          : "—"
                        }
                      </p>
                      <p className="text-xs text-[var(--muted)]">Avg score</p>
                    </div>
                  </div>

                  {/* Global Alerts */}
                  {summary.globalAlerts.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-sm font-medium text-amber-800 mb-1">Attention</p>
                      {summary.globalAlerts.map((a, i) => (
                        <p key={i} className="text-sm text-amber-700">{a}</p>
                      ))}
                    </div>
                  )}

                  {/* Per-Student */}
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Student Details</h3>
                    <div className="space-y-3">
                      {summary.students.map((s) => (
                        <div key={s.id} className={`p-4 rounded-xl border ${s.alerts.length > 0 ? "border-amber-200 bg-amber-50/30" : "border-[var(--border)] bg-[var(--surface)]"}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-medium text-[15px]">{s.name}</h4>
                              <p className="text-xs text-[var(--muted)]">
                                Level {s.readingLevel || "?"} · {s.sessionsThisWeek} session{s.sessionsThisWeek !== 1 ? "s" : ""} this week
                                {s.lastActive && ` · Last active ${s.lastActive}`}
                              </p>
                            </div>
                            <div className="text-right">
                              {s.avgScoreThisWeek !== null && (
                                <span className={`text-lg font-semibold ${
                                  s.avgScoreThisWeek >= 85 ? "text-green-600" :
                                  s.avgScoreThisWeek >= 70 ? "text-blue-600" :
                                  s.avgScoreThisWeek >= 55 ? "text-yellow-600" :
                                  "text-red-500"
                                }`}>
                                  {s.avgScoreThisWeek}
                                </span>
                              )}
                              {s.scoreTrend === "up" && <span className="ml-1 text-green-600">↑</span>}
                              {s.scoreTrend === "down" && <span className="ml-1 text-red-500">↓</span>}
                              {s.scoreTrend === "stable" && <span className="ml-1 text-[var(--muted)]">→</span>}
                            </div>
                          </div>

                          {s.alerts.length > 0 && (
                            <div className="space-y-1 mb-2">
                              {s.alerts.map((a, i) => (
                                <p key={i} className="text-sm">{a}</p>
                              ))}
                            </div>
                          )}

                          {(s.topScore || s.lowestScore) && (
                            <div className="flex gap-4 text-xs text-[var(--muted)]">
                              {s.topScore && <span>Best: {s.topScore.score} — {s.topScore.title.slice(0, 40)}...</span>}
                              {s.lowestScore && <span>Lowest: {s.lowestScore.score} — {s.lowestScore.title.slice(0, 40)}...</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
