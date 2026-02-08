"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Article {
  id: number;
  title: string;
  topic: string;
  bodyText: string;
  estimatedReadTime: number;
  read: boolean;
  category: string | null;
  createdAt: string;
}

function categoryLabel(article: Article) {
  if (article.category === "news") return "News";
  if (article.category === "interest") return "For You";
  return "Explore";
}

function articleSummary(text: string, title: string): string {
  const clean = text.replace(/^#+\s.*\n*/gm, "").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length === 0) return clean.slice(0, 180);

  const start = sentences.length > 2 ? 1 : 0;
  let result = "";
  for (let i = start; i < sentences.length; i++) {
    const candidate = result + sentences[i].trim() + " ";
    if (result.length > 0 && candidate.length > 180) break;
    result = candidate;
    if (result.length >= 140) break;
  }

  if (result.trim().length < 80 && start === 1) {
    result = "";
    for (let i = 0; i < sentences.length; i++) {
      const candidate = result + sentences[i].trim() + " ";
      if (result.length > 0 && candidate.length > 180) break;
      result = candidate;
      if (result.length >= 140) break;
    }
  }

  return result.trim() || clean.slice(0, 180);
}

function badgeClass(article: Article) {
  if (article.category === "news") return "bg-[#EEF2FF] text-[#4F6BED]";
  if (article.category === "interest") return "bg-[#F3E8FF] text-[#7C3AED]";
  return "bg-[#ECFDF5] text-[#059669]";
}

export default function StudentHome() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [userName, setUserName] = useState("");
  const [completedToday, setCompletedToday] = useState<{title: string, id: number}[]>([]);
  const dailyGoal = 3;
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const meRes = await fetch("/api/auth/me");
    const me = await meRes.json();
    if (me.error) { router.push("/login"); return; }
    if (me.role !== "student") { router.push("/login"); return; }
    if (!me.onboardingComplete) { router.push("/student/onboarding"); return; }
    setUserName(me.name);

    const progRes = await fetch("/api/student/daily-progress");
    const prog = await progRes.json();
    if (!prog.error) setCompletedToday(prog.completedToday || []);

    const artRes = await fetch("/api/articles");
    let arts = await artRes.json();
    const unread = arts.filter((a: Article) => !a.read);

    if (unread.length < 3) {
      await fetch("/api/articles/serve-cached", { method: "POST" });
      const refreshRes = await fetch("/api/articles");
      arts = await refreshRes.json();
    }

    setArticles(arts);
    setLoading(false);
  }

  const [noMore, setNoMore] = useState(false);

  async function getNewArticles() {
    setGenerating(true);
    setNoMore(false);
    const res = await fetch("/api/articles/serve-cached", { method: "POST" });
    const data = await res.json();
    const artRes = await fetch("/api/articles");
    const newArts = await artRes.json();
    setArticles(newArts);
    if (!data.count || data.count === 0) {
      setNoMore(true);
      setTimeout(() => setNoMore(false), 5000);
    }
    setGenerating(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const unread = articles.filter((a) => !a.read);
  const visible = unread.slice(-3);
  const readArticles = articles.filter((a) => a.read);
  const totalRead = readArticles.length;

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
      <header className="sticky top-0 z-10 bg-[var(--bg)]/85 backdrop-blur-xl border-b border-[var(--border)] px-6 py-3.5 flex items-center justify-between">
        <span className="text-base font-semibold tracking-tight">SigmaRead</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--muted)] font-medium">{userName}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-[var(--muted)] px-2.5 py-1 rounded-md hover:bg-[var(--border)] hover:text-[var(--danger)] transition"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-[640px] mx-auto px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Hey {userName} 👋</h1>
          {totalRead === 0 && (
            <p className="text-[15px] text-[var(--muted)] mt-1">Choose an article to start reading</p>
          )}
        </div>

        {/* Section label */}
        <div className="mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Choose an Article</h2>
        </div>

        {/* Article cards */}
        <div className="flex flex-col gap-3 mb-6">
          {visible.map((article) => (
            <Link
              key={article.id}
              href={`/student/read/${article.id}`}
              className="block bg-[var(--surface)] rounded-xl p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-px transition-all min-h-[110px]"
            >
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${badgeClass(article)}`}>
                  {categoryLabel(article)}
                </span>
                <span className="text-xs text-[var(--muted)]">{article.estimatedReadTime} min</span>
              </div>
              <h3 className="text-base font-semibold leading-snug line-clamp-1 mb-1.5">{article.title}</h3>
              <p className="text-sm text-[var(--muted)] leading-relaxed line-clamp-2">{articleSummary(article.bodyText, article.title)}</p>
            </Link>
          ))}
        </div>

        {/* Show different articles */}
        <div className="mb-10">
          {generating ? (
            <div className="text-center">
              <span className="text-sm text-[var(--muted)] inline-flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                Loading new articles…
              </span>
            </div>
          ) : (
            <button
              onClick={getNewArticles}
              className="w-full py-3.5 border-[1.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-sm font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
            >
              Show me different articles
            </button>
          )}
          {noMore && (
            <p className="text-sm text-[var(--muted)] text-center mt-3">You&apos;ve seen all available articles! Check back later for new ones.</p>
          )}
        </div>

        {/* Completed today */}
        {completedToday.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)] mb-4">
              Today&apos;s Reading
            </h2>
            <div className="space-y-2">
              {completedToday.map((completed, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-3 border-b border-[var(--border)] last:border-b-0"
                >
                  <div className="w-[22px] h-[22px] rounded-full bg-[var(--success)] flex items-center justify-center flex-shrink-0">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M10 3L4.5 8.5 2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-sm font-medium">{completed.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
