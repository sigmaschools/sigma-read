"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface StarterProgress {
  ready: number;
  total: number;
  done: boolean;
}

/** The tutorial: shown after the interest chat, while the first articles are found or written */
const tutorialCards = [
  { emoji: "📚", title: "Articles picked for you", body: "Every day you'll get articles about things you like." },
  { emoji: "💬", title: "Then chat about it", body: "After you read, you'll chat with Sigma about it. It's not a test. The article stays open." },
  { emoji: "✨", title: "That's it", body: "Three articles a day. That's it." },
];

/** Tap-to-add ideas for students who aren't sure what to say */
const topicIdeas = ["Animals", "Space", "Sports", "Video games", "How things work", "History", "Art", "Cooking", "Weather", "Inventions"];

/** Stop waiting for the first articles after this long; the home page fills the feed from the cache */
const MAX_WAIT_MS = 150_000;
const POLL_MS = 3000;

export default function OnboardingPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>}>
      <OnboardingPage />
    </Suspense>
  );
}

function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?demo=true replays the cards from the menu; ?cards=1 resumes them while articles are still coming
  const isDemo = searchParams.get("demo") === "true";
  const cardsOnly = isDemo || searchParams.get("cards") === "1";

  const [phase, setPhase] = useState<"chat" | "cards">(cardsOnly ? "cards" : "chat");
  const [cardStep, setCardStep] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Set once the profile is saved: the chat is over, so sending stays off
  const [chatDone, setChatDone] = useState(false);
  const [progress, setProgress] = useState<StarterProgress | null>(null);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const startedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** Posts the conversation; returns the tutor's reply, or null after setting an error. */
  async function ask(convo: Message[]): Promise<{ message: string; profileComplete?: boolean } | null> {
    try {
      const res = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: convo, phase: "interest" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !(data?.message || data?.profileComplete)) {
        setError(data?.error || "Something went wrong. Please try again.");
        return null;
      }
      setError("");
      return data;
    } catch {
      setError("Couldn't reach SigmaRead. Check your connection and try again.");
      return null;
    }
  }

  async function startInterview() {
    setLoading(true);
    const data = await ask([{ role: "user", content: "Hi" }]);
    if (data) setMessages([{ role: "assistant", content: data.message }]);
    setLoading(false);
  }

  // The chat starts as soon as the page opens
  useEffect(() => {
    if (cardsOnly || startedRef.current) return;
    startedRef.current = true;
    startInterview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While the cards show, check how many first articles are ready
  useEffect(() => {
    if (phase !== "cards" || isDemo) return;
    let stopped = false;
    const started = Date.now();
    async function poll() {
      if (stopped) return;
      try {
        const res = await fetch("/api/onboarding/starter-status");
        if (res.ok) {
          const data: StarterProgress = await res.json();
          setProgress(data);
          if (data.done) return;
        }
      } catch {
        // Try again on the next tick
      }
      if (Date.now() - started > MAX_WAIT_MS) { setWaitedTooLong(true); return; }
      setTimeout(poll, POLL_MS);
    }
    poll();
    return () => { stopped = true; };
  }, [phase, isDemo]);

  async function handleSend() {
    if (!input.trim() || loading || chatDone || messages.length === 0) return;
    const userMessage = input.trim();
    setInput("");

    // The opening "Hi" is sent again so the server sees the same conversation it started
    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);
    setLoading(true);

    const data = await ask([{ role: "user", content: "Hi" }, ...newMessages]);
    if (!data) {
      // Put the message back so the student can resend it
      setMessages(messages);
      setInput(userMessage);
      setLoading(false);
      return;
    }

    setMessages(data.message ? [...newMessages, { role: "assistant", content: data.message }] : newMessages);
    if (data.profileComplete) setChatDone(true);
    setLoading(false);
  }

  // Long enough to read Sigma's one-line goodbye, then the cards
  useEffect(() => {
    if (!chatDone) return;
    const timer = setTimeout(() => setPhase("cards"), 1800);
    return () => clearTimeout(timer);
  }, [chatDone]);


  function addTopic(topic: string) {
    setInput(prev => {
      const parts = prev.split(",").map(p => p.trim()).filter(Boolean);
      if (parts.some(p => p.toLowerCase() === topic.toLowerCase())) return prev;
      return [...parts, topic].join(", ");
    });
  }

  // Tutorial cards
  if (phase === "cards") {
    const card = tutorialCards[cardStep];
    const last = cardStep === tutorialCards.length - 1;
    const articlesReady = isDemo || waitedTooLong || (progress?.done ?? false);
    const waiting = last && !articlesReady;

    function advance() {
      if (!last) setCardStep(cardStep + 1);
      else if (articlesReady) router.push("/student");
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6">
        <div className="max-w-sm w-full text-center">
          <div className="text-5xl mb-6">{card.emoji}</div>
          <h1 className="text-2xl font-semibold mb-3">{card.title}</h1>
          <p className="text-[var(--muted)] text-[16px] leading-relaxed mb-10">{card.body}</p>

          <button
            onClick={advance}
            disabled={waiting}
            className="w-full py-3 bg-[var(--accent)] text-white text-[15px] font-medium rounded-xl hover:bg-[var(--accent-hover)] transition disabled:opacity-60"
          >
            {!last ? "Next" : isDemo ? "Back to my articles" : waiting ? "Getting your articles ready…" : "Show me my articles"}
          </button>

          {waiting && (
            <p className="text-sm text-[var(--muted)] mt-3 flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              {progress && progress.ready > 0
                ? `${progress.ready} of ${progress.total} ready. This can take a minute.`
                : "Finding articles about what you like. This can take a minute."}
            </p>
          )}

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mt-6">
            {tutorialCards.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === cardStep ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Interest chat
  // Ideas to tap before the first answer, and again after a short answer like "idk" or "games"
  const lastAnswer = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
  const shortAnswer = lastAnswer.trim().split(/\s+/).length <= 2 && !lastAnswer.includes(",");
  const showIdeas = messages.length > 0 && (messages.length === 1 || shortAnswer) && !loading && !chatDone;
  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      <header className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">SigmaRead</h1>
          <p className="text-sm text-[var(--muted)]">Getting started</p>
        </div>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/login");
          }}
          className="text-xs text-[var(--muted)] hover:text-[var(--danger)] transition"
        >
          Logout
        </button>
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
        {error && !loading && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-[var(--danger)]">{error}</p>
            {messages.length === 0 && (
              <button
                onClick={startInterview}
                className="text-sm font-medium text-[var(--accent)] hover:underline"
              >
                Try again
              </button>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-6 py-4 border-t border-[var(--border)]">
        {showIdeas && (
          <div className="mb-3">
            <p className="text-xs text-[var(--muted)] mb-2">Not sure? Tap a few:</p>
            <div className="flex flex-wrap gap-2">
              {topicIdeas.map(topic => {
                const picked = input.toLowerCase().split(",").map(p => p.trim()).includes(topic.toLowerCase());
                return (
                  <button
                    key={topic}
                    onClick={() => addTopic(topic)}
                    className={`text-sm px-3 py-1.5 rounded-full border transition ${
                      picked
                        ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--fg)] hover:border-[var(--accent)]"
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type what you like…"
            className="flex-1 px-4 py-2.5 border border-[var(--border)] rounded-xl text-[15px] outline-none focus:border-[var(--accent)] transition"
            disabled={loading || chatDone || messages.length === 0}
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={loading || chatDone || messages.length === 0 || !input.trim()}
            className="px-5 py-2.5 bg-[var(--accent)] text-white text-sm font-medium rounded-xl hover:bg-[var(--accent-hover)] transition disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
