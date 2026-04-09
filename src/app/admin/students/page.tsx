"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Guide {
  id: number;
  name: string;
}

interface AdminStudent {
  id: number;
  name: string;
  username: string;
  guideId: number;
  guideName: string;
  readingLevel: number | null;
  gradeLevel: number | null;
  age: number | null;
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
  const [filterGuide, setFilterGuide] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [loading, setLoading] = useState(true);
  const [guidesList, setGuidesList] = useState<Guide[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [newAge, setNewAge] = useState("");
  const [newGuideId, setNewGuideId] = useState("");
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  function loadStudents() {
    fetch("/api/admin/students").then(r => r.json()).then(data => {
      setStudents(data);
      setLoading(false);
    });
  }

  useEffect(() => {
    loadStudents();
    fetch("/api/admin/guides").then(r => r.json()).then(setGuidesList);
  }, []);

  useEffect(() => {
    let list = students;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q) || s.guideName.toLowerCase().includes(q));
    }
    if (filterGuide !== "all") list = list.filter(s => s.guideName === filterGuide);
    if (filterStatus !== "all") list = list.filter(s => s.status === filterStatus);

    const sorted = [...list];
    if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "score") sorted.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1));
    else if (sortBy === "sessions") sorted.sort((a, b) => b.sessionsThisWeek - a.sessionsThisWeek);
    else if (sortBy === "level") sorted.sort((a, b) => (a.readingLevel ?? 99) - (b.readingLevel ?? 99));
    else if (sortBy === "active") sorted.sort((a, b) => (b.lastActive || "").localeCompare(a.lastActive || ""));

    setFiltered(sorted);
  }, [search, students, filterGuide, filterStatus, sortBy]);

  const guides = [...new Set(students.map(s => s.guideName))];
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

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        username: newUsername,
        password: newPassword,
        gradeLevel: newGrade ? parseInt(newGrade) : undefined,
        age: newAge ? parseInt(newAge) : undefined,
        guideId: parseInt(newGuideId),
      }),
    });
    setShowAdd(false);
    setNewName(""); setNewUsername(""); setNewPassword("");
    setNewGrade(""); setNewAge(""); setNewGuideId("");
    setAdding(false);
    loadStudents();
  }

  async function handleImpersonate(id: number, role: "student" | "guide", guideId?: number) {
    const targetId = role === "guide" ? guideId : id;
    await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetId, role }),
    });
    router.push(role === "guide" ? "/guide" : "/student");
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">All Students ({students.length})</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="text-sm px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition">
          + Add Student
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addStudent} className="mb-6 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-3">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" required className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm outline-none focus:border-[var(--accent)]" />
          <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Username" required className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm outline-none focus:border-[var(--accent)]" />
          <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Password" required className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm outline-none focus:border-[var(--accent)]" />
          <div className="grid grid-cols-3 gap-3">
            <select value={newGrade} onChange={e => setNewGrade(e.target.value)} required className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-white outline-none focus:border-[var(--accent)]">
              <option value="">Grade</option>
              <option value="2">2nd</option>
              <option value="3">3rd</option>
              <option value="4">4th</option>
              <option value="5">5th</option>
              <option value="6">6th</option>
              <option value="7">7th</option>
              <option value="8">8th</option>
            </select>
            <input type="number" value={newAge} onChange={e => setNewAge(e.target.value)} placeholder="Age" min="5" max="18" required className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm outline-none focus:border-[var(--accent)]" />
            <select value={newGuideId} onChange={e => setNewGuideId(e.target.value)} required className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-white outline-none focus:border-[var(--accent)]">
              <option value="">Guide</option>
              {guidesList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={adding} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg disabled:opacity-50">
            {adding ? "Creating…" : "Create Student"}
          </button>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…" className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg outline-none focus:border-[var(--accent)] w-48"
        />
        <select value={filterGuide} onChange={(e) => setFilterGuide(e.target.value)} className="px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-white">
          <option value="all">All Guides</option>
          {guides.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
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
              <th className="px-4 py-3">Guide</th>
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
              <tr key={s.id} className="border-b border-[var(--border)] hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-[var(--muted)]">{s.username}</p>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{s.guideName}</td>
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
                      onClick={() => handleImpersonate(s.id, "student")}
                      className="text-xs px-2 py-1 border border-[var(--border)] rounded hover:bg-gray-100 transition"
                      title="View as student"
                    >
                      👁️
                    </button>
                    <button
                      onClick={() => router.push(`/guide/student/${s.id}`)}
                      className="text-xs px-2 py-1 border border-[var(--border)] rounded hover:bg-gray-100 transition"
                      title="Student detail"
                    >
                      📋
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
