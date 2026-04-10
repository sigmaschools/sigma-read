"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import ScoreZoneChart from "@/components/ScoreZoneChart";

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

interface ParentFeedbackItem {
  id: number;
  category: string;
  sentiment: string;
  summary: string;
  parentName: string;
  createdAt: string;
  acknowledgedAt: string | null;
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
  parentFeedback: ParentFeedbackItem[];
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
  const [activeTab, setActiveTab] = useState<"overview" | "sessions">("overview");

  const styleTooltips: Record<string, string> = {
    "overview_then_depth": "Starts with big picture, then digs into specifics",
    "surprise": "Explores what surprised or was new to the student",
    "opinion": "Asks for the student's take on claims in the article",
    "perspective_shift": "Puts the student in someone's shoes from the article",
    "detail_to_big_picture": "Starts with a specific detail, then zooms out",
    "creative": "Sparks curiosity with creative/hypothetical questions",
  };

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

  const sentimentDot = (sentiment: string) => {
    switch (sentiment) {
      case "positive": return { dot: "\u{1F7E2}", color: "#22c55e" };
      case "neutral": return { dot: "\u26AA", color: "#6c757d" };
      case "negative": return { dot: "\u{1F7E1}", color: "#f59e0b" };
      case "concern": return { dot: "\u{1F534}", color: "#ef4444" };
      default: return { dot: "\u26AA", color: "#6c757d" };
    }
  };

  async function acknowledgeFeedback(feedbackId: number) {
    await fetch("/api/guide/acknowledge-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedbackId }),
    });
    // Update local state
    if (insights) {
      setInsights({
        ...insights,
        parentFeedback: insights.parentFeedback.map(f =>
          f.id === feedbackId ? { ...f, acknowledgedAt: new Date().toISOString() } : f
        ),
      });
    }
  }

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

  const chartScores = [...scoredSessions].reverse().map((s) => s.score!);

  // Session detail view
  if (selectedSession) {
    const s = selectedSession;
    return (
      <div className="min-h-screen">
        <header className="border-b border-[var(--border)] px-8 py-4 flex items-center gap-4">
          <button onClick={() => { setActiveTab("sessions"); setSelectedSession(null); }} className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">
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
            {s.conversationStyle && (
              <span
                title={styleTooltips[s.conversationStyle.toLowerCase()] || s.conversationStyle}
                className="cursor-help"
              >
                {` · Style: ${s.conversationStyle.toLowerCase().replace(/_/g, " ")}`}
              </span>
            )}
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

  // Main student overview (tabbed)
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] px-8 py-4">
        <button onClick={() => router.push(backPath())} className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">
          ← Back
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-8 py-6">
        <div className="mb-2">
          <h1 className="text-xl font-semibold">{student.name}</h1>
          <p className="text-sm text-[var(--muted)]">
            {student.gradeLevel ? `Grade ${student.gradeLevel}` : ""}{student.gradeLevel && student.readingLevel ? " · " : ""}{student.readingLevel ? levelLabel(student.readingLevel) : ""}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] mb-6">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "overview"
                ? "text-[var(--accent)] border-[var(--accent)]"
                : "text-[var(--muted)] border-transparent hover:text-[var(--fg)]"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "sessions"
                ? "text-[var(--accent)] border-[var(--accent)]"
                : "text-[var(--muted)] border-transparent hover:text-[var(--fg)]"
            }`}
          >
            Sessions <span className="text-[var(--muted)] font-normal">({sessions.length})</span>
          </button>
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <>
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
            {chartScores.length >= 2 && (
              <div className="mb-6">
                <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-2">Score Trend</h2>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 overflow-hidden">
                  <ScoreZoneChart scores={chartScores} />
                </div>
              </div>
            )}

            {/* Insights Grid */}
            {insights && (
              <div className="mb-6">
                <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-2">Insights</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                    <p className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium mb-1">Calibration</p>
                    <p className="text-[15px] font-semibold">{insights.calibration?.pattern ?? "—"}</p>
                    {insights.calibration?.detail && (
                      <p className="text-xs text-[var(--muted)] mt-1">{insights.calibration.detail}</p>
                    )}
                  </div>
                  <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                    <p className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium mb-1">Engagement</p>
                    <p className="text-[15px] font-semibold">{insights.avgEngagement ?? "—"}</p>
                  </div>
                  <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                    <p className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium mb-1">Avg Reading Time</p>
                    <p className="text-[15px] font-semibold">
                      {insights.avgReadingTime != null ? `${(insights.avgReadingTime / 60).toFixed(1)} min` : "—"}
                    </p>
                  </div>
                  <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                    <p className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium mb-1">Avg Discussion Time</p>
                    <p className="text-[15px] font-semibold">
                      {insights.avgDiscussionTime != null ? `${(insights.avgDiscussionTime / 60).toFixed(1)} min` : "—"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Parent Feedback */}
            {insights && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider">Parent Feedback</h2>
                  {insights.parentFeedback.filter(f => !f.acknowledgedAt).length > 0 && (
                    <span style={{
                      backgroundColor: "#ef4444",
                      color: "white",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      padding: "1px 7px",
                      borderRadius: "9999px",
                    }}>
                      {insights.parentFeedback.filter(f => !f.acknowledgedAt).length}
                    </span>
                  )}
                </div>
                {insights.parentFeedback.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">No parent feedback yet</p>
                ) : (
                  <div className="space-y-2">
                    {insights.parentFeedback.map(f => {
                      const { dot } = sentimentDot(f.sentiment);
                      const ago = (() => {
                        const days = Math.floor((Date.now() - new Date(f.createdAt).getTime()) / 86400000);
                        if (days === 0) return "today";
                        if (days === 1) return "1 day ago";
                        return `${days} days ago`;
                      })();
                      return (
                        <div key={f.id} className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span>{dot}</span>
                            <span className="text-xs font-medium text-[var(--fg)]">{f.category.replace(/_/g, " ")}</span>
                            <span className="text-xs text-[var(--muted)]">from {f.parentName}</span>
                            <span className="text-xs text-[var(--muted)]">&middot; {ago}</span>
                          </div>
                          <p className="text-sm text-[var(--fg)] leading-relaxed mb-2">&ldquo;{f.summary}&rdquo;</p>
                          <div className="flex justify-end">
                            {f.acknowledgedAt ? (
                              <span className="text-xs text-[var(--muted)]">&check; Acknowledged</span>
                            ) : (
                              <button
                                onClick={() => acknowledgeFeedback(f.id)}
                                className="text-xs font-medium text-[var(--accent)] hover:underline"
                              >
                                Acknowledge
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Sessions Tab */}
        {activeTab === "sessions" && (
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
        )}
      </div>
    </div>
  );
}
