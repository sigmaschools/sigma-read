"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Article {
  id: number;
  title: string;
  topic: string;
  read: boolean;
  createdAt: string;
}

export default function StudentSessions() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/articles").then((r) => r.json()).then((data) => {
      setArticles(data.filter((a: Article) => a.read));
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
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
        {articles.length === 0 ? (
          <p className="text-[var(--muted)]">No completed sessions yet.</p>
        ) : (
          <div className="space-y-2">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/student/read/${article.id}`}
                className="block p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] transition"
              >
                <h3 className="font-medium text-[15px]">{article.title}</h3>
                <p className="text-sm text-[var(--muted)] mt-1">
                  {article.topic} · {new Date(article.createdAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
