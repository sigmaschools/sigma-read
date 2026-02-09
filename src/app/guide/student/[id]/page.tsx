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

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    const studRes = await fetch("/api/students");
    const studs = await studRes.json();
    const s = studs.find((st: Student) => st.id === parseInt(id as string));
    if (!s) { router.push("/guide"); return; }
    setStudent(s);

    const [repRes, insightsRes] = await Promise.all([
      fetch(`/api/reports?studentId=${id}`),
      fetch(`/api/guide/student-insights?studentId=${id}`),
    ]);
    const reps = await repRes.json();
    setSessions(reps);
    const ins = await insightsRes.json();
    if (!ins.error) setInsights(ins);
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
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-blue-600";
    if (score >= 45) return "text-yellow-600";
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

  if (loading || !student) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const scoredSessions = sessions.filter((s) => s.score !== null);
  const interests = student.interestProfile;

  // SVG trendline
  function renderTrendline() {
    if (scoredSessions.length < 2) return <p className="text-sm text-[var(--muted)]">Not enough data yet.</p>;
    const scores = scoredSessions.map((s) => s.score!);
    const w = 600, h = 140, padX = 40, padY = 16;
    const chartW = w - padX * 2, chartH = h - padY * 2;
    const min = Math.max(0, Math.min(...scores) - 10);
    const max = Math.min(100, Math.max(...scores) + 10);
    const range = max - min || 1;
    const points = scores.map((s, i) => ({
      x: padX + (i / (scores.length - 1)) * chartW,
      y: padY + chartH - ((s - min) / range) * chartH,
      score: s,
    }));

    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
        {[min, min + range * 0.5, max].map((v, i) => {
          const y = padY + chartH - ((v - min) / range) * chartH;
          return (
            <g key={i}>
              <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="var(--border)" strokeWidth="0.5" />
              <text x={padX - 8} y={y + 4} textAnchor="end" fill="var(--muted)" fontSize="10">{Math.round(v)}</text>
            </g>
          );
        })}
        <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--accent)" stroke="white" strokeWidth="1.5" />
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
                <p className="text-xs font-medium text-green-600 mb-1">Understood</p>
                <p className="text-sm">{s.understood}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-red-500 mb-1">Missed</p>
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
                {s.messages.map((m, i) => (
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
      <header className="border-b border-[var(--border)] px-8 py-4 flex items-center gap-4">
        <button onClick={() => router.push("/guide")} className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">
          ← Back
        </button>
        <h1 className="text-lg font-semibold">{student.name}</h1>
      </header>

      <div className="max-w-4xl mx-auto p-8">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Grade</p>
            <p className="font-semibold">{student.gradeLevel ? `Grade ${student.gradeLevel}` : "—"}</p>
            {student.age && <p className="text-xs text-[var(--muted)]">Age {student.age}</p>}
          </div>
          <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Reading Level</p>
            <p className="font-semibold">{levelLabel(student.readingLevel)}</p>
          </div>
          <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Sessions</p>
            <p className="font-semibold">{scoredSessions.length}</p>
            {(() => {
              const target = (student as any).weeklySessionTarget || 5;
              const dayOfWeek = new Date().getDay() || 7;
              const expectedByNow = Math.floor((dayOfWeek / 7) * target);
              const thisWeek = sessions.filter(s => {
                if (!s.completedAt) return false;
                const d = new Date(s.completedAt);
                const now = new Date();
                const weekStart = new Date(now);
                weekStart.setDate(now.getDate() - now.getDay());
                weekStart.setHours(0, 0, 0, 0);
                return d >= weekStart;
              }).length;
              return thisWeek < expectedByNow && expectedByNow > 0 ? (
                <p className="text-xs text-amber-600 mt-1">Behind this week ({thisWeek}/{target})</p>
              ) : (
                <p className="text-xs text-[var(--muted)] mt-1">{thisWeek} this week</p>
              );
            })()}
          </div>
          <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Interests</p>
            <p className="text-sm text-[var(--muted)]">
              {interests?.primary_interests?.slice(0, 3).join(", ") || "Not set"}
            </p>
          </div>
        </div>

        {/* Insights Row */}
        {insights && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {/* Calibration */}
            {insights.calibration && (
              <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Self-Assessment</p>
                <p className="font-semibold text-sm">{insights.calibration.pattern}</p>
                <p className="text-xs text-[var(--muted)] mt-1">{insights.calibration.detail}</p>
              </div>
            )}

            {/* Time Insights */}
            {(insights.avgReadingTime !== null || insights.avgDiscussionTime !== null) && (
              <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Avg Session Time</p>
                <p className="text-sm">
                  {insights.avgReadingTime !== null && <span>📖 {insights.avgReadingTime < 60 ? `${insights.avgReadingTime}s` : `${Math.round(insights.avgReadingTime / 60 * 10) / 10}m`} reading</span>}
                  {insights.avgReadingTime !== null && insights.avgDiscussionTime !== null && <span className="text-[var(--muted)]"> · </span>}
                  {insights.avgDiscussionTime !== null && <span>💬 {Math.round(insights.avgDiscussionTime / 60 * 10) / 10}m discussing</span>}
                </p>
                {insights.avgReadingTime !== null && insights.avgReadingTime < 30 && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ Very fast reader — may be skimming</p>
                )}
              </div>
            )}

            {/* Engagement */}
            {insights.avgEngagement && (
              <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Engagement</p>
                <p className="font-semibold text-sm">{insights.avgEngagement}</p>
                {insights.conversationStyles && Object.keys(insights.conversationStyles).length > 0 && (
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Styles: {Object.entries(insights.conversationStyles).map(([k, v]) => `${k.toLowerCase().replace(/_/g, " ")} (${v})`).join(", ")}
                  </p>
                )}
              </div>
            )}

            {/* Level History */}
            {insights.levelHistory.length > 0 && (
              <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Level Changes</p>
                {insights.levelHistory.map((lh, i) => (
                  <p key={i} className="text-sm">
                    {lh.toLevel > lh.fromLevel ? "↑" : "↓"} L{lh.fromLevel} → L{lh.toLevel}
                    <span className="text-xs text-[var(--muted)] ml-1">{new Date(lh.changedAt).toLocaleDateString()}</span>
                  </p>
                ))}
              </div>
            )}

            {/* Article Preferences */}
            {(insights.likedArticles.length > 0 || insights.dislikedArticles.length > 0) && (
              <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Article Preferences</p>
                {insights.likedArticles.length > 0 && <p className="text-xs text-green-600">👍 {insights.likedArticles.slice(0, 3).join(", ")}</p>}
                {insights.dislikedArticles.length > 0 && <p className="text-xs text-red-500 mt-0.5">👎 {insights.dislikedArticles.slice(0, 3).join(", ")}</p>}
                {insights.showDifferentCount > 0 && <p className="text-xs text-[var(--muted)] mt-0.5">Swapped articles {insights.showDifferentCount}×</p>}
              </div>
            )}

            {/* Interest Suggestions */}
            {insights.interestSuggestions.length > 0 && (
              <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Student Requested</p>
                {insights.interestSuggestions.map((s, i) => (
                  <p key={i} className="text-sm">"{s}"</p>
                ))}
              </div>
            )}
          </div>
        )}

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
