"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

interface SessionReport {
  sessionId: number;
  articleId: number;
  startedAt: string;
  completedAt: string | null;
  readingCompletedAt: string | null;
  articleTitle: string;
  articleTopic: string;
  articleLiked: boolean | null;
  reportId: number | null;
  score: number | null;
  rating: string | null;
  understood: string | null;
  missed: string | null;
  engagementNote: string | null;
  selfAssessment: string | null;
  conversationId: number | null;
  conversationStyle: string | null;
  messages: { role: string; content: string; timestamp?: string }[] | null;
  aiAvgWords: number | null;
  studentAvgWords: number | null;
  redirectCount: number | null;
  exchangeCount: number | null;
}

interface Student {
  id: number;
  name: string;
  readingLevel: number | null;
  gradeLevel: number | null;
  age: number | null;
  interestProfile: any;
  onboardingComplete: boolean;
}

interface StudentInsights {
  calibration: { pattern: string; detail: string } | null;
  avgReadingTime: number | null;
  avgDiscussionTime: number | null;
  likedArticles: string[];
  dislikedArticles: string[];
  interestSuggestions: string[];
  favorites: string[];
  showDifferentCount: number;
  levelHistory: { fromLevel: number; toLevel: number; changedAt: string }[];
  conversationStyles: Record<string, number>;
  avgEngagement: string | null;
}

