"use client";

import { useState, useEffect } from "react";

interface Student {
  id: number;
  name: string;
}

interface ParentRecord {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  students: { studentId: number; studentName: string; relationship: string | null }[];
}

export default function AdminParentsPage() {
  const [parents, setParents] = useState<ParentRecord[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [relationship, setRelationship] = useState("parent");
  const [adding, setAdding] = useState(false);

  useEffect(() => { loadParents(); loadStudents(); }, []);

  async function loadParents() {
    const res = await fetch("/api/admin/parents");
    setParents(await res.json());
    setLoading(false);
  }

  async function loadStudents() {
    const res = await fetch("/api/students");
    const data = await res.json();
    setAllStudents(data.map((s: Student) => ({ id: s.id, name: s.name })));
  }

  function toggleStudent(id: number) {
    setSelectedStudents(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }

  async function addParent(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    await fetch("/api/admin/parents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        email: newEmail,
        password: newPassword,
        studentIds: selectedStudents,
        relationship,
      }),
    });
    setShowAdd(false);
    setNewName(""); setNewEmail(""); setNewPassword("");
    setSelectedStudents([]); setRelationship("parent");
    setAdding(false);
    loadParents();
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Parents ({parents.length})</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="text-sm px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition">
          + Add Parent
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addParent} className="mb-6 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-3">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" required className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm outline-none focus:border-[var(--accent)]" />
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email" required className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm outline-none focus:border-[var(--accent)]" />
          <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Password" required className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm outline-none focus:border-[var(--accent)]" />
          <select value={relationship} onChange={e => setRelationship(e.target.value)} className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-white outline-none focus:border-[var(--accent)]">
            <option value="parent">Parent</option>
            <option value="guardian">Guardian</option>
            <option value="grandparent">Grandparent</option>
            <option value="other">Other</option>
          </select>
          <div>
            <p className="text-sm font-medium text-[var(--muted)] mb-2">Link to students:</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {allStudents.map(s => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedStudents.includes(s.id)}
                    onChange={() => toggleStudent(s.id)}
                    className="rounded"
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
          <button type="submit" disabled={adding} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg disabled:opacity-50">
            {adding ? "Creating…" : "Create Parent"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {parents.map(p => (
          <div key={p.id} className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex items-center justify-between">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-[var(--muted)]">{p.email}</p>
            </div>
            <div className="text-right">
              {p.students.length > 0 ? (
                <div className="text-sm text-[var(--muted)]">
                  {p.students.map(s => s.studentName).join(", ")}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">No linked students</p>
              )}
            </div>
          </div>
        ))}
        {parents.length === 0 && (
          <p className="text-sm text-[var(--muted)] text-center py-8">No parents yet. Click &quot;+ Add Parent&quot; to create one.</p>
        )}
      </div>
    </div>
  );
}
