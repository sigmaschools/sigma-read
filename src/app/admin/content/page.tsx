"use client";

import { useState, useEffect } from "react";

interface CacheArticle {
  id: number;
  title: string;
  topic: string;
  readingLevel: number | null;
  category: string | null;
  estimatedReadTime: number | null;
  generatedDate: string | null;
  headlineSource: string | null;
  baseArticleId: number | null;
  createdAt: string;
}

interface Distribution {
  byLevel: Record<number, number>;
  byCategory: Record<string, number>;
}

export default function AdminContentPage() {
  const [articles, setArticles] = useState<CacheArticle[]>([]);
  const [distribution, setDistribution] = useState<Distribution | null>(null);
  const [total, setTotal] = useState(0);
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadContent(); }, [filterLevel]);

  async function loadContent() {
    const params = new URLSearchParams();
    if (filterLevel !== "all") params.set("level", filterLevel);
    const res = await fetch(`/api/admin/content?${params}`);
    const data = await res.json();
    setArticles(data.articles);
    setDistribution(data.distribution);
    setTotal(data.total);
    setLoading(false);
  }

  async function deleteArticle(id: number) {
    if (!confirm("Delete this article from cache?")) return;
    await fetch("/api/admin/content", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadContent();
  }

  const filtered = search.trim()
    ? articles.filter(a => a.title.toLowerCase().includes(search.toLowerCase()) || a.topic?.toLowerCase().includes(search.toLowerCase()))
    : articles;

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-8 max-w-7xl">
      <h1 className="text-2xl font-semibold mb-6">Article Cache ({total})</h1>

      {/* Distribution */}
      {distribution && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">By Level</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6].map(l => (
                <div key={l} className="flex-1 text-center">
                  <p className="text-xs text-[var(--muted)]">L{l}</p>
                  <p className={`font-semibold ${(distribution.byLevel[l] || 0) < 5 ? "text-red-500" : "text-green-600"}`}>
                    {distribution.byLevel[l] || 0}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">By Category</p>
            <div className="flex gap-3">
              {Object.entries(distribution.byCategory).map(([cat, count]) => (
                <div key={cat} className="text-center">
                  <p className="text-xs text-[var(--muted)]">{cat}</p>
                  <p className="font-semibold">{count}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg outline-none focus:border-[var(--accent)] w-48" />
        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)}
          className="px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-white">
          <option value="all">All Levels</option>
          {[1, 2, 3, 4, 5, 6].map(l => <option key={l} value={l}>Level {l}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--muted)] uppercase tracking-wider border-b border-[var(--border)]">
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Topic</th>
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Read Time</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} className="border-b border-[var(--border)] hover:bg-gray-50 transition">
                <td className="px-4 py-3 font-medium max-w-xs truncate">{a.title}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{a.topic}</td>
                <td className="px-4 py-3">L{a.readingLevel}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    a.category === "news" ? "bg-blue-100 text-blue-700" :
                    a.category === "interest" ? "bg-violet-100 text-violet-700" :
                    "bg-green-100 text-green-700"
                  }`}>{a.category || "—"}</span>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{a.estimatedReadTime ? `${a.estimatedReadTime}m` : "—"}</td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">{a.headlineSource || "—"}</td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {a.generatedDate ? new Date(a.generatedDate).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteArticle(a.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
