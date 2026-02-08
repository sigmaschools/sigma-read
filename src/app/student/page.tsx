"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Article {
  id: number;
  title: string;
  topic: string;
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
  const [completedToday, setCompletedToday] = useState(0);
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
    if (!prog.error) setCompletedToday(prog.completedToday);

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
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 border-r border-[var(--border)] p-5 flex flex-col sticky top-0 h-screen">
        <h1 className="text-lg font-semibold tracking-tight mb-1">SigmaRead</h1>
        <p className="text-sm text-[var(--muted)] mb-8">{userName}</p>
        <nav className="space-y-1 flex-1">
          <a className="block px-3 py-2 text-sm font-medium bg-[var(--surface-hover)] rounded-lg">Home</a>
        </nav>
        <div className="border-t border-[var(--border)] pt-3 mt-3">
          <button onClick={handleLogout} className="text-sm text-[var(--muted)] hover:text-[var(--fg)] text-left">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 max-w-3xl">
        <div className="mb-8">
          <h2 className="text-xl font-semibold">Hey {userName} 👋</h2>
          {totalRead === 0 ? (
            <p className="text-sm text-[var(--muted)] mt-1">Pick an article below to get started.</p>
          ) : (
            <div className="mt-3">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  {Array.from({ length: dailyGoal }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                        i < completedToday
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)]"
                      }`}
                    >
                      {i < completedToday ? "✓" : i + 1}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-[var(--muted)]">
                  {completedToday >= dailyGoal
                    ? "You hit your goal for today! 🎉"
                    : `${completedToday} of ${dailyGoal} articles today`}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold">Up Next</h2>
        </div>

        {unread.length === 0 && !generating && (
          <div className="text-center py-12 text-[var(--muted)]">
            <p className="text-lg mb-2">You&apos;ve read everything! 🎉</p>
            <p className="text-sm">Load more articles below.</p>
          </div>
        )}

        <div className="space-y-2">
          {unread.map((article) => (
            <Link
              key={article.id}
              href={`/student/read/${article.id}`}
              className="block p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] transition group"
            >
              <div>
                <h3 className="font-medium text-[15px] group-hover:text-[var(--accent)] transition">{article.title}</h3>
                <p className="text-sm text-[var(--muted)] mt-1">
                  <span className={`font-medium ${categoryStyle(article)}`}>{categoryLabel(article)}</span>
                  {article.category !== "news" && article.topic ? ` · ${article.topic}` : ""}
                  {" · "}{article.estimatedReadTime} min read
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* More articles button — below the list */}
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

        {readArticles.length > 0 && (
          <>
            <h3 className="text-sm font-medium text-[var(--muted)] mt-8 mb-3 uppercase tracking-wider">
              Already Read{readArticles.length > 5 ? ` · ${readArticles.length} total` : ""}
            </h3>
            <div className="space-y-1">
              {readArticles.slice(0, 5).map((article) => (
                <Link
                  key={article.id}
                  href={`/student/read/${article.id}`}
                  className="block p-3 text-sm text-[var(--muted)] hover:text-[var(--fg)] rounded-lg hover:bg-[var(--surface-hover)] transition"
                >
                  {article.title}
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
