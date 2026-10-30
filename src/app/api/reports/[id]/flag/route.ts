export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { guideOwnsStudent } from "@/lib/ownership";
import { REPORT_FLAGS, type ReportFlag } from "@/lib/skills";
import { eq } from "drizzle-orm";

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

/** Guides may flag reports for their own students; admins for anyone */
async function authorize(req: NextRequest, id: string) {
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
  const auth = await authorize(req, (await params).id);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const flag = body?.flag as ReportFlag;
  if (!REPORT_FLAGS.includes(flag)) return NextResponse.json({ error: "Invalid flag" }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (flag === "other" && !note) return NextResponse.json({ error: "Add a note saying what's off" }, { status: 400 });

  const flaggedAt = new Date();
  await db.update(schema.comprehensionReports).set({
    guideFlag: flag,
    guideNote: note || null,
    guideFlaggedBy: auth.session.userId,
    guideFlaggedRole: auth.session.role,
    guideFlaggedAt: flaggedAt,
  }).where(eq(schema.comprehensionReports.id, auth.reportId));

  return NextResponse.json({ guideFlag: flag, guideNote: note || null, guideFlaggedAt: flaggedAt });
}

/** Withdraw a flag */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, (await params).id);
  if ("error" in auth) return auth.error;

  await db.update(schema.comprehensionReports).set({
    guideFlag: null, guideNote: null, guideFlaggedBy: null, guideFlaggedRole: null, guideFlaggedAt: null,
  }).where(eq(schema.comprehensionReports.id, auth.reportId));

  return NextResponse.json({ guideFlag: null });
}
