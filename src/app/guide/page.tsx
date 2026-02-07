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

export default function GuideDashboard() {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentScores, setStudentScores] = useState<Record<number, SessionData[]>>({});
  const [loading, setLoading] = useState(true);
  const [guideName, setGuideName] = useState("");
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
        <h2 className="text-xl font-semibold mb-6">Your Students</h2>

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
    </div>
  );
}
