export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { guideOwnsStudent } from "@/lib/ownership";
import { REPORT_FLAGS, type ReportFlag } from "@/lib/skills";
import { and, eq, or, isNull, ne, type SQL } from "drizzle-orm";

/** The report's student, or null if it doesn't exist */
async function reportStudentId(reportId: number): Promise<number | null> {
  const [row] = await db.select({ studentId: schema.readingSessions.studentId })
    .from(schema.comprehensionReports)
    .innerJoin(schema.conversations, eq(schema.comprehensionReports.conversationId, schema.conversations.id))
    .innerJoin(schema.readingSessions, eq(schema.conversations.readingSessionId, schema.readingSessions.id))
    .where(eq(schema.comprehensionReports.id, reportId))
    .limit(1);
  return row?.studentId ?? null;
}

/**
 * Rows this caller may change: admins any, guides only ones an admin hasn't flagged.
 * Part of the UPDATE itself, so a guide can't overwrite or clear an admin's flag.
 */
function writable(reportId: number, role: string): SQL {
  const r = schema.comprehensionReports;
  return role === "admin"
    ? eq(r.id, reportId)
    : and(eq(r.id, reportId), or(isNull(r.guideFlaggedRole), ne(r.guideFlaggedRole, "admin")))!;
}

const adminFlagged = () => NextResponse.json({ error: "This report was flagged by an admin" }, { status: 403 });

/** Guides may flag reports for their own students; admins for anyone */
async function authorize(id: string) {
  const session = await getSession();
  if (!session || (session.role !== "guide" && session.role !== "admin")) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const reportId = Number(id);
  if (!Number.isInteger(reportId) || reportId <= 0) return { error: NextResponse.json({ error: "Invalid id" }, { status: 400 }) };
  const studentId = await reportStudentId(reportId);
  if (studentId === null || (session.role === "guide" && !(await guideOwnsStudent(session.userId, studentId)))) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { session, reportId };
}

/** Flag a report as wrong: { flag: "score_too_high" | "score_too_low" | "other", note?: string } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize((await params).id);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const flag = body?.flag as ReportFlag;
  if (!REPORT_FLAGS.includes(flag)) return NextResponse.json({ error: "Invalid flag" }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (flag === "other" && !note) return NextResponse.json({ error: "Add a note saying what's off" }, { status: 400 });

  const flaggedAt = new Date();
  const updated = await db.update(schema.comprehensionReports).set({
    guideFlag: flag,
    guideNote: note || null,
    guideFlaggedBy: auth.session.userId,
    guideFlaggedRole: auth.session.role,
    guideFlaggedAt: flaggedAt,
  }).where(writable(auth.reportId, auth.session.role)).returning({ id: schema.comprehensionReports.id });
  if (updated.length === 0) return adminFlagged();

  return NextResponse.json({ guideFlag: flag, guideNote: note || null, guideFlaggedAt: flaggedAt, guideFlaggedRole: auth.session.role });
}

/** Withdraw a flag */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize((await params).id);
  if ("error" in auth) return auth.error;

  const updated = await db.update(schema.comprehensionReports).set({
    guideFlag: null, guideNote: null, guideFlaggedBy: null, guideFlaggedRole: null, guideFlaggedAt: null,
  }).where(writable(auth.reportId, auth.session.role)).returning({ id: schema.comprehensionReports.id });
  if (updated.length === 0) return adminFlagged();

  return NextResponse.json({ guideFlag: null, guideNote: null, guideFlaggedAt: null, guideFlaggedRole: null });
}
