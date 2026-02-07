"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface SessionData {
  articleId: number;
  title: string;
  topic: string;
  category: string | null;
  completedAt: string;
  score: number | null;
  rating: string | null;
}

export default function StudentSessions() {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/articles/sessions").then((r) => r.json()).then((data) => {
      setSessions(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  function scoreColor(score: number | null) {
    if (!score) return "text-[var(--muted)]";
    if (score >= 85) return "text-green-600";
    if (score >= 70) return "text-blue-600";
    if (score >= 55) return "text-yellow-600";
    return "text-red-500";
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-[var(--border)] p-5 flex flex-col">
        <h1 className="text-lg font-semibold tracking-tight mb-8">SigmaRead</h1>
        <nav className="space-y-1">
          <Link href="/student" className="block px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--fg)] rounded-lg hover:bg-[var(--surface-hover)] transition">
            Home
          </Link>
          <a className="block px-3 py-2 text-sm font-medium bg-[var(--surface-hover)] rounded-lg">My Sessions</a>
        </nav>
      </aside>

      <main className="flex-1 p-8 max-w-3xl">
        <h2 className="text-xl font-semibold mb-6">Past Sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-[var(--muted)]">No completed sessions yet. Read an article and talk about it to see your sessions here.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s, i) => (
              <Link
                key={i}
                href={`/student/read/${s.articleId}`}
                className="flex items-center justify-between p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {s.category === "news" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded flex-shrink-0">News</span>
                    )}
                    <h3 className="font-medium text-[15px] truncate">{s.title}</h3>
                  </div>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    {s.topic} · {new Date(s.completedAt).toLocaleDateString()}
                  </p>
                </div>
                {s.score !== null && (
                  <div className="flex-shrink-0 ml-4 text-right">
                    <span className={`text-lg font-semibold ${scoreColor(s.score)}`}>{s.score}</span>
                    <p className="text-xs text-[var(--muted)]">{s.rating}</p>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
