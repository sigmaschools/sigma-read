"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddStudentPage() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [age, setAge] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        username,
        password,
        gradeLevel: gradeLevel ? parseInt(gradeLevel) : undefined,
        age: age ? parseInt(age) : undefined,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to create student");
      setLoading(false);
      return;
    }

    router.push("/guide");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <button onClick={() => router.push("/guide")} className="text-sm text-[var(--muted)] hover:text-[var(--fg)] mb-6 block">
          ← Back
        </button>
        <h1 className="text-xl font-semibold mb-6">Add Student</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--muted)] mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emma Chen"
              className="w-full px-3 py-2.5 border border-[var(--border)] rounded-lg text-[15px] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--muted)] mb-1">Grade</label>
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--border)] rounded-lg text-[15px] outline-none focus:border-[var(--accent)] transition bg-white"
                required
              >
                <option value="">Select</option>
                <option value="2">2nd</option>
                <option value="3">3rd</option>
                <option value="4">4th</option>
                <option value="5">5th</option>
                <option value="6">6th</option>
                <option value="7">7th</option>
                <option value="8">8th</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--muted)] mb-1">Age</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min="5"
                max="18"
                placeholder="10"
                className="w-full px-3 py-2.5 border border-[var(--border)] rounded-lg text-[15px] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--muted)] mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 border border-[var(--border)] rounded-lg text-[15px] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--muted)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-[var(--border)] rounded-lg text-[15px] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition"
              required
            />
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[var(--accent)] text-white text-[15px] font-medium rounded-lg hover:bg-[var(--accent-hover)] transition disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create Student"}
          </button>
        </form>
      </div>
    </div>
  );
}
