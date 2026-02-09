"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface DashboardStudent {
  id: number;
  name: string;
  username: string;
  readingLevel: number | null;
  gradeLevel: number | null;
  age: number | null;
  onboardingComplete: boolean;
  avgScore: number | null;
  totalSessions: number;
  sessionsThisWeek: number;
  weeklySessionTarget: number;
  status: "succeeding" | "on-track" | "struggling" | "inactive" | "new";
}

interface WeeklySummary {
  period: string;
  totalStudents: number;
  activeStudents: number;
  totalSessionsThisWeek: number;
  globalAlerts: string[];
  levelUps: string[];
  levelDrops: string[];
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
  }[];
}

interface ClassStats {
  activeStudents: number;
  totalStudents: number;
  totalSessionsThisWeek: number;
  classAvgScore: number | null;
  needsAttention: number;
}

export default function GuideDashboard() {
  const [students, setStudents] = useState<DashboardStudent[]>([]);
  const [filtered, setFiltered] = useState<DashboardStudent[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"status" | "name" | "score" | "sessions" | "active">("score");
  const [loading, setLoading] = useState(true);
  const [guideName, setGuideName] = useState("");
  const [classStats, setClassStats] = useState<ClassStats | null>(null);
  const [alerts] = useState<string[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let list = students;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q));
    }
    // Sort
    const sorted = [...list];
    if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "score") sorted.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1));
    else if (sortBy === "sessions") sorted.sort((a, b) => b.sessionsThisWeek - a.sessionsThisWeek);
    else if (sortBy === "active") sorted.sort((a, b) => b.totalSessions - a.totalSessions);
    // default "score" sort: high to low (matches server sort); "status" keeps original server order
    setFiltered(sorted);
  }, [search, students, sortBy]);

  async function loadData() {
    const meRes = await fetch("/api/auth/me");
    const me = await meRes.json();
    if (me.error || me.role !== "guide") { router.push("/login"); return; }
    setGuideName(me.name);

    const dashRes = await fetch("/api/guide/dashboard");
    const data = await dashRes.json();
    setStudents(data.students);
    if (data.classStats) setClassStats(data.classStats);
    // Alerts/levelUps available in data but not shown on dashboard —
    // the student list itself communicates status (struggling sorts to top, badges, scores).
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

  const levelLabel = (level: number | null, short = false) => {
    if (!level) return "—";
    if (short) return `L${level}`;
    const labels: Record<number, string> = {
      1: "L1 (Gr 2-3)",
      2: "L2 (Gr 3-4)",
      3: "L3 (Gr 5-6)",
      4: "L4 (Gr 7)",
      5: "L5 (Gr 8)",
      6: "L6 (Gr 8+)",
    };
    return labels[level] || `L${level}`;
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      succeeding: "bg-green-50 text-green-700 border-green-200",
      "on-track": "bg-blue-50 text-blue-700 border-blue-200",
      struggling: "bg-red-50 text-red-700 border-red-200",
      inactive: "bg-gray-50 text-gray-500 border-gray-200",
      new: "bg-purple-50 text-purple-700 border-purple-200",
    };
    const labels: Record<string, string> = {
      succeeding: "Succeeding",
      "on-track": "On Track",
      struggling: "Struggling",
      inactive: "Inactive",
      new: "New",
    };
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${styles[status] || styles.inactive}`}>
        {labels[status] || status}
      </span>
    );
  };

  const scoreColor = (score: number | null) => {
    if (score === null) return "text-[var(--muted)]";
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-blue-600";
    if (score >= 45) return "text-yellow-600";
    return "text-red-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="border-b border-[var(--border)] px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">SigmaRead</h1>
          <span className="text-xs text-[var(--muted)] bg-[var(--surface)] px-2 py-0.5 rounded">Guide</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/guide/add-student" className="text-sm text-[var(--accent)] hover:underline">
            + Add Student
          </Link>
          <span className="text-sm text-[var(--fg)]">{guideName}</span>
          <button onClick={handleLogout} className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">
            Sign out
          </button>
        </div>
      </header>

      <div className="p-8 max-w-5xl mx-auto">
        {/* No stats or alerts — the student list is the UI */}

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Your Students</h2>
          <div className="flex items-center gap-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg outline-none focus:border-[var(--accent)] transition bg-white"
            >
              <option value="status">Sort: Status</option>
              <option value="name">Sort: Name</option>
              <option value="score">Sort: Score</option>
              <option value="sessions">Sort: Sessions</option>
              <option value="active">Sort: Total</option>
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students…"
              className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg outline-none focus:border-[var(--accent)] transition w-48"
            />
            <button
              onClick={openSummary}
              className="text-sm px-3 py-1.5 border border-[var(--border)] rounded-lg text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--accent)] transition"
            >
              📊 Weekly Summary
            </button>
          </div>
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
            {filtered.map((student) => (
              <Link
                key={student.id}
                href={`/guide/student/${student.id}`}
                className="block p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <h3 className="font-medium text-[15px]">{student.name}</h3>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {student.gradeLevel && student.readingLevel
                          ? `Gr ${student.gradeLevel} · ${levelLabel(student.readingLevel, true)}`
                          : student.gradeLevel
                          ? `Gr ${student.gradeLevel}`
                          : student.readingLevel
                          ? levelLabel(student.readingLevel)
                          : "No level set"}
                        {!student.onboardingComplete && " · Needs onboarding"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${scoreColor(student.avgScore)}`}>
                        {student.avgScore !== null ? student.avgScore : "—"}
                      </p>
{/* volume info moved to student detail page */}
                    </div>
                    {student.status === "inactive" && (
                      <span className="text-xs text-gray-400">Inactive</span>
                    )}
                    {student.status === "new" && (
                      <span className="text-xs text-purple-500">New</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
            {filtered.length === 0 && search && (
              <p className="text-center text-sm text-[var(--muted)] py-8">No students matching &quot;{search}&quot;</p>
            )}
          </div>
        )}
      </div>

      {/* Weekly Summary Modal */}
      {showSummary && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowSummary(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                        {summary.students.filter((s) => s.avgScoreThisWeek !== null).length > 0
                          ? Math.round(
                              summary.students
                                .filter((s) => s.avgScoreThisWeek !== null)
                                .reduce((a, s) => a + (s.avgScoreThisWeek || 0), 0) /
                                summary.students.filter((s) => s.avgScoreThisWeek !== null).length
                            )
                          : "—"}
                      </p>
                      <p className="text-xs text-[var(--muted)]">Avg score</p>
                    </div>
                  </div>

                  {summary.globalAlerts.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-sm font-medium text-amber-800 mb-1">Attention</p>
                      {summary.globalAlerts.map((a, i) => (
                        <p key={i} className="text-sm text-amber-700">{a}</p>
                      ))}
                    </div>
                  )}

                  {summary.levelUps?.length > 0 && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
                      <p className="text-sm font-medium text-green-800 mb-1">🎉 Leveled Up This Week</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {summary.levelUps.map((l: string, i: number) => (
                          <span key={i} className="text-sm text-green-700">{l}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {summary.levelDrops?.length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm font-medium text-red-800 mb-1">Level Drops This Week</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {summary.levelDrops.map((l: string, i: number) => (
                          <span key={i} className="text-sm text-red-700">{l}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Student Details</h3>
                    <div className="space-y-3">
                      {summary.students
                        .sort((a, b) => {
                          // Sort by score descending (highest first) per Wayne's request
                          if (a.avgScoreThisWeek !== null && b.avgScoreThisWeek !== null) return b.avgScoreThisWeek - a.avgScoreThisWeek;
                          if (a.avgScoreThisWeek === null) return 1;
                          return -1;
                        })
                        .map((s) => (
                          <Link
                            key={s.id}
                            href={`/guide/student/${s.id}`}
                            className={`block p-4 rounded-xl border transition hover:border-[var(--accent)] ${
                              s.alerts.length > 0 ? "border-amber-200 bg-amber-50/30" : "border-[var(--border)] bg-[var(--surface)]"
                            }`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <div>
                                <h4 className="font-medium text-[15px]">{s.name}</h4>
                                <p className="text-xs text-[var(--muted)]">
                                  {s.readingLevel ? levelLabel(s.readingLevel) : "Not assessed"}
                                  {s.lastActive && ` · Last active ${s.lastActive}`}
                                </p>
                              </div>
                              <div className="text-right">
                                {s.avgScoreThisWeek !== null && (
                                  <span className={`text-lg font-semibold ${scoreColor(s.avgScoreThisWeek)}`}>
                                    {s.avgScoreThisWeek}
                                  </span>
                                )}
                                {s.scoreTrend === "up" && <span className="ml-1 text-green-600">↑</span>}
                                {s.scoreTrend === "down" && <span className="ml-1 text-red-500">↓</span>}
                                {s.scoreTrend === "stable" && <span className="ml-1 text-[var(--muted)]">→</span>}
                              </div>
                            </div>

                            {s.alerts.length > 0 && (
                              <div className="space-y-1">
                                {s.alerts.map((a, i) => (
                                  <p key={i} className="text-sm">{a}</p>
                                ))}
                              </div>
                            )}
                          </Link>
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
