"use client";

import { useState, useEffect } from "react";

interface Version {
  id: number;
  title: string;
  readingLevel: number | null;
  flagged: boolean;
}

interface Topic {
  id: number;
  topic: string;
  category: string;
  source: string | null;
  flagged: boolean;
  versions: Version[];
}

interface ArchiveDate {
  date: string;
  count: number;
  categories?: Record<string, number>;
}

interface ArchiveArticle {
  id: number;
  topic: string;
  headline: string;
  category: string;
  flagged: boolean;
}

interface Preview {
  id: number;
  title: string;
  level: number;
  body: string;
  topic: string;
  sources: string[];
}

interface FlagConfirm {
  topicId: number;
  topic: string;
  flagged: boolean;
}

export default function AdminContentPage() {
  const [batchDate, setBatchDate] = useState("");
  const [isToday, setIsToday] = useState(true);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [categoryMix, setCategoryMix] = useState<Record<string, number>>({});
  const [archive, setArchive] = useState<ArchiveDate[]>([]);
  const [batchFailed, setBatchFailed] = useState(false);
  const [expandedTopic, setExpandedTopic] = useState<number | null>(null);
  const [expandedArchive, setExpandedArchive] = useState<string | null>(null);
  const [archiveArticles, setArchiveArticles] = useState<Record<string, ArchiveArticle[]>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [catModal, setCatModal] = useState<string | null>(null);
  const [flagConfirm, setFlagConfirm] = useState<FlagConfirm | null>(null);

  useEffect(() => { loadContent(); }, []);

  async function loadContent() {
    const res = await fetch("/api/admin/content");
    const data = await res.json();
    setBatchDate(data.batchDate);
    setIsToday(data.isToday);
    setTopics(data.topics);
    setCategoryMix(data.categoryMix);
    setArchive(data.archive);
    setBatchFailed(data.batchFailed || false);
    setLoading(false);
  }

  async function loadArchiveDate(date: string) {
    if (archiveArticles[date]) {
      setExpandedArchive(expandedArchive === date ? null : date);
      return;
    }
    const res = await fetch("/api/admin/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    const data = await res.json();
    setArchiveArticles(prev => ({ ...prev, [date]: data }));
    setExpandedArchive(date);
  }

  async function openPreview(id: number) {
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
  }

  function handleFlagClick(e: React.MouseEvent, topic: Topic) {
    e.stopPropagation();
    setFlagConfirm({ topicId: topic.id, topic: topic.topic, flagged: topic.flagged });
  }

  async function confirmFlag() {
    if (!flagConfirm) return;
    await fetch("/api/admin/content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: flagConfirm.topicId, flagged: !flagConfirm.flagged }),
    });
    setFlagConfirm(null);
    loadContent();
  }

  const catColor = (cat: string) =>
    cat === "news" ? "#3b82f6" : cat === "interest" ? "#7c3aed" : "#22c55e";
  const catLabel = (cat: string) =>
    cat === "general" ? "Explore" : cat.charAt(0).toUpperCase() + cat.slice(1);
  const catDescription = (cat: string) => {
    if (cat === "news") return "News articles are sourced from a wide range of outlets — mainstream media, science journals, sports coverage, and more. We don't limit ourselves to \"kid-friendly\" sources. Instead, our AI reads real-world reporting and rewrites each story at every reading level with age-appropriate language and framing. Editorial guidelines: factual tone, no editorializing, no graphic or disturbing content, and every article must pass the \"why did we pick this?\" test — the answer is always a factually significant current event that builds awareness of the world.";
    if (cat === "interest") return "Interest articles are matched to each student's personal interests, collected during onboarding and refined over time through favorites, topic suggestions, and ratings. The morning batch analyzes aggregated student interests and generates articles on topics students care about. The answer to \"why did we pick this?\" is always \"student's interest.\"";
    return "Explore articles broaden students' horizons beyond their stated interests. These cover fascinating topics students might not seek out on their own — science, history, culture, nature — chosen to spark curiosity. They ensure students aren't trapped in a filter bubble of only what they already like.";
  };

  // Count how many active (unflagged) topics remain
  const activeTopicCount = topics.filter(t => !t.flagged).length;

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;
  }

  const totalTopics = topics.length;

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-semibold mb-1">
          {isToday ? "Today's Articles" : `Articles · ${new Date(batchDate + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}`}
        </h1>
        {batchFailed && (
          <p className="text-sm text-amber-600">
            ⚠️ Morning batch failed — some students may not have fresh articles
          </p>
        )}
        {activeTopicCount === 0 && totalTopics > 0 && (
          <p className="text-sm text-red-500 mt-1">
            ⚠️ All articles for this batch are blocked. Students will only see older articles from their buffer.
          </p>
        )}
      </div>

      {/* Category mix bar */}
      {totalTopics > 0 && (
        <div className="flex rounded-lg overflow-hidden h-8 mb-6">
          {Object.entries(categoryMix).filter(([, c]) => c > 0).sort(([a], [b]) => {
            const order: Record<string, number> = { news: 0, interest: 1, general: 2 };
            return (order[a] ?? 9) - (order[b] ?? 9);
          }).map(([cat, cnt]) => (
            <button
              key={cat}
              className="flex items-center justify-center gap-1.5 text-xs font-medium cursor-pointer hover:brightness-110 transition"
              style={{ width: `${(cnt / totalTopics) * 100}%`, backgroundColor: catColor(cat), color: "white" }}
              onClick={() => setCatModal(cat)}
            >
              <span>{catLabel(cat)}</span>
              <span className="opacity-75">{cnt}</span>
            </button>
          ))}
        </div>
      )}

      {/* Category explanation modal */}
      {catModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setCatModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: catColor(catModal) }} />
                <h2 className="text-lg font-semibold">{catLabel(catModal)}</h2>
              </div>
              <button onClick={() => setCatModal(null)} className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">Close ×</button>
            </div>
            <p className="text-sm text-[var(--fg)] leading-relaxed">{catDescription(catModal)}</p>
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
                This will unblock this topic and make it available to students again. The topic will also be removed from the blocked topics list.
              </p>
            ) : (
              <div className="text-sm text-[var(--fg)] leading-relaxed mb-5">
                <p className="mb-2">Blocking this article will:</p>
                <ul className="list-disc pl-5 space-y-1 text-[var(--muted)]">
                  <li>Remove it from all students&apos; article feeds</li>
                  <li>Flag all reading level versions (L1–L5)</li>
                  <li>Add the topic to the blocked list so it won&apos;t be regenerated</li>
                </ul>
                <p className="mt-3">Use this for content that&apos;s inappropriate, inaccurate, or doesn&apos;t meet editorial standards.</p>
                {activeTopicCount === 1 && (
                  <p className="mt-3 text-amber-600 font-medium">⚠️ This is the last active article for today. Blocking it means students will only see older articles from their reading buffer.</p>
                )}
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

      {/* Today's topics */}
      {totalTopics > 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden mb-8">
          {topics.map((topic, i) => (
            <div key={topic.id} className={i < topics.length - 1 ? "border-b border-[var(--border)]" : ""}>
              <div
                className={`flex items-center hover:bg-gray-50 transition cursor-pointer ${topic.flagged ? "opacity-40" : ""}`}
                style={{ borderLeft: `3px solid ${catColor(topic.category)}` }}
                onClick={() => setExpandedTopic(expandedTopic === topic.id ? null : topic.id)}
              >
                <div className="flex-1 px-5 py-4 min-w-0">
                  <span className="font-medium text-base">{topic.topic}</span>
                </div>
                <div className="flex items-center gap-3 pr-5 shrink-0">
                  {topic.flagged && <span className="text-xs text-red-400">blocked</span>}
                  <button
                    onClick={(e) => handleFlagClick(e, topic)}
                    className={`p-1.5 transition ${topic.flagged ? "text-green-600 hover:text-green-800" : "text-[var(--muted)] hover:text-red-500"}`}
                    title={topic.flagged ? "Unblock topic" : "Block topic"}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
                    </svg>
                  </button>
                </div>
              </div>

              {expandedTopic === topic.id && (
                <div className="bg-gray-50/70 px-5 py-3" style={{ borderLeft: `3px solid ${catColor(topic.category)}` }}>
                  <div className="flex gap-1.5">
                    {topic.versions.map(v => (
                      <button
                        key={v.id}
                        onClick={() => openPreview(v.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition hover:border-[var(--accent)] hover:text-[var(--accent)] ${
                          v.flagged ? "opacity-40 border-red-200 text-red-400" : "border-[var(--border)] text-[var(--fg)] bg-white"
                        }`}
                      >
                        L{v.readingLevel}
                      </button>
                    ))}
                  </div>
                  {topic.source && (
                    topic.source.startsWith("http") ? (
                      <a href={topic.source} target="_blank" rel="noopener" className="block mt-2 text-[11px] text-blue-500 hover:underline truncate">
                        {(() => { try { return new URL(topic.source).hostname.replace("www.", ""); } catch { return topic.source; } })()}
                      </a>
                    ) : (
                      <span className="block mt-2 text-[11px] text-[var(--muted)]">{topic.source}</span>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-center mb-8">
          <p className="text-[var(--muted)]">No articles generated yet today.</p>
          <p className="text-xs text-[var(--muted)] mt-1">Morning batch runs at 5 AM CT.</p>
        </div>
      )}

      {/* Archive */}
      {archive.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-3 text-[var(--muted)]">Archive</h2>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            {archive.map((d, i) => (
              <div key={d.date} className={i < archive.length - 1 ? "border-b border-[var(--border)]" : ""}>
                <button
                  onClick={() => loadArchiveDate(d.date)}
                  className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition"
                >
                  <span className="text-sm">
                    {new Date(d.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  <div className="flex items-center gap-3">
                    {/* Category breakdown pills */}
                    {d.categories && (
                      <div className="flex gap-1">
                        {Object.entries(d.categories).sort(([a], [b]) => {
                          const order: Record<string, number> = { news: 0, interest: 1, general: 2 };
                          return (order[a] ?? 9) - (order[b] ?? 9);
                        }).map(([cat, cnt]) => (
                          <span
                            key={cat}
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: catColor(cat) + "20", color: catColor(cat) }}
                          >
                            {catLabel(cat)} {cnt}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="text-xs text-[var(--muted)]">{d.count} total</span>
                    <span className="text-xs text-[var(--muted)]">{expandedArchive === d.date ? "▾" : "›"}</span>
                  </div>
                </button>

                {expandedArchive === d.date && archiveArticles[d.date] && (
                  <div className="border-t border-[var(--border)] bg-gray-50/50">
                    {archiveArticles[d.date].map((a, j) => (
                      <div
                        key={a.id}
                        className={`px-4 py-2 flex items-center gap-3 ${j < archiveArticles[d.date].length - 1 ? "border-b border-[var(--border)]" : ""} ${a.flagged ? "opacity-40" : ""}`}
                        style={{ borderLeft: `3px solid ${catColor(a.category)}` }}
                      >
                        <span className="text-sm flex-1">{a.headline}</span>
                        {a.flagged && <span className="text-[10px] text-red-400">blocked</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Article Preview Modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-[700px] w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-[var(--border)] px-6 py-3 flex items-center justify-between rounded-t-2xl z-10">
              <span className="text-xs text-[var(--muted)] bg-gray-100 px-2 py-0.5 rounded">Level {preview.level}</span>
              <button onClick={() => setPreview(null)} className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition">Close ×</button>
            </div>
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
          </div>
        </div>
      )}
    </div>
  );
}
