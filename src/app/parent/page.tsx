"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ScoreZoneChart from "@/components/ScoreZoneChart";

interface Child {
  id: number;
  name: string;
  readingLevel: number | null;
  gradeLevel: number | null;
  age: number | null;
  interestProfile: Record<string, unknown> | null;
  onboardingComplete: boolean;
}

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

export default function ParentPortal() {
  const router = useRouter();
  const [parentName, setParentName] = useState("");
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [sessions, setSessions] = useState<SessionReport[]>([]);
  const [insights, setInsights] = useState<StudentInsights | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [childLoading, setChildLoading] = useState(false);

  useEffect(() => {
    async function init() {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      if (me.role !== "parent") { router.push("/login"); return; }
      setParentName(me.name || "Parent");

      const childRes = await fetch("/api/parent/children");
      if (!childRes.ok) { setLoading(false); return; }
      const kids: Child[] = await childRes.json();
      setChildren(kids);

      // Auto-select if single child
      if (kids.length === 1) {
        await loadChild(kids[0]);
      }
      setLoading(false);
    }
    init();
  }, []);

  async function loadChild(child: Child) {
    setSelectedChild(child);
    setSelectedSession(null);
    setChildLoading(true);
    const [repRes, insRes] = await Promise.all([
      fetch(`/api/reports?studentId=${child.id}`),
      fetch(`/api/guide/student-insights?studentId=${child.id}`),
    ]);
    const reps = await repRes.json();
    if (reps.completed) setSessions(reps.completed);
    else if (Array.isArray(reps)) setSessions(reps);
    const ins = await insRes.json();
    if (!ins.error) setInsights(ins);
    else setInsights(null);
    setChildLoading(false);
  }

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasMultipleChildren = children.length > 1;

  // Header
  const header = (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-[var(--border)] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {selectedChild && hasMultipleChildren && (
          <button
            onClick={() => { setSelectedChild(null); setSessions([]); setInsights(null); setSelectedSession(null); }}
            className="text-sm text-[var(--muted)] hover:text-[var(--fg)]"
          >
            ←
          </button>
        )}
        {selectedSession && (
          <button
            onClick={() => setSelectedSession(null)}
            className="text-sm text-[var(--muted)] hover:text-[var(--fg)]"
          >
            ←
          </button>
        )}
        <span className="text-sm font-semibold tracking-tight">SigmaRead</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">Parent</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-[var(--muted)]">{parentName}</span>
        <button onClick={handleSignOut} className="text-xs text-[var(--muted)] hover:text-[var(--danger)]">Sign out</button>
      </div>
    </header>
  );

  // Session detail view
  if (selectedSession && selectedChild) {
    const s = selectedSession;
    return (
      <div className="min-h-screen">
        {header}
        <main className="max-w-3xl mx-auto px-6 py-8">
          <h1 className="text-xl font-semibold mb-1">{s.articleTitle}</h1>
          <p className="text-sm text-[var(--muted)] mb-2">
            {s.articleTopic} · {s.completedAt ? new Date(s.completedAt).toLocaleDateString() : "In progress"}
            {s.articleLiked === true && " · 👍 Liked"}
            {s.articleLiked === false && " · 👎 Disliked"}
            {s.conversationStyle && ` · Style: ${s.conversationStyle.toLowerCase().replace(/_/g, " ")}`}
          </p>

          {/* Time + Quality insights */}
          <div className="flex flex-wrap gap-4 text-xs text-[var(--muted)] mb-6">
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
                <p className={`text-2xl font-semibold ${scoreColor(s.score)}`}>{s.score}</p>
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
        </main>
      </div>
    );
  }

  // Student detail view
  if (selectedChild) {
    const scoredSessions = sessions.filter((s) => s.score !== null);
    const chartScores = [...scoredSessions].reverse().map((s) => s.score!);
    const interests = selectedChild.interestProfile as { interests?: string[] } | null;

    return (
      <div className="min-h-screen">
        {header}
        <main className="max-w-3xl mx-auto px-6 py-8">
          {childLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-semibold">{selectedChild.name}</h1>
                <p className="text-sm text-[var(--muted)]">
                  {selectedChild.gradeLevel ? `Grade ${selectedChild.gradeLevel}` : ""}{selectedChild.gradeLevel && selectedChild.readingLevel ? " · " : ""}{selectedChild.readingLevel ? levelLabel(selectedChild.readingLevel) : ""}
                </p>
              </div>

              {/* Interests */}
              {interests?.interests && interests.interests.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-2">Interests</h2>
                  <div className="flex flex-wrap gap-2">
                    {interests.interests.map((t: string) => (
                      <span key={t} className="px-3 py-1 bg-[var(--accent)]/10 text-[var(--accent)] text-sm rounded-full font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Score Trend */}
              {chartScores.length >= 2 && (
                <div className="mb-6">
                  <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-2">Score Trend</h2>
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 overflow-hidden">
                    <ScoreZoneChart scores={chartScores} />
                  </div>
                </div>
              )}

              {/* Sessions list */}
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
                          <span className={`text-lg font-semibold ${scoreColor(s.score)}`}>{s.score}</span>
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
            </>
          )}
        </main>
      </div>
    );
  }

  // Child selector (multiple children) or empty state
  return (
    <div className="min-h-screen">
      {header}
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-6">Your Children</h1>
        {children.length === 0 ? (
          <p className="text-[var(--muted)] text-sm">No children linked to your account yet.</p>
        ) : (
          <div className="space-y-3">
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => loadChild(child)}
                className="w-full text-left p-5 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] transition"
              >
                <h2 className="font-semibold text-[16px]">{child.name}</h2>
                <p className="text-sm text-[var(--muted)] mt-1">
                  {child.gradeLevel ? `Grade ${child.gradeLevel}` : ""}{child.gradeLevel && child.readingLevel ? " · " : ""}{child.readingLevel ? levelLabel(child.readingLevel) : ""}
                  {child.onboardingComplete ? "" : " · Onboarding in progress"}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
