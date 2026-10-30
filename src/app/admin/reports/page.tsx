"use client";

import { useState, useEffect } from "react";

interface Row {
  conversationId: number;
  completedAt: string | null;
  studentId: number;
  studentName: string;
  readingLevel: number | null;
  articleTitle: string;
  articleLevel: number;
  style: string | null;
  progressScore: number;
  reportId: number | null;
  score: number | null;
  rating: string | null;
  confidence: string | null;
  forcedClose: boolean | null;
  selfAssessment: string | null;
  exchangeCount: number | null;
  summary: string | null;
  promptVersion: string | null;
}

interface Detail {
  conversation: { messages: { role: string; content: string; type?: string }[] | null; progressScore: number; style: string | null };
  report: {
    understood: string;
    missed: string;
    engagementNote: string;
    skills: Record<string, string> | null;
    evidence: { skill: string; quote: string; shows?: boolean }[] | null;
    nextStep: string | null;
    inChatScore: number | null;
    model: string | null;
  } | null;
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "low", label: "Low confidence" },
  { value: "forced", label: "Forced close" },
  { value: "gap", label: "Self-assessment gap" },
  { value: "missing", label: "Missing report" },
];

const SKILL_LABELS: Record<string, string> = {
  main_idea: "Main idea", key_details: "Key details", vocabulary: "Vocabulary", inference: "Inference", connection: "Connection",
};

const SKILL_COLORS: Record<string, string> = {
  shown: "bg-green-50 text-green-700", partly: "bg-amber-50 text-amber-700",
  not_shown: "bg-red-50 text-red-700", not_tested: "bg-gray-100 text-gray-500",
};

const SELF_LABELS: Record<string, string> = {
  really_well: "Really well", pretty_well: "Pretty well", not_sure: "Not sure", lost: "I was lost",
};

export default function AdminReportsPage() {
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Detail | { error: string }>>({});

  useEffect(() => {
    let stale = false;
    setLoading(true);
    setOpenId(null);
    setRows([]);
    setError("");
    fetch(`/api/admin/reports?filter=${filter}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { if (!stale) { setRows(d); setLoading(false); } })
      .catch(e => { if (!stale) { setError(`Couldn't load reports (${e.message}).`); setLoading(false); } });
    // Ignore a slow response for a filter the admin already moved away from
    return () => { stale = true; };
  }, [filter]);

  function toggle(id: number) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    const cached = details[id];
    if (!cached || "error" in cached) {
      fetch(`/api/admin/reports/${id}`)
        .then(async r => (r.ok ? await r.json() : { error: `Couldn't load this conversation (${r.status})` }))
        .catch(() => ({ error: "Couldn't load this conversation" }))
        .then(d => setDetails(prev => ({ ...prev, [id]: d })));
    }
  }

  return (
    <div className="p-8 max-w-7xl">
      <h1 className="text-2xl font-semibold mb-1">Report Review</h1>
      <p className="text-sm text-[var(--muted)] mb-6">Recent comprehension reports. Click a row for skills, evidence and the transcript.</p>

      <div className="flex gap-2 mb-4">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition ${
              filter === f.value ? "bg-[var(--fg)] text-white border-[var(--fg)]" : "border-[var(--border)] hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-[var(--muted)] text-sm py-8">Loading…</div>
      ) : error ? (
        <div className="text-[var(--danger)] text-sm py-8">{error}</div>
      ) : rows.length === 0 ? (
        <div className="text-[var(--muted)] text-sm py-8">Nothing here.</div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)] uppercase tracking-wider border-b border-[var(--border)]">
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Article</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Self</th>
                <th className="px-4 py-3">Summary</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <ReportRow key={row.conversationId} row={row} open={openId === row.conversationId}
                  detail={details[row.conversationId]} onToggle={() => toggle(row.conversationId)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 50 && <p className="text-xs text-[var(--muted)] mt-3">Showing the latest 50.</p>}
    </div>
  );
}

