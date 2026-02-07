"use client";

import { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const maxTurns = 4;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Start conversation with AI opener
  useEffect(() => {
    setLoading(true);
    fetch(`/api/conversations/${id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "I just finished reading the article." }),
    })
      .then((r) => r.json())
      .then((data) => {
        setMessages([
          { role: "assistant", content: data.message },
        ]);
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

      if (data.complete) {
        setComplete(true);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
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
        {!complete && (
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((step) => (
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
            {!selfAssessment && (
              <div className="text-center">
                <p className="text-sm text-[var(--muted)] mb-3">How well do you think you understood this article?</p>
                <div className="flex gap-2 justify-center">
                  {[
                    { value: "really_well", label: "Really well" },
                    { value: "pretty_well", label: "Pretty well" },
                    { value: "not_sure", label: "Not sure" },
                    { value: "lost", label: "I was lost" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={async () => {
                        setSelfAssessment(opt.value);
                        await fetch(`/api/conversations/${id}/self-assess`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ assessment: opt.value }),
                        });
                      }}
                      className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selfAssessment && (
              <p className="text-center text-sm text-[var(--muted)]">Thanks for sharing! 👍</p>
            )}
            <button
              onClick={() => router.push("/student")}
              className="w-full py-3 bg-[var(--accent)] text-white text-[15px] font-medium rounded-xl hover:bg-[var(--accent-hover)] transition"
            >
              Back to Home
            </button>
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
  );
}
