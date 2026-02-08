"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const walkthroughSteps = [
  {
    emoji: "📚",
    title: "Welcome to SigmaRead",
    body: "You'll read short articles about topics you're interested in. We pick articles just for you.",
  },
  {
    emoji: "💬",
    title: "Then we'll discuss it",
    body: "After reading, you'll have a quick discussion about the article. It's not a test — the article stays open so you can look back at it anytime.",
  },
  {
    emoji: "✨",
    title: "That's it!",
    body: "Pick an article, read it, discuss it. Ready? Let's start by learning what you're into.",
  },
];

export default function OnboardingPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>}>
      <OnboardingPage />
    </Suspense>
  );
}

function OnboardingPage() {
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const [walkthroughDone, setWalkthroughDone] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!walkthroughDone || started) return;
    setStarted(true);
    setLoading(true);

    fetch("/api/onboarding/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }], phase: "interest" }),
    })
      .then((r) => r.json())
      .then((data) => {
        setMessages([{ role: "assistant", content: data.message }]);
        setLoading(false);
      });
  }, [walkthroughDone, started]);

  function advanceWalkthrough() {
    if (walkthroughStep < walkthroughSteps.length - 1) {
      setWalkthroughStep(walkthroughStep + 1);
    } else if (isDemo) {
      // Demo mode: just go back to student home
      router.push("/student");
    } else {
      setWalkthroughDone(true);
    }
  }

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
        body: JSON.stringify({ messages: newMessages, phase: "interest" }),
      });
      const data = await res.json();

      setMessages([...newMessages, { role: "assistant", content: data.message }]);

      if (data.profileComplete) {
        setTimeout(() => router.push("/student"), 1500);
        return;
      }

      setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  // Walkthrough screens
  if (!walkthroughDone) {
    const step = walkthroughSteps[walkthroughStep];
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6">
        <div className="max-w-sm w-full text-center">
          <div className="text-5xl mb-6">{step.emoji}</div>
          <h1 className="text-2xl font-semibold mb-3">{step.title}</h1>
          <p className="text-[var(--muted)] text-[16px] leading-relaxed mb-10">{step.body}</p>

          <button
            onClick={advanceWalkthrough}
            className="w-full py-3 bg-[var(--accent)] text-white text-[15px] font-medium rounded-xl hover:bg-[var(--accent-hover)] transition"
          >
            {walkthroughStep < walkthroughSteps.length - 1 ? "Next" : "Let's go"}
          </button>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mt-6">
            {walkthroughSteps.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === walkthroughStep ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Interest interview
  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      <header className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">SigmaRead</h1>
          <p className="text-sm text-[var(--muted)]">Getting started</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/student")}
            className="text-xs text-[var(--muted)] hover:text-[var(--fg)] transition"
          >
            Skip
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
