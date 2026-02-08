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
  flagged: boolean;
  createdAt: string;
}

interface ArticleGroup {
  baseId: number;
  title: string; // from the highest-level version
  topic: string;
  category: string | null;
  source: string | null;
  generatedDate: string | null;
  levels: CacheArticle[];
}

interface Distribution {
  byLevel: Record<number, number>;
  byCategory: Record<string, number>;
}

export default function AdminContentPage() {
  const [articles, setArticles] = useState<CacheArticle[]>([]);
  const [distribution, setDistribution] = useState<Distribution | null>(null);
  const [total, setTotal] = useState(0);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<{ id: number; title: string; level: number; body: string; topic: string; sources: string[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => { loadContent(); }, []);

  async function loadContent() {
    const res = await fetch("/api/admin/content?limit=500");
    const data = await res.json();
    setArticles(data.articles);
    setDistribution(data.distribution);
    setTotal(data.total);
    setLoading(false);
  }

  async function openPreview(id: number) {
    setPreviewLoading(true);
    setPreview(null);
    const res = await fetch(`/api/admin/content/${id}`);
    const data = await res.json();
    setPreview({
      id: data.id,
      title: data.title,
      level: data.readingLevel,
      body: data.bodyText,
      topic: data.topic,
      sources: data.sources || [],
    });
    setPreviewLoading(false);
  }

  async function toggleFlag(id: number, currentlyFlagged: boolean) {
    await fetch("/api/admin/content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, flagged: !currentlyFlagged }),
    });
    loadContent();
  }

  async function flagGroup(group: ArticleGroup, flag: boolean) {
    for (const a of group.levels) {
      await fetch("/api/admin/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, flagged: flag }),
      });
    }
    loadContent();
  }

  interface ArticleGroupWithFlag extends ArticleGroup {
    allFlagged: boolean;
    someFlagged: boolean;
  }

  // Group articles by base article
  function groupArticles(articles: CacheArticle[]): ArticleGroupWithFlag[] {
    const groups: Map<number, ArticleGroup> = new Map();

    // First pass: find base articles (no baseArticleId) or create groups
    for (const a of articles) {
      const baseId = a.baseArticleId || a.id;
      
      if (!groups.has(baseId)) {
        groups.set(baseId, {
          baseId,
          title: a.topic, // use topic as the group title (consistent across levels)
          topic: a.topic,
          category: a.category,
          source: a.headlineSource,
          generatedDate: a.generatedDate,
          levels: [],
        });
      }

      const group = groups.get(baseId)!;
      group.levels.push(a);

      // Use source/category from whichever has it
      if (a.headlineSource && !group.source) group.source = a.headlineSource;
      if (a.category && !group.category) group.category = a.category;
      if (a.generatedDate && !group.generatedDate) group.generatedDate = a.generatedDate;
    }

    // Sort levels within each group
    for (const group of groups.values()) {
      group.levels.sort((a, b) => (a.readingLevel || 0) - (b.readingLevel || 0));
      // Use the base article's topic as group title
      const base = group.levels.find(l => !l.baseArticleId) || group.levels[0];
      group.title = base.topic;
    }

    const result: ArticleGroupWithFlag[] = Array.from(groups.values()).map(g => ({
      ...g,
      allFlagged: g.levels.every(l => l.flagged),
      someFlagged: g.levels.some(l => l.flagged),
    }));

    return result.sort((a, b) => {
      // Sort by date descending, then title
      if (a.generatedDate && b.generatedDate) return b.generatedDate.localeCompare(a.generatedDate);
      return a.title.localeCompare(b.title);
    });
  }

  const groups = groupArticles(articles);

  const filteredGroups = groups.filter(g => {
    if (filterCategory !== "all" && g.category !== filterCategory) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return g.title.toLowerCase().includes(q) || g.topic.toLowerCase().includes(q) ||
        g.levels.some(l => l.title.toLowerCase().includes(q));
    }
    return true;
  });

  function toggleExpand(baseId: number) {
    const next = new Set(expanded);
    if (next.has(baseId)) next.delete(baseId);
    else next.add(baseId);
    setExpanded(next);
  }

  const categoryBadge = (cat: string | null) => {
    if (cat === "news") return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">News</span>;
    if (cat === "interest") return <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">Interest</span>;
    if (cat === "general") return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Explore</span>;
    return <span className="text-xs text-[var(--muted)]">{cat || "—"}</span>;
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-6">{groups.length} Articles</h1>

      {/* Content mix bar */}
      {groups.length > 0 && (() => {
        const cats: Record<string, { count: number; color: string; bg: string }> = {
          news: { count: 0, color: "#3b82f6", bg: "#dbeafe" },
          interest: { count: 0, color: "#7c3aed", bg: "#ede9fe" },
          general: { count: 0, color: "#22c55e", bg: "#dcfce7" },
        };
        groups.forEach(g => {
          const cat = g.category || "general";
          if (cats[cat]) cats[cat].count++;
        });
        const total = groups.length;
        const entries = Object.entries(cats).filter(([, v]) => v.count > 0);

        return (
          <div className="mb-6">
            {/* Stacked bar */}
            <div className="flex rounded-lg overflow-hidden h-9">
              {entries.map(([cat, v]) => {
                const pct = (v.count / total) * 100;
                const label = cat === "general" ? "Explore" : cat.charAt(0).toUpperCase() + cat.slice(1);
                return (
                  <div
                    key={cat}
                    className="flex items-center justify-center gap-1.5 text-xs font-medium transition-all"
                    style={{ width: `${pct}%`, backgroundColor: v.color, color: "white", minWidth: pct > 8 ? undefined : "60px" }}
                  >
                    <span>{label}</span>
                    <span className="opacity-75">{v.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles…"
          className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg outline-none focus:border-[var(--accent)] w-56" />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-white">
          <option value="all">All Categories</option>
          <option value="news">News</option>
          <option value="interest">Interest</option>
          <option value="general">Explore</option>
        </select>
      </div>

      {/* Article List */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        {filteredGroups.map((group, i) => {
          const catColor = group.category === "news" ? "#3b82f6" : group.category === "interest" ? "#7c3aed" : "#22c55e";
          const sourceDomain = group.source ? (() => { try { return new URL(group.source!).hostname.replace("www.", ""); } catch { return null; } })() : null;

          return (
            <div key={group.baseId} className={i < filteredGroups.length - 1 ? "border-b border-[var(--border)]" : ""}>
              {/* Row */}
              <div
                className={`flex items-center hover:bg-gray-50 transition cursor-pointer ${group.allFlagged ? "opacity-40" : ""}`}
                style={{ borderLeft: `3px solid ${catColor}` }}
                onClick={() => toggleExpand(group.baseId)}
              >
                <div className="flex-1 px-4 py-3 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-[15px] truncate">{group.title}</h3>
                    {sourceDomain && <span className="text-[11px] text-[var(--muted)] shrink-0">{sourceDomain}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 pr-4 shrink-0">
                  {group.allFlagged && <span className="text-[11px] text-red-400">flagged</span>}
                  <button
                    onClick={(e) => { e.stopPropagation(); flagGroup(group, !group.allFlagged); }}
                    className="text-[var(--muted)] hover:text-red-500 transition p-1"
                    title={group.allFlagged ? "Unflag" : "Flag"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
                    </svg>
                  </button>
                  <span className="text-[var(--muted)] text-xs">{expanded.has(group.baseId) ? "▾" : "›"}</span>
                </div>
              </div>

              {/* Expanded */}
              {expanded.has(group.baseId) && (
                <div className="bg-gray-50/70" style={{ borderLeft: `3px solid ${catColor}` }}>
                  <div className="flex gap-1 px-4 py-2.5">
                    {group.levels.map(a => (
                      <button
                        key={a.id}
                        onClick={() => openPreview(a.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition hover:border-[var(--accent)] hover:text-[var(--accent)] ${
                          a.flagged ? "opacity-40 border-red-200 text-red-400" : "border-[var(--border)] text-[var(--fg)] bg-white"
                        }`}
                      >
                        L{a.readingLevel}
                      </button>
                    ))}
                  </div>
                  {group.source && (
                    <a href={group.source} target="_blank" rel="noopener" className="block px-4 pb-2.5 text-[11px] text-blue-500 hover:underline truncate">
                      {group.source}
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredGroups.length === 0 && (
          <p className="text-center text-sm text-[var(--muted)] py-8">No articles matching filter.</p>
        )}
      </div>

      {/* Article Preview Modal — matches student reader layout */}
      {(preview || previewLoading) && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setPreview(null); setPreviewLoading(false); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-[700px] w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {previewLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : preview && (
              <>
                {/* Top bar — mirrors student reader */}
                <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-[var(--border)] px-6 py-3 flex items-center justify-between rounded-t-2xl z-10">
                  <span className="text-xs text-[var(--muted)] bg-gray-100 px-2 py-0.5 rounded">Level {preview.level}</span>
                  <button onClick={() => setPreview(null)} className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition">
                    Close ×
                  </button>
                </div>

                {/* Article body — same max-width, font, spacing as student reader */}
                <div className="flex-1 overflow-y-auto">
                  <article className="max-w-[640px] mx-auto px-6 py-10">
                    <h1 className="text-3xl font-semibold tracking-tight mb-2">{preview.title}</h1>
                    <p className="text-sm text-[var(--muted)] mb-8">{preview.topic}</p>
                    <div style={{ fontSize: "18px", lineHeight: "1.75" }}>
                      {preview.body.split("\n\n").map((para, i) => {
                        if (para.startsWith("# ") && !para.startsWith("## ")) return null;
                        if (para.startsWith("## ") || para.startsWith("### ")) {
                          const content = para.replace(/^#{2,3}\s/, "");
                          return <h2 key={i} className="font-semibold text-lg mt-6 mb-2">{content}</h2>;
                        }
                        return <p key={i} className="mb-5">{para}</p>;
                      })}
                    </div>

                    {preview.sources.length > 0 && (
                      <div className="mt-8 pt-4 border-t border-[var(--border)]">
                        <p className="text-xs text-[var(--muted)] mb-2">Sources</p>
                        {preview.sources.map((s, i) => (
                          <a key={i} href={s} target="_blank" rel="noopener" className="block text-xs text-blue-600 hover:underline truncate">{s}</a>
                        ))}
                      </div>
                    )}
                  </article>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
