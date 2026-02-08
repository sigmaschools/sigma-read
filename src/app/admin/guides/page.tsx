"use client";

import { useState, useEffect } from "react";

interface Guide {
  id: number;
  name: string;
  email: string;
  studentCount: number;
  createdAt: string;
}

export default function AdminGuidesPage() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => { loadGuides(); }, []);

  async function loadGuides() {
    const res = await fetch("/api/admin/guides");
    setGuides(await res.json());
    setLoading(false);
  }

  async function addGuide(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    await fetch("/api/admin/guides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, email: newEmail, password: newPassword }),
    });
    setShowAdd(false);
    setNewName(""); setNewEmail(""); setNewPassword("");
    setAdding(false);
    loadGuides();
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Guides ({guides.length})</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="text-sm px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition">
          + Add Guide
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addGuide} className="mb-6 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-3">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" required className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm outline-none focus:border-[var(--accent)]" />
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email" required className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm outline-none focus:border-[var(--accent)]" />
          <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Password" required className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm outline-none focus:border-[var(--accent)]" />
          <button type="submit" disabled={adding} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg disabled:opacity-50">
            {adding ? "Creating…" : "Create Guide"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {guides.map(g => (
          <div key={g.id} className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex items-center justify-between">
            <div>
              <p className="font-medium">{g.name}</p>
              <p className="text-sm text-[var(--muted)]">{g.email}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold">{g.studentCount}</p>
              <p className="text-xs text-[var(--muted)]">students</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
