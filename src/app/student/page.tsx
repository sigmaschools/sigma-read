"use client";

import { useState, useEffect, useRef } from "react";
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

  // Always skip sentence 1 — it almost always restates the title.
  // Start from sentence 2 (index 1) and grab enough to fill 140-180 chars.
  const start = sentences.length > 2 ? 1 : 0;
  let result = "";
  for (let i = start; i < sentences.length; i++) {
    const candidate = result + sentences[i].trim() + " ";
    if (result.length > 0 && candidate.length > 180) break;
    result = candidate;
    if (result.length >= 140) break;
  }

  // If we didn't get enough from skipping, fall back to including sentence 1
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

function categoryStyle(article: Article) {
  if (article.category === "news") return "text-blue-600";
  if (article.category === "interest") return "text-violet-600";
  return "text-emerald-600";
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

    // If fewer than 3 unread, auto-serve from cache
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

  // Always show the 3 most recent unread articles
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

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // Get initials for avatar
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 bg-white/95 backdrop-blur border-b border-[var(--border)] px-6 py-3 flex items-center justify-between z-10">
        <h1 className="text-lg font-semibold tracking-tight">SigmaRead</h1>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white text-xs font-semibold flex items-center justify-center">
              {initials}
            </div>
            <span className="text-sm text-[var(--fg)]">{userName}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-[var(--muted)] transition-transform ${menuOpen ? "rotate-180" : ""}`}>
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-[var(--border)] rounded-xl shadow-lg overflow-hidden z-50 animate-fade-in">
              <Link
                href="/student/onboarding?demo=true"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--surface-hover)] transition"
              >
                Welcome
              </Link>
              <div className="border-t border-[var(--border)]" />
              <button
                onClick={handleLogout}
                className="block w-full text-left px-4 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--surface-hover)] transition"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-xl font-semibold">Hey {userName} 👋</h2>
          {totalRead === 0 && (
            <p className="text-sm text-[var(--muted)] mt-1">Pick an article below to get started.</p>
          )}
        </div>

        {/* Available Articles */}
        <div className="mb-3">
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider">Choose an Article</h2>
        </div>

        <div className="space-y-2">
          {visible.map((article) => (
            <Link
              key={article.id}
              href={`/student/read/${article.id}`}
              className="block p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] transition group min-h-[120px]"
            >
              <div>
                <h3 className="font-medium text-[15px] group-hover:text-[var(--accent)] transition line-clamp-1">{article.title}</h3>
                <p className="text-sm text-[var(--muted)] mt-1.5 line-clamp-2">{articleSummary(article.bodyText, article.title)}</p>
                <p className="text-xs text-[var(--muted)] mt-1.5">
                  <span className={`font-medium ${categoryStyle(article)}`}>{categoryLabel(article)}</span>
                  {article.category !== "news" && article.topic ? ` · ${article.topic}` : ""}
                  {" · "}{article.estimatedReadTime} min read
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Get new articles */}
        <div className="mt-4 text-center">
          {generating ? (
            <span className="text-sm text-[var(--muted)] inline-flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              Loading new articles…
            </span>
          ) : (
            <button
              onClick={getNewArticles}
              className="text-sm px-4 py-2 border border-[var(--border)] rounded-lg text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--accent)] transition"
            >
              Show me different articles
            </button>
          )}
          {noMore && (
            <p className="text-sm text-[var(--muted)] mt-2">You&apos;ve seen all available articles! Check back later for new ones.</p>
          )}
        </div>

        {/* Completed today — only show after first completion */}
        {completedToday.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-3">
              Today&apos;s Reading Goal · {completedToday.length}/{dailyGoal}
              {completedToday.length >= dailyGoal && " 🎉"}
            </h2>
            <div className="space-y-2">
              {completedToday.map((completed, i) => (
                <div
                  key={i}
                  className="p-4 bg-[var(--surface)] border border-[var(--accent)]/30 rounded-xl flex items-center gap-3"
                >
                  <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-sm flex-shrink-0">
                    ✓
                  </div>
                  <p className="text-[15px] font-medium text-[var(--fg)]">{completed.title}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
