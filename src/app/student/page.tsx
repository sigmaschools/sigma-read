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
  createdAt: string;
}

export default function StudentHome() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [searchTopic, setSearchTopic] = useState("");
  const [userName, setUserName] = useState("");
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

    const artRes = await fetch("/api/articles");
    const arts = await artRes.json();
    setArticles(arts);
    setLoading(false);

    // Auto-generate if fewer than 3 unread
    const unread = arts.filter((a: Article) => !a.read);
    if (unread.length < 3) {
      generateArticles();
    }
  }

  async function generateArticles() {
    setGenerating(true);
    try {
      await fetch("/api/articles/generate", { method: "POST" });
      const artRes = await fetch("/api/articles");
      setArticles(await artRes.json());
    } catch (e) {
      console.error(e);
    }
    setGenerating(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const unread = articles.filter((a) => !a.read);
  const readArticles = articles.filter((a) => a.read);

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
      <aside className="w-56 border-r border-[var(--border)] p-5 flex flex-col">
        <h1 className="text-lg font-semibold tracking-tight mb-1">SigmaRead</h1>
        <p className="text-sm text-[var(--muted)] mb-8">{userName}</p>
        <nav className="space-y-1 flex-1">
          <a className="block px-3 py-2 text-sm font-medium bg-[var(--surface-hover)] rounded-lg">Home</a>
          <Link href="/student/sessions" className="block px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--fg)] rounded-lg hover:bg-[var(--surface-hover)] transition">
            My Sessions
          </Link>
        </nav>
        <button onClick={handleLogout} className="text-sm text-[var(--muted)] hover:text-[var(--fg)] text-left">
          Sign out
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Your Articles</h2>
          {generating && (
            <span className="text-sm text-[var(--muted)] flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              Generating new articles…
            </span>
          )}
        </div>

        {unread.length === 0 && !generating && (
          <div className="text-center py-12 text-[var(--muted)]">
            <p className="mb-4">No articles yet.</p>
            <button
              onClick={generateArticles}
              className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition"
            >
              Generate Articles
            </button>
          </div>
        )}

        <div className="space-y-2">
          {unread.map((article) => (
            <Link
              key={article.id}
              href={`/student/read/${article.id}`}
              className="block p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] transition group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-[15px] group-hover:text-[var(--accent)] transition">{article.title}</h3>
                  <p className="text-sm text-[var(--muted)] mt-1">{article.topic} · {article.estimatedReadTime} min read</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {readArticles.length > 0 && (
          <>
            <h3 className="text-sm font-medium text-[var(--muted)] mt-8 mb-3 uppercase tracking-wider">Already Read</h3>
            <div className="space-y-1">
              {readArticles.map((article) => (
                <Link
                  key={article.id}
                  href={`/student/read/${article.id}`}
                  className="block p-3 text-sm text-[var(--muted)] hover:text-[var(--fg)] rounded-lg hover:bg-[var(--surface-hover)] transition"
                >
                  {article.title} · {article.topic}
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
