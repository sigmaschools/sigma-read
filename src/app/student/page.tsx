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

const MAX_UNREAD = 5;

function categoryLabel(article: Article) {
  if (article.category === "news") return "News";
  if (article.category === "interest") return "For You";
  return "Explore";
}

function articleSummary(text: string, title: string): string {
  // Strip markdown headings, split into sentences
  const clean = text.replace(/^#+\s.*\n*/gm, "").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length === 0) return clean.slice(0, 180);
  // Skip first sentence if it's very similar to the title (redundant)
  const titleWords = new Set(title.toLowerCase().split(/\s+/));
  const firstWords = new Set((sentences[0] || "").toLowerCase().split(/\s+/));
  const overlap = [...titleWords].filter(w => firstWords.has(w) && w.length > 3).length;
  const start = overlap > titleWords.size * 0.5 ? 1 : 0;
  // Grab sentences until we reach ~160 chars (fills 2 lines)
  let result = "";
  for (let i = start; i < sentences.length; i++) {
    const next = result + sentences[i].trim() + " ";
    if (result.length > 0 && next.length > 180) break;
    result = next;
    if (result.length >= 140) break;
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
  const [feedback, setFeedback] = useState("");
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

    if (arts.length === 0) {
      setGenerating(true);
      await fetch("/api/articles/serve-cached", { method: "POST" });
      const refreshRes = await fetch("/api/articles");
      arts = await refreshRes.json();
      setGenerating(false);
    }

    setArticles(arts);
    setLoading(false);
  }

  async function generateMore() {
    setGenerating(true);
    setFeedback("");
    try {
      const cacheRes = await fetch("/api/articles/serve-cached", { method: "POST" });
      const cacheData = await cacheRes.json();
      if (cacheData.count > 0) {
        setFeedback(`${cacheData.count} new article${cacheData.count > 1 ? "s" : ""} added!`);
      } else {
        const genRes = await fetch("/api/articles/generate", { method: "POST" });
        const genData = await genRes.json();
        if (genData.generated > 0) {
          setFeedback(`${genData.generated} new article${genData.generated > 1 ? "s" : ""} created for you!`);
        } else {
          setFeedback("No new articles available right now. Check back later!");
        }
      }
      const artRes = await fetch("/api/articles");
      setArticles(await artRes.json());
    } catch (e) {
      console.error(e);
      setFeedback("Something went wrong. Try again in a moment.");
    }
    setGenerating(false);
    setTimeout(() => setFeedback(""), 5000);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const unread = articles.filter((a) => !a.read);
  const readArticles = articles.filter((a) => a.read);
  const totalRead = readArticles.length;
  const canLoadMore = unread.length < MAX_UNREAD;

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
      <header className="sticky top-0 bg-white/95 backdrop-blur border-b border-[var(--border)] px-6 py-3 flex items-center justify-between z-10">
        <h1 className="text-lg font-semibold tracking-tight">SigmaRead</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--muted)]">{userName}</span>
          <button onClick={handleLogout} className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition">
            Sign out
          </button>
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

        {unread.length === 0 && !generating && (
          <div className="text-center py-8 text-[var(--muted)]">
            <p className="text-sm">No new articles right now. Load more below.</p>
          </div>
        )}

        <div className="space-y-2">
          {unread.map((article) => (
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

        {/* Load more */}
        {canLoadMore && (
          <div className="mt-4 text-center">
            {generating ? (
              <span className="text-sm text-[var(--muted)] inline-flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                Loading new articles…
              </span>
            ) : (
              <button
                onClick={generateMore}
                className="text-sm px-4 py-2 border border-[var(--border)] rounded-lg text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--accent)] transition"
              >
                Load more articles
              </button>
            )}
            {feedback && (
              <p className="text-sm text-green-600 mt-2 animate-pulse">{feedback}</p>
            )}
          </div>
        )}

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
