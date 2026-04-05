"use client";

import { useState, useEffect, useCallback } from "react";

type Tab = "queue" | "library";

interface QueueRow {
  id: number;
  title: string;
  topic: string;
  category: string;
  readingLevel: number;
  generatedDate: string | null;
  sourceUrl: string | null;
  flagged: boolean;
  createdAt: string;
}

interface LibraryRow {
  id: number;
  title: string;
  topic: string;
  category: string;
  readingLevel: number;
  read: boolean;
  liked: boolean | null;
  studentId: number;
  studentName: string;
  createdAt: string;
}

interface StudentOption {
  id: number;
  name: string;
}

interface Preview {
  title: string;
  topic: string;
  readingLevel: number;
  bodyText: string;
  sources: string[];
}

interface FlagConfirm {
  id: number;
  topic: string;
  flagged: boolean;
}

const catColor = (cat: string) =>
  cat === "news" ? "#3b82f6" : cat === "interest" ? "#7c3aed" : "#22c55e";
const catLabel = (cat: string) =>
  cat === "general" ? "Explore" : cat.charAt(0).toUpperCase() + cat.slice(1);

export default function AdminArticlesPage() {
  const [tab, setTab] = useState<Tab>("queue");
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [libraryRows, setLibraryRows] = useState<LibraryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [queueTotal, setQueueTotal] = useState(0);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [category, setCategory] = useState("all");
  const [flagged, setFlagged] = useState("all");
  const [level, setLevel] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("all");
  const [students, setStudents] = useState<StudentOption[]>([]);

  // Modal state
  const [preview, setPreview] = useState<Preview | null>(null);
  const [flagConfirm, setFlagConfirm] = useState<FlagConfirm | null>(null);

  const fetchData = useCallback(async (t: Tab, p: number) => {
    setLoading(true);
    const params = new URLSearchParams({ tab: t, page: String(p), category });
    if (t === "queue") {
      params.set("flagged", flagged);
      params.set("level", level);
    } else {
      params.set("read", readFilter);
      params.set("student", studentFilter);
    }

    const res = await fetch(`/api/admin/articles?${params}`);
    const data = await res.json();

    if (t === "queue") {
      setQueueRows(data.rows);
      setQueueTotal(data.total);
    } else {
      setLibraryRows(data.rows);
      setLibraryTotal(data.total);
      if (data.students) setStudents(data.students);
    }

    setTotal(data.total);
    setPage(data.page);
    setPageCount(data.pageCount);
    setLoading(false);
  }, [category, flagged, level, readFilter, studentFilter]);

  // Load both tab counts on mount
  useEffect(() => {
    async function loadCounts() {
      const [qRes, lRes] = await Promise.all([
        fetch("/api/admin/articles?tab=queue&page=1"),
        fetch("/api/admin/articles?tab=library&page=1"),
      ]);
      const [qData, lData] = await Promise.all([qRes.json(), lRes.json()]);
      setQueueTotal(qData.total);
      setLibraryTotal(lData.total);
      if (lData.students) setStudents(lData.students);
      // Set initial data for default tab
      setQueueRows(qData.rows);
      setTotal(qData.total);
      setPage(qData.page);
      setPageCount(qData.pageCount);
      setLoading(false);
    }
    loadCounts();
  }, []);

  // Refetch when tab or filters change (skip initial load)
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized) { setInitialized(true); return; }
    setPage(1);
    fetchData(tab, 1);
  }, [tab, category, flagged, level, readFilter, studentFilter, fetchData, initialized]);

  function resetFilters() {
    setCategory("all");
    setFlagged("all");
    setLevel("all");
    setReadFilter("all");
    setStudentFilter("all");
  }

  async function openPreview(id: number) {
    const res = await fetch(`/api/admin/articles/${id}?tab=${tab}`);
    const data = await res.json();
    setPreview(data);
  }

  function handleFlagClick(e: React.MouseEvent, row: QueueRow) {
    e.stopPropagation();
    setFlagConfirm({ id: row.id, topic: row.topic, flagged: row.flagged });
  }

  async function confirmFlag() {
    if (!flagConfirm) return;
    await fetch("/api/admin/content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: flagConfirm.id, flagged: !flagConfirm.flagged }),
    });
    setFlagConfirm(null);
    fetchData(tab, page);
  }

  function goToPage(p: number) {
    if (p < 1 || p > pageCount) return;
    setPage(p);
    fetchData(tab, p);
  }

  const rangeStart = (page - 1) * 50 + 1;
  const rangeEnd = Math.min(page * 50, total);

  if (loading && !initialized) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <h1 className="text-2xl font-semibold mb-5">Articles</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-5">
        <button
          onClick={() => { resetFilters(); setTab("queue"); }}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            tab === "queue" ? "bg-gray-900 text-white" : "text-[var(--muted)] hover:bg-gray-100"
          }`}
        >
          Queue · {queueTotal}
        </button>
        <button
          onClick={() => { resetFilters(); setTab("library"); }}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            tab === "library" ? "bg-gray-900 text-white" : "text-[var(--muted)] hover:bg-gray-100"
          }`}
        >
          Library · {libraryTotal}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {/* Category pills */}
        {["all", "news", "interest", "general"].map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${
              category === c
                ? "border-[var(--fg)] bg-[var(--fg)] text-white"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
            }`}
          >
            {c === "all" ? "All" : catLabel(c)}
          </button>
        ))}

        <span className="w-px h-5 bg-[var(--border)] mx-1" />

        {/* Level pills */}
        {tab === "queue" && ["all", "1", "2", "3", "4"].map(l => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${
              level === l
                ? "border-[var(--fg)] bg-[var(--fg)] text-white"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
            }`}
          >
            {l === "all" ? "All levels" : `L${l}`}
          </button>
        ))}

        {/* Flagged filter (queue only) */}
        {tab === "queue" && (
          <>
            <span className="w-px h-5 bg-[var(--border)] mx-1" />
            {["all", "active", "blocked"].map(f => (
              <button
                key={f}
                onClick={() => setFlagged(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${
                  flagged === f
                    ? "border-[var(--fg)] bg-[var(--fg)] text-white"
                    : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </>
        )}

        {/* Read filter (library only) */}
        {tab === "library" && (
          <>
            <span className="w-px h-5 bg-[var(--border)] mx-1" />
            {[
              { value: "all", label: "All" },
              { value: "true", label: "Read" },
              { value: "false", label: "Unread" },
            ].map(r => (
              <button
                key={r.value}
                onClick={() => setReadFilter(r.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${
                  readFilter === r.value
                    ? "border-[var(--fg)] bg-[var(--fg)] text-white"
                    : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </>
        )}

        {/* Student dropdown (library only) */}
        {tab === "library" && students.length > 0 && (
          <>
            <span className="w-px h-5 bg-[var(--border)] mx-1" />
            <select
              value={studentFilter}
              onChange={e => setStudentFilter(e.target.value)}
              className="text-xs border border-[var(--border)] rounded-lg px-3 py-1.5 bg-white text-[var(--fg)]"
            >
              <option value="all">All students</option>
              {students.map(s => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Article list */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          {tab === "queue" ? (
            queueRows.length === 0 ? (
              <div className="p-8 text-center text-[var(--muted)] text-sm">No articles found.</div>
            ) : (
              queueRows.map((row, i) => (
                <div
                  key={row.id}
                  className={`flex items-center hover:bg-gray-50 transition cursor-pointer ${row.flagged ? "opacity-40" : ""} ${i < queueRows.length - 1 ? "border-b border-[var(--border)]" : ""}`}
                  style={{ borderLeft: `3px solid ${catColor(row.category)}` }}
                  onClick={() => openPreview(row.id)}
                >
                  <div className="flex-1 px-5 py-3 min-w-0">
                    <div className="font-medium text-sm truncate">{row.title}</div>
                    <div className="text-xs text-[var(--muted)] truncate">{row.topic}</div>
                  </div>
                  <div className="flex items-center gap-3 pr-5 shrink-0">
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: catColor(row.category) + "20", color: catColor(row.category) }}
                    >
                      {catLabel(row.category)}
                    </span>
                    <span className="text-xs font-medium text-[var(--muted)] bg-gray-100 px-1.5 py-0.5 rounded">
                      L{row.readingLevel}
                    </span>
                    <span className="text-[11px] text-[var(--muted)] w-20 text-right">
                      {row.generatedDate
                        ? new Date(row.generatedDate + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : new Date(row.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    {row.flagged && <span className="text-[10px] text-red-400">blocked</span>}
                    <button
                      onClick={(e) => handleFlagClick(e, row)}
                      className={`p-1.5 transition ${row.flagged ? "text-green-600 hover:text-green-800" : "text-[var(--muted)] hover:text-red-500"}`}
                      title={row.flagged ? "Unblock" : "Block"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
                      </svg>
                    </button>
                    {row.sourceUrl && (
                      <a href={row.sourceUrl} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} className="text-[var(--muted)] hover:text-blue-500 transition">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              ))
            )
          ) : (
            libraryRows.length === 0 ? (
              <div className="p-8 text-center text-[var(--muted)] text-sm">No articles found.</div>
            ) : (
              libraryRows.map((row, i) => (
                <div
                  key={row.id}
                  className={`flex items-center hover:bg-gray-50 transition cursor-pointer ${i < libraryRows.length - 1 ? "border-b border-[var(--border)]" : ""}`}
                  style={{ borderLeft: `3px solid ${catColor(row.category || "general")}` }}
                  onClick={() => openPreview(row.id)}
                >
                  <div className="flex-1 px-5 py-3 min-w-0">
                    <div className="font-medium text-sm truncate">{row.title}</div>
                    <div className="text-xs text-[var(--muted)] truncate">{row.topic}</div>
                  </div>
                  <div className="flex items-center gap-3 pr-5 shrink-0">
                    <span className="text-xs text-[var(--muted)]">{row.studentName}</span>
                    <span className="text-xs font-medium text-[var(--muted)] bg-gray-100 px-1.5 py-0.5 rounded">
                      L{row.readingLevel}
                    </span>
                    {row.read ? (
                      <span className="text-green-500 text-xs" title="Read">✓</span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-gray-300" title="Unread" />
                    )}
                    {row.liked === true && <span title="Liked" className="text-xs">👍</span>}
                    {row.liked === false && <span title="Disliked" className="text-xs">👎</span>}
                    <span className="text-[11px] text-[var(--muted)] w-20 text-right">
                      {new Date(row.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-[var(--muted)]">
            Showing {rangeStart}–{rangeEnd} of {total} articles
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30 transition"
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(pageCount, 5) }, (_, i) => {
              let p: number;
              if (pageCount <= 5) p = i + 1;
              else if (page <= 3) p = i + 1;
              else if (page >= pageCount - 2) p = pageCount - 4 + i;
              else p = page - 2 + i;
              return (
                <button
                  key={p}
                  onClick={() => goToPage(p)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                    page === p
                      ? "border-[var(--fg)] bg-[var(--fg)] text-white"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page === pageCount}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30 transition"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Flag confirmation modal */}
      {flagConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setFlagConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-3">
              {flagConfirm.flagged ? "Unblock Article" : "Block Article"}
            </h2>
            <p className="text-sm text-[var(--fg)] mb-2 font-medium">&ldquo;{flagConfirm.topic}&rdquo;</p>
            {flagConfirm.flagged ? (
              <p className="text-sm text-[var(--fg)] leading-relaxed mb-5">
                This will unblock this topic and make it available to students again.
              </p>
            ) : (
              <div className="text-sm text-[var(--fg)] leading-relaxed mb-5">
                <p className="mb-2">Blocking this article will:</p>
                <ul className="list-disc pl-5 space-y-1 text-[var(--muted)]">
                  <li>Remove it from all students&apos; article feeds</li>
                  <li>Flag all reading level versions</li>
                  <li>Add the topic to the blocked list</li>
                </ul>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setFlagConfirm(null)}
                className="flex-1 px-4 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--fg)] hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmFlag}
                className={`flex-1 px-4 py-2 text-sm rounded-lg text-white transition ${
                  flagConfirm.flagged ? "bg-green-600 hover:bg-green-700" : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {flagConfirm.flagged ? "Unblock" : "Block"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Article preview modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-[700px] w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-[var(--border)] px-6 py-3 flex items-center justify-between rounded-t-2xl z-10">
              <span className="text-xs text-[var(--muted)] bg-gray-100 px-2 py-0.5 rounded">Level {preview.readingLevel}</span>
              <button onClick={() => setPreview(null)} className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition">Close ×</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <article className="max-w-[640px] mx-auto px-6 py-10">
                <h1 className="text-3xl font-semibold tracking-tight mb-2">{preview.title}</h1>
                <p className="text-sm text-[var(--muted)] mb-8">{preview.topic}</p>
                <div style={{ fontSize: "18px", lineHeight: "1.75" }}>
                  {preview.bodyText.split("\n\n").map((para, i) => {
                    if (para.startsWith("# ") && !para.startsWith("## ")) return null;
                    if (para.startsWith("## ") || para.startsWith("### ")) {
                      const content = para.replace(/^#{2,3}\s/, "");
                      return <h2 key={i} className="font-semibold text-lg mt-6 mb-2">{content}</h2>;
                    }
                    return <p key={i} className="mb-5">{para}</p>;
                  })}
                </div>
                {preview.sources && preview.sources.length > 0 && (
                  <div className="mt-8 pt-4 border-t border-[var(--border)]">
                    <p className="text-xs text-[var(--muted)] mb-2">Sources</p>
                    {preview.sources.map((s, i) => (
                      <a key={i} href={s} target="_blank" rel="noopener" className="block text-xs text-blue-600 hover:underline truncate">{s}</a>
                    ))}
                  </div>
                )}
              </article>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
