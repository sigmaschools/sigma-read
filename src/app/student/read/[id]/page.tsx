"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

interface Article {
  id: number;
  title: string;
  topic: string;
  bodyText: string;
  sources: string[];
  estimatedReadTime: number;
  read: boolean;
}

export default function ReaderPage() {
  const { id } = useParams();
  const router = useRouter();
  const [article, setArticle] = useState<Article | null>(null);
  const [fontSize, setFontSize] = useState(18);
  const [definition, setDefinition] = useState<{ word: string; text: string } | null>(null);
  const [defLoading, setDefLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/articles/${id}`).then((r) => r.json()).then(setArticle);
  }, [id]);

  const handleWordClick = useCallback(async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== "SPAN" || !target.dataset.word) return;

    const word = target.dataset.word;
    const sentence = target.closest("p")?.textContent || "";

    setDefLoading(true);
    setDefinition({ word, text: "" });

    const res = await fetch(`/api/articles/${id}/define`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, sentence }),
    });
    const data = await res.json();
    setDefinition({ word, text: data.definition });
    setDefLoading(false);
  }, [id]);

  function renderBody(text: string) {
    // Split into paragraphs and wrap each word in a span for click-to-define
    return text.split("\n\n").map((para, i) => {
      if (para.startsWith("## ") || para.startsWith("### ")) {
        const level = para.startsWith("### ") ? "h3" : "h2";
        const content = para.replace(/^#{2,3}\s/, "");
        const Tag = level;
        return <Tag key={i} className="font-semibold text-lg mt-6 mb-2">{content}</Tag>;
      }
      const words = para.split(/(\s+)/);
      return (
        <p key={i} className="mb-5">
          {words.map((w, j) =>
            /^\s+$/.test(w) ? (
              <span key={j}>{w}</span>
            ) : (
              <span
                key={j}
                data-word={w.replace(/[^a-zA-Z'-]/g, "")}
                className="cursor-pointer hover:bg-blue-50 hover:text-[var(--accent)] rounded transition-colors"
              >
                {w}
              </span>
            )
          )}
        </p>
      );
    });
  }

  async function handleDoneReading() {
    // Mark as read and start conversation
    await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    });

    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: parseInt(id as string) }),
    });
    const data = await res.json();
    router.push(`/student/conversation/${data.conversationId}`);
  }

  if (!article) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="sticky top-0 bg-white/95 backdrop-blur border-b border-[var(--border)] px-6 py-3 flex items-center justify-between z-10">
        <button onClick={() => router.push("/student")} className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition">
          ← Back
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--muted)]">{article.estimatedReadTime} min read</span>
          <div className="flex items-center gap-1 border border-[var(--border)] rounded-lg overflow-hidden">
            <button
              onClick={() => setFontSize((s) => Math.max(14, s - 2))}
              className="px-2 py-1 text-xs hover:bg-[var(--surface-hover)] transition"
            >
              A−
            </button>
            <button
              onClick={() => setFontSize((s) => Math.min(24, s + 2))}
              className="px-2 py-1 text-xs hover:bg-[var(--surface-hover)] transition"
            >
              A+
            </button>
          </div>
        </div>
      </header>

      {/* Article */}
      <article className="max-w-[640px] mx-auto px-6 py-10" onClick={handleWordClick}>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">{article.title}</h1>
        <p className="text-sm text-[var(--muted)] mb-8">{article.topic}</p>
        <div className="reader-body" style={{ fontSize: `${fontSize}px` }}>
          {renderBody(article.bodyText)}
        </div>

        {article.sources && article.sources.length > 0 && (
          <div className="mt-8 pt-6 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--muted)]">
              Sources: {article.sources.join(", ")}
            </p>
          </div>
        )}

        <div className="mt-12 text-center">
          <button
            onClick={handleDoneReading}
            className="px-8 py-3 bg-[var(--accent)] text-white text-[15px] font-medium rounded-xl hover:bg-[var(--accent-hover)] transition"
          >
            Done Reading — Talk About It
          </button>
        </div>
      </article>

      {/* Definition popover */}
      {definition && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--fg)] text-white px-5 py-3 rounded-2xl shadow-lg max-w-sm z-50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="font-semibold">{definition.word}</span>
              {defLoading ? (
                <p className="text-sm text-gray-300 mt-1">Looking up…</p>
              ) : (
                <p className="text-sm text-gray-200 mt-1">{definition.text}</p>
              )}
            </div>
            <button onClick={() => setDefinition(null)} className="text-gray-400 hover:text-white text-lg">×</button>
          </div>
        </div>
      )}
    </div>
  );
}
