"use client";

import { useEffect, useState } from "react";

/** One sign-in per page load, shared by both runs of the effect in development's Strict Mode */
let signingIn: Promise<State> | null = null;

type State = "checking" | "ready" | "not_linked";

/** A note was there and signed nobody in: nobody stays signed in from before */
function signOut(): Promise<State> {
  return fetch("/api/auth/logout", { method: "POST" }).then((): State => "ready", (): State => "ready");
}

/** What each kind of page reads from the address, where it posts it, and what it says when the note opens nothing */
const kinds = {
  student: { param: "compass_profile", endpoint: "/api/auth/compass", refused: 404, refusedError: "not_linked", title: "Sigma Read isn't ready for you yet", body: "Ask a grown-up to set it up for you in Compass." },
  admin: { param: "compass_adult", endpoint: "/api/auth/compass-admin", refused: 403, refusedError: "not_admin", title: "You are not a Sigma Read admin", body: "Ask whoever runs Sigma Read to add you." },
} as const;

/**
 * Signs the student in from Compass before the page underneath loads anything.
 *
 * Compass opens SigmaRead with `#compass_profile=<note>` after the address (app contract 1.1), and
 * Compass Admin opens the admin pages with `#compass_adult=<note>` (contract 1.2, kind "admin").
 * When the note is there, the gate posts it to /api/auth/compass, takes it out of the address,
 * and only then shows the page, so the page's own requests already carry the session.
 * Without a note the page shows at once.
 *
 * The hidden level report stays inside the gate on purpose: outside it, it could be fetched
 * with the previous student's session on a shared device and report the wrong student's level.
 */
export default function CompassGate({ children, kind = "student" }: { children: React.ReactNode; kind?: keyof typeof kinds }) {
  const k = kinds[kind];
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    if (!signingIn) {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const note = hash.get(k.param);
      if (!note) { setState("ready"); return; }

      // The note never stays in the address: not in history, not in a copied link
      hash.delete(k.param);
      const rest = hash.toString();
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search + (rest ? `#${rest}` : ""));

      // Never longer than 8 s on the spinner: a slow answer falls back to the page as it was
      // (AbortController and setTimeout rather than AbortSignal.timeout, which older iPads lack)
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), 8000);
      signingIn = fetch(k.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
        signal: stop.signal,
      })
        .then((res): State | Promise<State> => {
          if (res.ok) return "ready";
          if (res.status === k.refused) {
            return res.json().then((b: { error?: string }): State | Promise<State> => (b?.error === k.refusedError ? "not_linked" : signOut()), signOut);
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
          <p className="text-lg font-semibold">{k.title}</p>
          <p className="text-sm text-[var(--muted)] mt-2">{k.body}</p>
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
