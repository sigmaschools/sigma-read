"use client";

import { useEffect, useState } from "react";

/** One sign-in per page load, shared by both runs of the effect in development's Strict Mode */
let signingIn: Promise<State> | null = null;

type State = "checking" | "ready" | "not_linked";

/** A note was there and signed nobody in: nobody stays signed in from before */
function signOut(): Promise<State> {
  return fetch("/api/auth/logout", { method: "POST" }).then((): State => "ready", (): State => "ready");
}

/**
 * Signs the student in from Compass before the page underneath loads anything.
 *
 * Compass opens SigmaRead with `#compass_profile=<note>` after the address (app contract 1.1).
 * When the note is there, the gate posts it to /api/auth/compass, takes it out of the address,
 * and only then shows the page, so the page's own requests already carry the session.
 * Without a note the page shows at once.
 *
 * The hidden level report stays inside the gate on purpose: outside it, it could be fetched
 * with the previous student's session on a shared device and report the wrong student's level.
 */
export default function CompassGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    if (!signingIn) {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const note = hash.get("compass_profile");
      if (!note) { setState("ready"); return; }

      // The note never stays in the address: not in history, not in a copied link
      hash.delete("compass_profile");
      const rest = hash.toString();
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search + (rest ? `#${rest}` : ""));

      // Never longer than 8 s on the spinner: a slow answer falls back to the page as it was
      // (AbortController and setTimeout rather than AbortSignal.timeout, which older iPads lack)
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), 8000);
      signingIn = fetch("/api/auth/compass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
        signal: stop.signal,
      })
        .then((res): State | Promise<State> => {
          if (res.ok) return "ready";
          if (res.status === 404) {
            return res.json().then((b: { error?: string }): State | Promise<State> => (b?.error === "not_linked" ? "not_linked" : signOut()), signOut);
          }
          return signOut();
        })
        // No answer in time: sign out whoever was here before, so the page never shows them
        .catch(signOut)
        .finally(() => clearTimeout(timer));
    }
    let live = true;
    signingIn.then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, []);

  if (state === "ready") return <>{children}</>;
  if (state === "not_linked") {
    return (
      <div className="flex items-center justify-center min-h-screen px-6">
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold">Sigma Read isn&apos;t ready for you yet</p>
          <p className="text-sm text-[var(--muted)] mt-2">Ask a grown-up to set it up for you in Compass.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
