"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function OnboardingPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"interest" | "level">("interest");
  const [started, setStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Start the conversation
  useEffect(() => {
    if (started) return;
    setStarted(true);
    setLoading(true);

    fetch("/api/onboarding/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hi! I'm ready to get started." }], phase: "interest" }),
    })
      .then((r) => r.json())
      .then((data) => {
        setMessages([
          { role: "user", content: "Hi! I'm ready to get started." },
          { role: "assistant", content: data.message },
        ]);
        setLoading(false);
      });
  }, [started]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");

    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, phase }),
      });
      const data = await res.json();

      setMessages([...newMessages, { role: "assistant", content: data.message }]);

      if (data.profileComplete && phase === "interest") {
        // Transition to level assessment
        setTimeout(async () => {
          setPhase("level");
          const levelMessages: Message[] = [{ role: "user", content: "I'm ready for the next part." }];
          setLoading(true);

          const levelRes = await fetch("/api/onboarding/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: levelMessages, phase: "level" }),
          });
          const levelData = await levelRes.json();
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "---" },
            { role: "assistant", content: levelData.message },
          ]);
          setLoading(false);
        }, 1500);
        return;
      }

      if (data.levelComplete) {
        setTimeout(() => router.push("/student"), 2000);
        return;
      }

      setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      <header className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">SigmaRead</h1>
          <p className="text-sm text-[var(--muted)]">
            {phase === "interest" ? "Getting to know you" : "Finding your reading level"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/student")}
            className="text-xs text-[var(--muted)] hover:text-[var(--fg)] transition"
          >
            Skip for now
          </button>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
            }}
            className="text-xs text-[var(--muted)] hover:text-[var(--danger)] transition"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.map((msg, i) => {
          if (msg.content === "---") {
            return <div key={i} className="border-t border-[var(--border)] my-4" />;
          }
          return (
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
          );
        })}
        {loading && (
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
      </div>
    </div>
  );
}
