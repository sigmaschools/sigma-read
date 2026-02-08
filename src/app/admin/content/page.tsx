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

  useEffect(() => { loadContent(); }, []);

  async function loadContent() {
    const res = await fetch("/api/admin/content?limit=500");
    const data = await res.json();
    setArticles(data.articles);
    setDistribution(data.distribution);
    setTotal(data.total);
    setLoading(false);
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
      <h1 className="text-2xl font-semibold mb-2">Article Cache</h1>
      <p className="text-sm text-[var(--muted)] mb-6">{groups.length} articles · {total} total versions across levels</p>

      {/* Distribution */}
      {distribution && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">Versions by Level</p>
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
            <div className="flex gap-4">
              {Object.entries(distribution.byCategory).map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-2">
                  {categoryBadge(cat)}
                  <span className="font-semibold text-sm">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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

      {/* Grouped Articles */}
      <div className="space-y-2">
        {filteredGroups.map(group => (
          <div key={group.baseId} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            {/* Group Header */}
            <div className={`flex items-center justify-between ${group.allFlagged ? "opacity-50" : ""}`}>
              <button
                onClick={() => toggleExpand(group.baseId)}
                className="flex-1 text-left px-5 py-4 hover:bg-gray-50 transition flex items-center gap-3 min-w-0"
              >
                <span className="text-[var(--muted)] text-sm">{expanded.has(group.baseId) ? "▼" : "▸"}</span>
                <div className="min-w-0">
                  <h3 className="font-medium text-[15px] truncate">
                    {group.allFlagged && <span className="text-red-400 mr-1">⛔</span>}
                    {group.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {categoryBadge(group.category)}
                    <span className="text-xs text-[var(--muted)]">
                      {group.levels.length} level{group.levels.length !== 1 ? "s" : ""}: {group.levels.map(l => `L${l.readingLevel}`).join(", ")}
                    </span>
                    {group.generatedDate && (
                      <span className="text-xs text-[var(--muted)]">· {new Date(group.generatedDate).toLocaleDateString()}</span>
                    )}
                    {group.source && (
                      <span className="text-xs text-[var(--muted)] truncate max-w-xs">· {(() => { try { return new URL(group.source!).hostname; } catch { return group.source; } })()}</span>
                    )}
                  </div>
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); flagGroup(group, !group.allFlagged); }}
                className={`mr-4 text-xs px-3 py-1.5 rounded-lg border transition ${
                  group.allFlagged
                    ? "border-green-300 text-green-700 hover:bg-green-50"
                    : "border-red-200 text-red-500 hover:bg-red-50"
                }`}
              >
                {group.allFlagged ? "Unflag" : "Flag"}
              </button>
            </div>

            {/* Expanded Level Details */}
            {expanded.has(group.baseId) && (
              <div className="border-t border-[var(--border)]">
                {group.levels.map(a => (
                  <div key={a.id} className={`px-5 py-3 flex items-center justify-between border-b border-[var(--border)] last:border-0 bg-gray-50/50 ${a.flagged ? "opacity-50" : ""}`}>
                    <div className="pl-6">
                      <p className="text-sm font-medium">
                        <span className="text-xs text-[var(--muted)] bg-gray-200 px-1.5 py-0.5 rounded mr-2">L{a.readingLevel}</span>
                        {a.flagged && <span className="text-red-400 mr-1">⛔</span>}
                        {a.title}
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {a.estimatedReadTime ? `${a.estimatedReadTime} min read` : ""}
                        {a.baseArticleId ? " · Adapted" : " · Base article"}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleFlag(a.id, a.flagged)}
                      className={`text-xs px-2 py-1 rounded transition ${a.flagged ? "text-green-600 hover:text-green-800" : "text-red-400 hover:text-red-600"}`}
                    >
                      {a.flagged ? "Unflag" : "Flag"}
                    </button>
                  </div>
                ))}
                {group.source && (
                  <div className="px-5 py-2 bg-gray-50/80">
                    <a href={group.source} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline truncate block pl-6">
                      Source: {group.source}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {filteredGroups.length === 0 && (
          <p className="text-center text-sm text-[var(--muted)] py-8">No articles matching filter.</p>
        )}
      </div>
    </div>
  );
}
