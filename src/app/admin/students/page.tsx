"use client";

import { Fragment, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface AdminStudent {
  id: number;
  name: string;
  readingLevel: number | null;
  gradeLevel: number | null;
  dailyArticleCap: number | null;
  externalId: string | null;
  onboardingComplete: boolean;
  totalSessionsCompleted: number;
  avgScore: number | null;
  sessionsThisWeek: number;
  lastActive: string | null;
  status: string;
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [filtered, setFiltered] = useState<AdminStudent[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const router = useRouter();

  function loadStudents() {
    fetch("/api/admin/students").then(r => r.json()).then(data => {
      setStudents(data);
      setLoading(false);
    });
  }

  useEffect(() => {
    loadStudents();
  }, []);

  useEffect(() => {
    let list = students;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }
    if (filterStatus !== "all") list = list.filter(s => s.status === filterStatus);

    const sorted = [...list];
    if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "score") sorted.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1));
    else if (sortBy === "sessions") sorted.sort((a, b) => b.sessionsThisWeek - a.sessionsThisWeek);
    else if (sortBy === "level") sorted.sort((a, b) => (a.readingLevel ?? 99) - (b.readingLevel ?? 99));
    else if (sortBy === "active") sorted.sort((a, b) => (b.lastActive || "").localeCompare(a.lastActive || ""));

    setFiltered(sorted);
  }, [search, students, filterStatus, sortBy]);

  const statusColor = (s: string) => {
    if (s === "succeeding") return "bg-green-100 text-green-700";
    if (s === "on-track") return "bg-blue-100 text-blue-700";
    if (s === "struggling") return "bg-red-100 text-red-700";
    if (s === "inactive") return "bg-gray-100 text-gray-600";
    return "bg-gray-100 text-gray-500";
  };
  const scoreColor = (s: number | null) => {
    if (s === null) return "text-[var(--muted)]";
    if (s >= 80) return "text-green-600";
    if (s >= 60) return "text-blue-600";
    if (s >= 45) return "text-yellow-600";
    return "text-red-500";
  };

  async function handleImpersonate(id: number) {
    await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, role: "student" }),
    });
    router.push("/student");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">All Students ({students.length})</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Students are added in Compass. A student appears here the first time Compass opens Sigma Read for them, with the name and grade Compass has.</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…" className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg outline-none focus:border-[var(--accent)] w-48"
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-white">
          <option value="all">All Status</option>
          <option value="succeeding">Succeeding</option>
          <option value="on-track">On Track</option>
          <option value="struggling">Struggling</option>
          <option value="inactive">Inactive</option>
          <option value="new">New</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-white">
          <option value="name">Sort: Name</option>
          <option value="score">Sort: Score</option>
          <option value="sessions">Sort: Sessions</option>
          <option value="level">Sort: Level</option>
          <option value="active">Sort: Last Active</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--muted)] uppercase tracking-wider border-b border-[var(--border)]">
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3">This Week</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Avg Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Active</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <Fragment key={s.id}>
              <tr className="border-b border-[var(--border)] hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <p className="font-medium">{s.name}</p>
                  {!s.externalId && <p className="text-xs text-[var(--muted)]">Not in Compass</p>}
                </td>
                <td className="px-4 py-3">{s.readingLevel ? `L${s.readingLevel}` : "—"}</td>
                <td className="px-4 py-3">{s.gradeLevel ? `Gr ${s.gradeLevel}` : "—"}</td>
                <td className="px-4 py-3">{s.sessionsThisWeek}</td>
                <td className="px-4 py-3">{s.totalSessionsCompleted}</td>
                <td className={`px-4 py-3 font-semibold ${scoreColor(s.avgScore)}`}>{s.avgScore ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(s.status)}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {s.lastActive ? new Date(s.lastActive).toLocaleDateString() : "Never"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleImpersonate(s.id)}
                      className="text-xs px-2 py-1 border border-[var(--border)] rounded hover:bg-gray-100 transition"
                      title="View as student"
                    >
                      👁️
                    </button>
                    <button
                      onClick={() => router.push(`/admin/students/${s.id}`)}
                      className="text-xs px-2 py-1 border border-[var(--border)] rounded hover:bg-gray-100 transition"
                      title="Student detail"
                    >
                      📋
                    </button>
                    <button
                      onClick={() => setEditingId(editingId === s.id ? null : s.id)}
                      className="text-xs px-2 py-1 border border-[var(--border)] rounded hover:bg-gray-100 transition"
                      title="Edit student"
                    >
                      ✏️
                    </button>
                  </div>
                </td>
              </tr>
              {editingId === s.id && (
                <tr className="border-b border-[var(--border)]">
                  <td colSpan={9} className="px-4 py-4 bg-white">
                    <EditStudent
                      student={s}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => { setEditingId(null); loadStudents(); }}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputClass = "w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-white outline-none focus:border-[var(--accent)]";

function EditStudent({ student, onCancel, onSaved }: {
  student: AdminStudent;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
  const [readingLevel, setReadingLevel] = useState(str(student.readingLevel));
  const [dailyArticleCap, setDailyArticleCap] = useState(str(student.dailyArticleCap ?? 5));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const levelChanging = readingLevel !== "" && readingLevel !== str(student.readingLevel);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (levelChanging && !confirm(`Change ${student.name}'s level to L${readingLevel}? This resets their level mix and restarts the evaluation window.`)) return;
    setSaving(true);
    setError("");
    // Send only what the admin changed, so saving never rewrites untouched settings
    const body: Record<string, unknown> = {};
    if (dailyArticleCap !== str(student.dailyArticleCap ?? 5)) body.dailyArticleCap = Number(dailyArticleCap);
    if (levelChanging) body.readingLevel = Number(readingLevel);
    if (Object.keys(body).length === 0) { onCancel(); return; }
    try {
      const res = await fetch(`/api/admin/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Couldn't save"); setSaving(false); return; }
      onSaved();
    } catch {
      setError("Couldn't save");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <p className="text-xs text-[var(--muted)]">Name and grade come from Compass and are changed there. These are Sigma Read's own reading settings.</p>
      <div className="grid grid-cols-4 gap-3">
        <label className="text-xs text-[var(--muted)] space-y-1">
          <span>Reading level</span>
          <select value={readingLevel} onChange={e => setReadingLevel(e.target.value)} className={inputClass}>
            {student.readingLevel === null && <option value="">Not assessed</option>}
            {[1, 2, 3, 4, 5, 6].map(l => <option key={l} value={l}>L{l}</option>)}
          </select>
        </label>
        <label className="text-xs text-[var(--muted)] space-y-1">
          <span>Articles per day</span>
          <input type="number" min="1" max="20" value={dailyArticleCap} onChange={e => setDailyArticleCap(e.target.value)} required className={inputClass} />
        </label>
      </div>
      {levelChanging && (
        <p className="text-xs text-amber-700">Changing the level resets the level mix and restarts the evaluation window.</p>
      )}
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg">Cancel</button>
      </div>
    </form>
  );
}
