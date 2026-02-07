"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface SessionReport {
  sessionId: number;
  articleId: number;
  startedAt: string;
  completedAt: string | null;
  articleTitle: string;
  articleTopic: string;
  reportId: number | null;
  score: number | null;
  rating: string | null;
  understood: string | null;
  missed: string | null;
  engagementNote: string | null;
  conversationId: number | null;
  messages: { role: string; content: string }[] | null;
}

interface Student {
  id: number;
  name: string;
  readingLevel: number | null;
  interestProfile: any;
  onboardingComplete: boolean;
}

export default function StudentDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [sessions, setSessions] = useState<SessionReport[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    const studRes = await fetch("/api/students");
    const studs = await studRes.json();
    const s = studs.find((st: Student) => st.id === parseInt(id as string));
    if (!s) { router.push("/guide"); return; }
    setStudent(s);

    const repRes = await fetch(`/api/reports?studentId=${id}`);
    const reps = await repRes.json();
    setSessions(reps);
    setLoading(false);
  }

  const levelLabel = (level: number | null) => {
    if (!level) return "Not assessed";
    const labels: Record<number, string> = { 1: "Level 1 (Grade 4)", 2: "Level 2 (Grade 5-6)", 3: "Level 3 (Grade 7)", 4: "Level 4 (Grade 8+)" };
    return labels[level] || `Level ${level}`;
  };

  const ratingColor = (rating: string | null) => {
    if (!rating) return "var(--muted)";
    const colors: Record<string, string> = { Strong: "var(--success)", Solid: "var(--accent)", Developing: "var(--warning)", "Needs Support": "var(--danger)", Struggled: "var(--danger)" };
    return colors[rating] || "var(--muted)";
  };

  if (loading || !student) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const scoredSessions = sessions.filter(s => s.score !== null);

  // SVG trendline
  function renderTrendline() {
    if (scoredSessions.length < 2) return <p className="text-sm text-[var(--muted)]">Not enough data for a trendline yet.</p>;
    const scores = scoredSessions.map(s => s.score!);
    const w = 600;
    const h = 160;
    const padX = 40;
    const padY = 20;
    const chartW = w - padX * 2;
    const chartH = h - padY * 2;
    const min = Math.max(0, Math.min(...scores) - 10);
    const max = Math.min(100, Math.max(...scores) + 10);
    const range = max - min || 1;

    const points = scores.map((s, i) => {
      const x = padX + (i / (scores.length - 1)) * chartW;
      const y = padY + chartH - ((s - min) / range) * chartH;
      return { x, y, score: s };
    });

    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="mt-2">
        {/* Grid lines */}
        {[min, min + range * 0.25, min + range * 0.5, min + range * 0.75, max].map((v, i) => {
          const y = padY + chartH - ((v - min) / range) * chartH;
          return (
            <g key={i}>
              <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="var(--border)" strokeWidth="0.5" />
              <text x={padX - 8} y={y + 4} textAnchor="end" fill="var(--muted)" fontSize="10">{Math.round(v)}</text>
            </g>
          );
        })}
        {/* Line */}
        <polyline
          points={points.map(p => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="var(--accent)" stroke="white" strokeWidth="1.5" />
        ))}
      </svg>
    );
  }

  const interests = student.interestProfile;

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] px-8 py-4 flex items-center gap-4">
        <button onClick={() => router.push("/guide")} className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">
          ← Back
        </button>
        <h1 className="text-lg font-semibold">{student.name}</h1>
      </header>

      <div className="max-w-4xl mx-auto p-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Reading Level</p>
            <p className="font-semibold">{levelLabel(student.readingLevel)}</p>
          </div>
          <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Total Sessions</p>
            <p className="font-semibold">{scoredSessions.length}</p>
          </div>
          <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Interests</p>
            <p className="text-sm text-[var(--muted)]">
              {interests?.primary_interests?.slice(0, 3).join(", ") || "Not assessed"}
            </p>
          </div>
        </div>

        {/* Trendline */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-3">Score Trend</h2>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            {renderTrendline()}
          </div>
        </div>

        {/* Sessions */}
        <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-3">Reading Sessions</h2>
        <div className="space-y-2">
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => setSelectedSession(selectedSession?.sessionId === s.sessionId ? null : s)}
              className="w-full text-left p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-[15px]">{s.articleTitle || "Untitled"}</h3>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    {s.articleTopic} · {new Date(s.startedAt).toLocaleDateString()}
                  </p>
                </div>
                {s.score !== null && (
                  <div className="text-right">
                    <span className="text-lg font-semibold">{s.score}</span>
                    <p className="text-xs" style={{ color: ratingColor(s.rating) }}>{s.rating}</p>
                  </div>
                )}
              </div>

              {selectedSession?.sessionId === s.sessionId && s.reportId && (
                <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
                  <div>
                    <p className="text-xs font-medium text-[var(--muted)] uppercase mb-1">What they understood</p>
                    <p className="text-sm">{s.understood}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[var(--muted)] uppercase mb-1">What they missed</p>
                    <p className="text-sm">{s.missed}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[var(--muted)] uppercase mb-1">Engagement</p>
                    <p className="text-sm">{s.engagementNote}</p>
                  </div>
                  {s.messages && (
                    <details className="mt-3" onClick={(e) => e.stopPropagation()}>
                      <summary className="text-xs text-[var(--accent)] cursor-pointer">View transcript</summary>
                      <div className="mt-2 space-y-2 text-sm">
                        {s.messages.map((m, i) => (
                          <div key={i} className={`${m.role === "user" ? "text-right" : ""}`}>
                            <span className="text-xs text-[var(--muted)]">{m.role === "user" ? "Student" : "AI"}</span>
                            <p className={`${m.role === "user" ? "text-[var(--accent)]" : ""}`}>{m.content}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </button>
          ))}
          {sessions.length === 0 && (
            <p className="text-[var(--muted)] text-sm">No sessions yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
