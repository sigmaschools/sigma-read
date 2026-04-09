"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

interface ChatMessage {
  role: string;
  content: string;
  timestamp?: string;
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

function formatTimestamp(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// --- Chat Panel Component ---
function ChatPanel({ childName, studentId, chatOpen, onClose }: {
  childName: string;
  studentId: number;
  chatOpen: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load existing conversation when studentId changes
  useEffect(() => {
    setMessages([]);
    setConversationId(null);
    setInitialLoad(true);
    fetch(`/api/parent/chat?studentId=${studentId}`)
      .then(r => r.json())
      .then(data => {
        if (data.messages?.length) setMessages(data.messages);
        if (data.conversationId) setConversationId(data.conversationId);
        setInitialLoad(false);
      })
      .catch(() => setInitialLoad(false));
  }, [studentId]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/parent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, message: text }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages(prev => [...prev, { role: "assistant", content: data.message, timestamp: new Date().toISOString() }]);
      }
      if (data.conversationId) setConversationId(data.conversationId);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again.", timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  }

  const chatContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
        <p className="text-sm text-[var(--muted)]">Ask about {childName}&apos;s reading</p>
        {/* Close button only on mobile overlay */}
        <button onClick={onClose} className="md:hidden text-sm text-[var(--muted)] hover:text-[var(--fg)]">
          Close
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {initialLoad ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--muted)]">Ask anything about {childName}&apos;s reading progress, scores, or interests.</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[85%]">
                <div className={`px-3.5 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-[var(--accent)] text-white rounded-br-md"
                    : "bg-[var(--surface)] text-[var(--fg)] rounded-bl-md"
                }`}>
                  {m.content}
                </div>
                <p className={`text-[11px] text-[var(--muted)] mt-1 ${m.role === "user" ? "text-right" : "text-left"}`}>
                  {formatTimestamp(m.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[var(--surface)] px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3.5 py-2 text-sm border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)] transition bg-white"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-xl disabled:opacity-40 transition hover:opacity-90"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: inline panel */}
      <div className="hidden md:flex flex-col w-[40%] border-l border-[var(--border)] bg-white h-[calc(100vh-49px)] sticky top-[49px]">
        {chatContent}
      </div>

      {/* Mobile: full-screen overlay */}
      {chatOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-white flex flex-col">
          {chatContent}
        </div>
      )}
    </>
  );
}

// --- Main Page ---
export default function ParentPortalPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="text-[var(--muted)]">Loading…</div></div>}>
      <ParentPortal />
    </Suspense>
  );
}

function ParentPortal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [parentName, setParentName] = useState("");
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [sessions, setSessions] = useState<SessionReport[]>([]);
  const [insights, setInsights] = useState<StudentInsights | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [childLoading, setChildLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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

      // Auto-select from query param or if single child
      const childParam = searchParams.get("child");
      const targetChild = childParam
        ? kids.find((k: Child) => k.id === Number(childParam))
        : null;
      if (targetChild) {
        await loadChild(targetChild);
      } else if (kids.length === 1) {
        await loadChild(kids[0]);
      }
      setLoading(false);
    }
    init();
  }, []);

  async function loadChild(child: Child) {
    setSelectedChild(child);
    setSelectedSession(null);
    setChatOpen(false);
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
        {selectedChild && hasMultipleChildren && !selectedSession && (
          <button
            onClick={() => { setSelectedChild(null); setSessions([]); setInsights(null); setSelectedSession(null); setChatOpen(false); }}
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

  // Student detail view with chat panel
  if (selectedChild) {
    const scoredSessions = sessions.filter((s) => s.score !== null);
    const chartScores = [...scoredSessions].reverse().map((s) => s.score!);
    const interests = selectedChild.interestProfile as { interests?: string[] } | null;

    return (
      <div className="min-h-screen">
        {header}
        <div className="flex">
          {/* Left: student detail */}
          <main className="flex-1 md:w-[60%] px-6 py-8">
            <div className="max-w-3xl mx-auto md:mx-0">
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
            </div>
          </main>

          {/* Right: chat panel (desktop) */}
          <ChatPanel
            childName={selectedChild.name}
            studentId={selectedChild.id}
            chatOpen={chatOpen}
            onClose={() => setChatOpen(false)}
          />
        </div>

        {/* Mobile FAB */}
        {!chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-[var(--accent)] text-white rounded-full shadow-lg flex items-center justify-center z-40 hover:opacity-90 transition"
            aria-label="Open chat"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}
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