function ReportRow({ row, open, detail, onToggle }: { row: Row; open: boolean; detail?: Detail | { error: string }; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} className="border-b border-[var(--border)] hover:bg-gray-50 transition cursor-pointer align-top">
        <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
          {row.completedAt ? new Date(row.completedAt).toLocaleDateString() : "—"}
        </td>
        <td className="px-4 py-3">
          <p className="font-medium">{row.studentName}</p>
          <p className="text-xs text-[var(--muted)]">L{row.readingLevel ?? "?"}</p>
        </td>
        <td className="px-4 py-3">
          <p className="line-clamp-1">{row.articleTitle}</p>
          <p className="text-xs text-[var(--muted)]">L{row.articleLevel} · {row.exchangeCount ?? "?"} exchanges{row.forcedClose ? " · forced close" : ""}</p>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          {row.reportId ? (
            <>
              <p className="font-semibold">{row.score}</p>
              <p className="text-xs text-[var(--muted)]">{row.rating}</p>
            </>
          ) : <span className="text-xs text-[var(--danger)]">No report</span>}
        </td>
        <td className="px-4 py-3 text-xs">{row.confidence ?? "—"}</td>
        <td className="px-4 py-3 text-xs whitespace-nowrap">{row.selfAssessment ? SELF_LABELS[row.selfAssessment] ?? row.selfAssessment : "—"}</td>
        <td className="px-4 py-3 text-[var(--muted)]"><p className="line-clamp-2">{row.summary ?? "—"}</p></td>
      </tr>
      {open && (
        <tr className="border-b border-[var(--border)] bg-gray-50/50">
          <td colSpan={7} className="px-6 py-5">
            {!detail ? <p className="text-sm text-[var(--muted)]">Loading…</p>
              : "error" in detail ? <p className="text-sm text-[var(--danger)]">{detail.error}</p>
              : <DetailView row={row} detail={detail} />}
          </td>
        </tr>
      )}
    </>
  );
}

function DetailView({ row, detail }: { row: Row; detail: Detail }) {
  const { report, conversation } = detail;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4 text-sm">
        {report ? (
          <>
            {report.skills && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(report.skills).map(([skill, rating]) => (
                  <span key={skill} className={`text-xs px-2 py-0.5 rounded-full ${SKILL_COLORS[rating] ?? "bg-gray-100"}`}>
                    {SKILL_LABELS[skill] ?? skill}: {rating.replace("_", " ")}
                  </span>
                ))}
              </div>
            )}
            {report.evidence && report.evidence.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--muted)] mb-1">Evidence</p>
                {report.evidence.map((e, i) => (
                  <p key={i} className="mb-1">
                    <span className="text-xs text-[var(--muted)]">{SKILL_LABELS[e.skill] ?? e.skill}{e.shows === false ? " (missing)" : ""}: </span>
                    “{e.quote}”
                  </p>
                ))}
              </div>
            )}
            <Field label="Understood" text={report.understood} />
            <Field label="Missed" text={report.missed} />
            <Field label="Engagement" text={report.engagementNote} />
            {report.nextStep && <Field label="Next step" text={report.nextStep} />}
            <p className="text-xs text-[var(--muted)]">
              In-chat progress {report.inChatScore ?? conversation.progressScore} · style {conversation.style ?? "—"} · {report.model ?? "model ?"} · {row.promptVersion ?? "prompt ?"}
            </p>
          </>
        ) : (
          <p className="text-[var(--muted)]">This conversation completed without a report. In-chat progress was {conversation.progressScore}.</p>
        )}
      </div>
      <div className="space-y-2 max-h-[480px] overflow-y-auto pr-2">
        {(conversation.messages ?? []).map((m, i) => (
          <div key={i} className={`text-sm px-3 py-2 rounded-lg ${
            m.role === "user" ? "bg-blue-50 ml-8" : m.type === "coaching" ? "bg-violet-50 mr-8 italic" : "bg-white border border-[var(--border)] mr-8"
          }`}>
            {m.content}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-[var(--muted)] mb-0.5">{label}</p>
      <p>{text}</p>
    </div>
  );
}
