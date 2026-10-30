export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { parseStudentUpdate } from "@/lib/admin-student-update";
import { DEFAULT_MIX } from "@/lib/level-progression-rules";
import { logAdminAction } from "@/lib/audit";

/**
 * Edit a student's profile and settings. A readingLevel change is a guide override
 * (docs/level-progression.md): it resets the feed mix and writes level history, which
 * restarts the evaluation window.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = parseInt((await params).id);
  if (!Number.isInteger(studentId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const parsed = parseStudentUpdate(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { readingLevel, ...fields } = parsed.update;

  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, studentId)).limit(1);
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  if (fields.guideId !== undefined && fields.guideId !== student.guideId) {
    const [guide] = await db.select({ id: schema.guides.id }).from(schema.guides).where(eq(schema.guides.id, fields.guideId)).limit(1);
    if (!guide) return NextResponse.json({ error: "Guide not found" }, { status: 400 });
  }

  // Only record fields that actually change
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(fields)) {
    const from = student[key as keyof typeof student];
    if (from !== to) changes[key] = { from, to };
  }
  const levelChanged = readingLevel !== undefined && readingLevel !== student.readingLevel;

  if (Object.keys(changes).length > 0) {
    const set = Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.to]));
    await db.update(schema.students).set(set).where(eq(schema.students.id, studentId));
    await logAdminAction({ adminId: session.userId, action: "student.update", targetType: "student", targetId: studentId, details: changes });
  }

  if (levelChanged) {
    // Same effect as an automatic level change in applyProgressionResult, in one transaction
    const setLevel = db.update(schema.students).set({ readingLevel, feedMix: DEFAULT_MIX }).where(eq(schema.students.id, studentId));
    if (student.readingLevel === null) {
      // Not assessed yet: there's no previous level or evaluation window to record
      await setLevel;
    } else {
      await db.batch([
        setLevel,
        db.insert(schema.levelHistory).values({ studentId, fromLevel: student.readingLevel, toLevel: readingLevel }),
      ]);
    }
    await logAdminAction({
      adminId: session.userId, action: "student.level_override", targetType: "student", targetId: studentId,
      details: { from: student.readingLevel, to: readingLevel },
    });
  }

  const [updated] = await db.select({
    id: schema.students.id,
    name: schema.students.name,
    guideId: schema.students.guideId,
    readingLevel: schema.students.readingLevel,
    gradeLevel: schema.students.gradeLevel,
    age: schema.students.age,
    dailyArticleCap: schema.students.dailyArticleCap,
    weeklySessionTarget: schema.students.weeklySessionTarget,
  }).from(schema.students).where(eq(schema.students.id, studentId)).limit(1);

  return NextResponse.json({ student: updated, changed: Object.keys(changes).concat(levelChanged ? ["readingLevel"] : []) });
}
