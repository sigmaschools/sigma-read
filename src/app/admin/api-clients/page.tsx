"use client";

import { useState, useEffect } from "react";

interface ApiClientRow {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  guideId: number | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface Guide { id: number; name: string }

const SCOPES = [
  { value: "students:read", label: "Students", hint: "names, grade, level, guide, activity" },
  { value: "reports:read", label: "Reports", hint: "sessions, scores, skills, report text" },
  { value: "transcripts:read", label: "Transcripts", hint: "full conversations (needs Reports)" },
];

const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " CT"
  : "—";

export default function AdminApiClientsPage() {
  const [clients, setClients] = useState<ApiClientRow[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["students:read", "reports:read"]);
  const [guideId, setGuideId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);

  function load() {
    fetch("/api/admin/api-clients").then(r => r.json()).then(d => { setClients(Array.isArray(d) ? d : []); setLoading(false); });
  }

  useEffect(() => {
    load();
    fetch("/api/admin/guides").then(r => r.json()).then(d => setGuides(Array.isArray(d) ? d : []));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/api-clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, scopes, guideId: guideId || null }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(data.error || "Couldn't create the key"); return; }
    setNewKey({ name, key: data.key });
    setName("");
    load();
  }

  async function revoke(c: ApiClientRow) {
    if (!confirm(`Revoke the key for ${c.name}? Anything using it stops working right away.`)) return;
    const res = await fetch(`/api/admin/api-clients/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Couldn't revoke the key");
    }
    load();
  }

  function toggleScope(value: string) {
    setScopes(prev => prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value]);
  }

  const guideName = (id: number | null) => id === null ? "All students" : guides.find(g => g.id === id)?.name ?? `Guide #${id}`;

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-1">API Keys</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Keys for the read-only API at <code>/api/v1</code> (spec at <a className="text-[var(--accent)] hover:underline" href="/api/v1/openapi.json">/api/v1/openapi.json</a>). Every call is logged.
      </p>

      {newKey && (
        <div className="mb-6 p-4 border border-amber-300 bg-amber-50 rounded-xl space-y-2">
          <p className="text-sm font-medium">Key for {newKey.name}. Copy it now: it won&apos;t be shown again.</p>
          <code className="block text-sm break-all bg-white border border-[var(--border)] rounded-lg px-3 py-2 select-all">{newKey.key}</code>
          <button onClick={() => setNewKey(null)} className="text-xs text-[var(--muted)] hover:text-[var(--fg)]">I&apos;ve saved it</button>
        </div>
      )}

      <form onSubmit={create} className="mb-8 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Client name, e.g. Compass production" required maxLength={100}
            className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-white outline-none focus:border-[var(--accent)]" />
          <select value={guideId} onChange={e => setGuideId(e.target.value)} className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-white outline-none focus:border-[var(--accent)]">
            <option value="">All students</option>
            {guides.map(g => <option key={g.id} value={g.id}>Only {g.name}&apos;s students</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {SCOPES.map(s => (
            <label key={s.value} className="flex items-center gap-1.5" title={s.hint}>
              <input type="checkbox" checked={scopes.includes(s.value)} onChange={() => toggleScope(s.value)} />
              {s.label} <span className="text-xs text-[var(--muted)]">({s.hint})</span>
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg disabled:opacity-50">
          {saving ? "Creating…" : "Create key"}
        </button>
      </form>

      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : clients.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No keys yet.</p>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)] uppercase tracking-wider border-b border-[var(--border)]">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Scopes</th>
                <th className="px-4 py-3">Sees</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} className={`border-b border-[var(--border)] last:border-0 ${c.revokedAt ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-[var(--muted)]"><code>{c.keyPrefix}…</code> · created {when(c.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">{c.scopes.join(", ")}</td>
                  <td className="px-4 py-3 text-xs">{guideName(c.guideId)}</td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">{when(c.lastUsedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {c.revokedAt
                      ? <span className="text-xs text-[var(--muted)]">Revoked {when(c.revokedAt)}</span>
                      : <button onClick={() => revoke(c)} className="text-xs text-[var(--danger)] hover:underline">Revoke</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
