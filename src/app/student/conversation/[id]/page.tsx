"use client";

import { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ArticleData {
  title: string;
  topic: string;
  bodyText: string;
}

export default function ConversationPage() {
  const { id } = useParams();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState(false);
  const [selfAssessment, setSelfAssessment] = useState<string | null>(null);
  const [studentTurnCount, setStudentTurnCount] = useState(0);
  const [showArticle, setShowArticle] = useState(false);
  const [article, setArticle] = useState<ArticleData | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const maxTurns = 3;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load article data
  useEffect(() => {
    fetch(`/api/conversations/${id}/article`).then(r => r.json()).then(data => {
      if (!data.error) setArticle(data);
    });
  }, [id]);

  // Start or resume conversation
  useEffect(() => {
    setLoading(true);
    fetch(`/api/conversations/${id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "__resume_check__" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.existingMessages && data.existingMessages.length > 0) {
          setMessages(data.existingMessages);
          setStudentTurnCount(data.existingMessages.filter((m: Message) => m.role === "user").length);
          if (data.complete) setComplete(true);
        } else {
          setMessages([{ role: "assistant", content: data.message }]);
        }
        setLoading(false);
      });
  }, [id]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setStudentTurnCount((prev) => prev + 1);
    setLoading(true);

    try {
      const res = await fetch(`/api/conversations/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      if (data.complete) setComplete(true);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleSelfAssess(value: string) {
    setSelfAssessment(value);
    await fetch(`/api/conversations/${id}/self-assess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessment: value }),
    });
    setTimeout(() => router.push("/student"), 1200);
  }

  function renderArticleBody(text: string) {
    return text.replace(/^#+\s.*\n*/gm, "").trim().split("\n\n").map((para, i) => (
      <p key={i} className="mb-4 text-[15px] leading-relaxed">{para}</p>
    ));
  }

  return (
    <div className="flex h-screen">
      {/* Article Panel */}
      {showArticle && article && (
        <div className="w-[420px] border-r border-[var(--border)] flex flex-col bg-white flex-shrink-0">
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <h2 className="text-sm font-semibold">Article</h2>
            <button
              onClick={() => setShowArticle(false)}
              className="text-[var(--muted)] hover:text-[var(--fg)] text-lg transition"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <h3 className="text-lg font-semibold mb-1">{article.title}</h3>
            <p className="text-xs text-[var(--muted)] mb-5">{article.topic}</p>
            {renderArticleBody(article.bodyText)}
          </div>
        </div>
      )}

      {/* Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/student")} className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition">
              ← Back
            </button>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Let&apos;s talk about it</h1>
              <p className="text-sm text-[var(--muted)]">Tell me what you thought of the article</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowArticle(!showArticle)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition ${
                showArticle
                  ? "border-[var(--accent)] text-[var(--accent)] bg-blue-50"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--accent)]"
              }`}
            >
              📖 Article
            </button>
            {!complete && (
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={`w-2 h-2 rounded-full transition-all ${
                      studentTurnCount >= step
                        ? "bg-[var(--accent)]"
                        : studentTurnCount === step - 1
                        ? "bg-[var(--accent)] opacity-40"
                        : "bg-[var(--border)]"
                    }`}
                  />
                ))}
                <span className="text-xs text-[var(--muted)] ml-1">
                  {studentTurnCount < maxTurns ? `${studentTurnCount}/${maxTurns}` : "Done!"}
                </span>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[var(--accent)] text-white rounded-br-md"
                    : "bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)] rounded-bl-md"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && !complete && (
            <div className="flex justify-start">
              <div className="px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl rounded-bl-md">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-6 py-4 border-t border-[var(--border)]">
          {complete ? (
            <div className="space-y-4">
              {!selfAssessment ? (
                <div className="text-center">
                  <p className="text-[15px] font-medium text-[var(--fg)] mb-4">How well do you think you understood this article?</p>
                  <div className="flex gap-3 justify-center">
                    {[
                      { value: "really_well", label: "Really well", bg: "bg-green-500 hover:bg-green-600" },
                      { value: "pretty_well", label: "Pretty well", bg: "bg-blue-500 hover:bg-blue-600" },
                      { value: "not_sure", label: "Not sure", bg: "bg-amber-500 hover:bg-amber-600" },
                      { value: "lost", label: "I was lost", bg: "bg-red-400 hover:bg-red-500" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleSelfAssess(opt.value)}
                        className={`px-5 py-2.5 text-sm font-medium text-white rounded-xl shadow-sm transition ${opt.bg}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-3">Click to finish</p>
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-sm font-medium text-[var(--fg)]">Thanks! 👍</p>
                  <p className="text-xs text-[var(--muted)] mt-1">Taking you back…</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type your response…"
                className="flex-1 px-4 py-2.5 border border-[var(--border)] rounded-xl text-[15px] outline-none focus:border-[var(--accent)] transition"
                disabled={loading}
                autoFocus
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="px-5 py-2.5 bg-[var(--accent)] text-white text-sm font-medium rounded-xl hover:bg-[var(--accent-hover)] transition disabled:opacity-40"
              >
                Send
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
