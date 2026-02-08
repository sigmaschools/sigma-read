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
  status: "succeeding" | "on-track" | "struggling" | "inactive" | "new";
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
  }[];
}

export default function GuideDashboard() {
  const [students, setStudents] = useState<DashboardStudent[]>([]);
  const [filtered, setFiltered] = useState<DashboardStudent[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [guideName, setGuideName] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(students);
    } else {
      const q = search.toLowerCase();
      setFiltered(students.filter((s) => s.name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q)));
    }
  }, [search, students]);

  async function loadData() {
    const meRes = await fetch("/api/auth/me");
    const me = await meRes.json();
    if (me.error || me.role !== "guide") { router.push("/login"); return; }
    setGuideName(me.name);

    const dashRes = await fetch("/api/guide/dashboard");
    const data = await dashRes.json();
    setStudents(data.students);
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
      succeeding: "bg-[#ECFDF5] text-[#059669]",
      "on-track": "bg-[#EEF2FF] text-[#4F6BED]",
      struggling: "bg-[#FEE2E2] text-[#DC2626]",
      inactive: "bg-[#F5F5F3] text-[var(--muted)]",
      new: "bg-[#F3E8FF] text-[#7C3AED]",
    };
    const labels: Record<string, string> = {
      succeeding: "Active",
      "on-track": "On Track",
      struggling: "Struggling",
      inactive: "Inactive",
      new: "New",
    };
    return (
      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${styles[status] || styles.inactive}`}>
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
    <div className="flex min-h-screen guide-font">
      {/* Sidebar */}
      <aside className="w-60 bg-[var(--surface)] border-r border-[var(--border)] p-6 flex flex-col">
        <h1 className="text-[17px] font-semibold tracking-tight px-2 mb-7">SigmaRead</h1>
        <nav className="space-y-1 flex-1">
          <a className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium bg-[#EEF2FF] text-[var(--accent)] rounded-lg">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
            Home
          </a>
          <Link href="/guide/add-student" className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--fg)] rounded-lg hover:bg-[var(--surface-hover)] transition">
            + Add Student
          </Link>
        </nav>
        <div className="border-t border-[var(--border)] pt-4 mt-4">
          <p className="text-sm font-medium">{guideName}</p>
          <button onClick={handleLogout} className="text-xs text-[var(--muted)] hover:text-[var(--danger)] transition mt-1">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 bg-[var(--bg)]">
        <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[22px] font-semibold tracking-tight">Your Students</h1>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students…"
              className="px-3 py-2 text-sm border-[1.5px] border-[var(--border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--accent)] transition w-48 bg-[var(--surface)]"
            />
            <button
              onClick={openSummary}
              className="text-sm px-3 py-2 border-[1.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--accent)] transition bg-[var(--surface)]"
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
          <div className="bg-[var(--surface)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted)] border-b border-[var(--border)]">
              <span>Student</span>
              <span>Level</span>
              <span>Sessions</span>
              <span>Avg Score</span>
              <span>Status</span>
            </div>
            {/* Rows */}
            {filtered.map((student) => (
              <Link
                key={student.id}
                href={`/guide/student/${student.id}`}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-5 py-4 items-center border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg)] transition cursor-pointer"
              >
                <span className="text-sm font-medium">{student.name}</span>
                <span className="text-sm">
                  {student.readingLevel ? levelLabel(student.readingLevel, true) : "—"}
                </span>
                <span className="text-sm">{student.totalSessions}</span>
                <span className={`text-sm font-medium ${scoreColor(student.avgScore)}`}>
                  {student.avgScore !== null ? student.avgScore : "—"}
                </span>
                <span>{statusBadge(student.status)}</span>
              </Link>
            ))}
            {filtered.length === 0 && search && (
              <p className="text-center text-sm text-[var(--muted)] py-8">No students matching &quot;{search}&quot;</p>
            )}
          </div>
        )}

        </div>
      </main>

      {/* Weekly Summary Modal */}
      {showSummary && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowSummary(false)}>
          <div className="bg-[var(--surface)] rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between rounded-t-2xl">
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
                                  {s.readingLevel ? levelLabel(s.readingLevel) : "Not assessed"} · {s.sessionsThisWeek} session{s.sessionsThisWeek !== 1 ? "s" : ""} this week
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
