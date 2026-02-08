"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      if (data.role === "guide") {
        router.push("/guide");
      } else if (data.role === "student") {
        if (!data.onboardingComplete) {
          router.push("/student/onboarding");
        } else {
          router.push("/student");
        }
      }
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8 tracking-tight">SigmaRead</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">Username or Email</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border-[1.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-[15px] outline-none focus:border-[var(--accent)] transition bg-[var(--surface)]"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border-[1.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-[15px] outline-none focus:border-[var(--accent)] transition bg-[var(--surface)]"
              required
            />
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[var(--accent)] text-white text-[15px] font-semibold rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] transition disabled:opacity-50 mt-2"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