export default function StudentDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [sessions, setSessions] = useState<SessionReport[]>([]);
  const [insights, setInsights] = useState<StudentInsights | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  function backPath() {
    return role === "admin" ? "/admin/students" : "/guide";
  }

  async function loadData() {
    try {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      if (me.role !== "guide" && me.role !== "admin") { router.push("/login"); return; }
      setRole(me.role);

      const studRes = await fetch("/api/students");
      if (!studRes.ok) { setError("Could not load student data."); setLoading(false); return; }
      const studs = await studRes.json();
      const s = Array.isArray(studs) && studs.find((st: Student) => st.id === parseInt(id as string));
      if (!s) { setError("Student not found."); setLoading(false); return; }
      setStudent(s);

      const [repRes, insightsRes] = await Promise.all([
        fetch(`/api/reports?studentId=${id}`),
        fetch(`/api/guide/student-insights?studentId=${id}`),
      ]);
      const reps = await repRes.json();
      // Use only completed sessions for display and scoring
      if (reps.completed) setSessions(reps.completed);
      else if (Array.isArray(reps)) setSessions(reps); // backward compat
      const ins = await insightsRes.json();
      if (!ins.error) setInsights(ins);
    } catch {
      setError("Something went wrong.");
    }
    setLoading(false);
  }

  const levelLabel = (level: number | null) => {
    if (!level) return "Not assessed";
    const labels: Record<number, string> = {
      1: "L1 (Gr 2-3)", 2: "L2 (Gr 3-4)", 3: "L3 (Gr 5-6)",
      4: "L4 (Gr 7)", 5: "L5 (Gr 8)", 6: "L6 (Gr 8+)",
    };
    return labels[level] || `L${level}`;
  };

  const scoreColor = (score: number | null) => {
    if (score === null) return "text-[var(--muted)]";
    if (score >= 85) return "text-blue-500";
    if (score >= 70) return "text-green-600";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
  };

  const selfAssessLabel = (sa: string | null) => {
    if (!sa) return null;
    const labels: Record<string, string> = {
      really_well: "Really well",
      pretty_well: "Pretty well",
      not_sure: "Not sure",
      lost: "I was lost",
    };
    return labels[sa] || sa;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <p className="text-[var(--muted)]">{error || "Student not found."}</p>
        <button onClick={() => router.push(backPath())} className="text-sm text-[var(--accent)] hover:underline">
          ← Go back
        </button>
      </div>
    );
  }

  const scoredSessions = sessions.filter((s) => s.score !== null);
  const interests = student.interestProfile;

  // Score zone chart with color-coded difficulty bands and SMA
  function renderTrendline() {
    if (scoredSessions.length < 2) return null;
    const scores = [...scoredSessions].reverse().map((s) => s.score!);
    const w = 600, h = 250, padL = 36, padR = 100, padY = 16;
    const chartW = w - padL - padR, chartH = h - padY * 2;

    const toX = (i: number) => padL + (i / (scores.length - 1)) * chartW;
    const toY = (v: number) => padY + chartH - (v / 100) * chartH;

    const dotColor = (s: number) => {
      if (s >= 85) return "#3b82f6";
      if (s >= 70) return "#22c55e";
      if (s >= 60) return "#f59e0b";
      return "#ef4444";
    };

    const zones = [
      { y0: 0, y1: 59, color: "#ef4444", label: "Struggling" },
      { y0: 60, y1: 69, color: "#f59e0b", label: "Needs attention" },
      { y0: 70, y1: 84, color: "#22c55e", label: "Growth zone", opacity: 0.10 },
      { y0: 85, y1: 100, color: "#3b82f6", label: "Ready to advance" },
    ];

    // 5-session simple moving average
    const smaPoints: { x: number; y: number }[] = [];
    for (let i = 0; i < scores.length; i++) {
      if (i < 4) continue;
      const avg = (scores[i] + scores[i - 1] + scores[i - 2] + scores[i - 3] + scores[i - 4]) / 5;
      smaPoints.push({ x: toX(i), y: toY(avg) });
    }

    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
        {/* Zone bands */}
        {zones.map((z) => (
          <rect
            key={z.label}
            x={padL}
            y={toY(z.y1)}
            width={chartW}
            height={toY(z.y0) - toY(z.y1)}
            fill={z.color}
            opacity={z.opacity ?? 0.08}
          />
        ))}

        {/* Zone labels (right side) */}
        {zones.map((z) => (
          <text
            key={`label-${z.label}`}
            x={padL + chartW + 8}
            y={(toY(z.y1) + toY(z.y0)) / 2 + 4}
            fill="var(--muted)"
            fontSize="9"
          >
            {z.label}
          </text>
        ))}

        {/* Y axis ticks */}
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <g key={v}>
            <line x1={padL} y1={toY(v)} x2={padL + chartW} y2={toY(v)} stroke="var(--border)" strokeWidth="0.5" />
            <text x={padL - 8} y={toY(v) + 4} textAnchor="end" fill="var(--muted)" fontSize="10">{v}</text>
          </g>
        ))}

        {/* Connecting line between raw dots */}
        <polyline
          points={scores.map((s, i) => `${toX(i)},${toY(s)}`).join(" ")}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="1"
          strokeOpacity="0.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* SMA line */}
        {smaPoints.length >= 2 && (
          <polyline
            points={smaPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#22c55e"
            strokeWidth="2.5"
            strokeOpacity="0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Raw score dots */}
        {scores.map((s, i) => (
          <circle key={i} cx={toX(i)} cy={toY(s)} r="3.5" fill={dotColor(s)} stroke="white" strokeWidth="1.5" />
        ))}
      </svg>
    );
  }

  // Session detail view
  if (selectedSession) {
    const s = selectedSession;
    return (
      <div className="min-h-screen">
        <header className="border-b border-[var(--border)] px-8 py-4 flex items-center gap-4">
          <button onClick={() => setSelectedSession(null)} className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">
            ← Back to {student.name}
          </button>
        </header>

        <div className="max-w-3xl mx-auto p-8">
          {/* Article info */}
          <h1 className="text-xl font-semibold mb-1">{s.articleTitle}</h1>
          <p className="text-sm text-[var(--muted)] mb-2">
            {s.articleTopic} · {s.completedAt ? new Date(s.completedAt).toLocaleDateString() : "In progress"}
            {s.articleLiked === true && " · 👍 Liked"}
            {s.articleLiked === false && " · 👎 Disliked"}
            {s.conversationStyle && ` · Style: ${s.conversationStyle.toLowerCase().replace(/_/g, " ")}`}
          </p>
          {/* Time + Quality insights */}
          <div className="flex gap-4 text-xs text-[var(--muted)] mb-6">
            {s.readingCompletedAt && s.startedAt && (
              <span>📖 Read: {Math.round((new Date(s.readingCompletedAt).getTime() - new Date(s.startedAt).getTime()) / 1000 / 60 * 10) / 10}m</span>
            )}
            {s.readingCompletedAt && s.completedAt && (
              <span>💬 Discussed: {Math.round((new Date(s.completedAt).getTime() - new Date(s.readingCompletedAt).getTime()) / 1000 / 60 * 10) / 10}m</span>
            )}
            {s.aiAvgWords !== null && <span>AI avg: {s.aiAvgWords}w</span>}
            {s.studentAvgWords !== null && <span>Student avg: {s.studentAvgWords}w</span>}
            {s.redirectCount !== null && s.redirectCount > 0 && <span className="text-amber-600">⟳ {s.redirectCount} redirect{s.redirectCount > 1 ? "s" : ""}</span>}
          </div>

          {/* Score + Self Assessment */}
          {s.score !== null && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Score</p>
                <p className={`text-2xl font-semibold ${scoreColor(s.score)}`}>
                  {s.score}
                </p>
              </div>
              <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Student Self-Assessment</p>
                <p className="text-lg font-semibold">{selfAssessLabel(s.selfAssessment) || "—"}</p>
                {s.selfAssessment && s.score !== null && (
                  <p className="text-xs text-[var(--muted)] mt-1">
                    {s.selfAssessment === "really_well" && s.score < 60 && "⚠️ Overconfident — scored below 60"}
                    {s.selfAssessment === "lost" && s.score >= 70 && "📈 Underconfident — scored above 70"}
                    {s.selfAssessment === "really_well" && s.score >= 80 && "✓ Accurate self-assessment"}
                    {s.selfAssessment === "lost" && s.score < 50 && "✓ Accurate self-assessment"}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Comprehension Report */}
          {s.reportId && (
            <div className="mb-6 p-5 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-3">
              <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider">Comprehension Report</h2>
              <div>
                <p className="text-xs font-medium text-green-600 mb-1">Comprehension</p>
                <p className="text-sm">{s.understood}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-blue-500 mb-1">Depth</p>
                <p className="text-sm">{s.missed}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--muted)] mb-1">Engagement</p>
                <p className="text-sm">{s.engagementNote}</p>
              </div>
            </div>
          )}

          {/* Chat-style Transcript */}
          {s.messages && s.messages.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-3">Conversation</h2>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
                {s.messages.filter((m) => m.content !== "I just finished reading the article.").map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed ${
                      m.role === "user"
                        ? "bg-[var(--accent)] text-white rounded-br-md"
                        : "bg-gray-100 text-[var(--fg)] rounded-bl-md"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main student overview
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] px-8 py-4">
        <button onClick={() => router.push(backPath())} className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">
          ← Back
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-8 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">{student.name}</h1>
          <p className="text-sm text-[var(--muted)]">
            {student.gradeLevel ? `Grade ${student.gradeLevel}` : ""}{student.gradeLevel && student.readingLevel ? " · " : ""}{student.readingLevel ? levelLabel(student.readingLevel) : ""}
          </p>
        </div>

        {/* Interests */}
        {interests?.interests?.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-2">Interests</h2>
            <div className="flex flex-wrap gap-2">
              {interests.interests.map((t: string) => (
                <span key={t} className="px-3 py-1 bg-[var(--accent)]/10 text-[var(--accent)] text-sm rounded-full font-medium">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Score Trend — only when meaningful variation exists */}
        {renderTrendline() && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-2">Score Trend</h2>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 overflow-hidden">
              {renderTrendline()}
              <p className="text-xs text-[var(--muted)] italic mt-2">
                Growth zone (70–84) means the content is the right challenge — hard enough to build skills, not so hard it causes frustration. SigmaRead adjusts difficulty automatically.
              </p>
            </div>
          </div>
        )}

        {/* Sessions */}
        <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-3">Reading Sessions</h2>
        <div className="space-y-2">
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => setSelectedSession(s)}
              className="w-full text-left p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-[15px]">{s.articleTitle || "Untitled"}</h3>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    {s.articleTopic} · {s.completedAt ? new Date(s.completedAt).toLocaleDateString() : "In progress"}
                    {s.articleLiked === true && " · 👍"}
                    {s.articleLiked === false && " · 👎"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {s.score !== null && (
                    <div className="text-right">
                      <span className={`text-lg font-semibold ${scoreColor(s.score)}`}>{s.score}</span>
                    </div>
                  )}
                  <span className="text-[var(--muted)]">→</span>
                </div>
              </div>
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
