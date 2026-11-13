export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { parseStudentUpdate } from "@/lib/admin-student-update";
import { DEFAULT_MIX } from "@/lib/level-progression-rules";
import { auditInsert, auditWho } from "@/lib/audit";

/** One student, for the admin student page */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = Number((await params).id);
  if (!Number.isInteger(studentId) || studentId <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [student] = await db.select({
    id: schema.students.id,
    name: schema.students.name,
    readingLevel: schema.students.readingLevel,
    gradeLevel: schema.students.gradeLevel,
    interestProfile: schema.students.interestProfile,
    onboardingComplete: schema.students.onboardingComplete,
  }).from(schema.students).where(eq(schema.students.id, studentId)).limit(1);
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
  return NextResponse.json(student);
}

/**
 * Edit a student's reading settings (who the student is comes from Compass and is changed
 * there). A readingLevel change is a guide override
 * (docs/level-progression.md): it resets the feed mix and writes level history, which
 * restarts the evaluation window.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = Number((await params).id);
  if (!Number.isInteger(studentId) || studentId <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const parsed = parseStudentUpdate(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { readingLevel, ...fields } = parsed.update;

  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, studentId)).limit(1);
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  // Only record fields that actually change
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(fields)) {
    const from = student[key as keyof typeof student];
    if (from !== to) changes[key] = { from, to };
  }
  const levelChanged = readingLevel !== undefined && readingLevel !== student.readingLevel;

  // One transaction: the edit, the level override and their audit rows land together or not at all
  const queries: BatchItem<"pg">[] = [];
  if (Object.keys(changes).length > 0) {
    const set = Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.to]));
    queries.push(db.update(schema.students).set(set).where(eq(schema.students.id, studentId)));
    queries.push(auditInsert({ ...auditWho(session), action: "student.update", targetType: "student", targetId: studentId, details: changes }));
  }
  if (levelChanged) {
    // Same effect as an automatic level change in applyProgressionResult
    queries.push(db.update(schema.students).set({ readingLevel, feedMix: DEFAULT_MIX }).where(eq(schema.students.id, studentId)));
    // Not assessed yet: there's no previous level or evaluation window to record
    if (student.readingLevel !== null) {
      queries.push(db.insert(schema.levelHistory).values({ studentId, fromLevel: student.readingLevel, toLevel: readingLevel }));
    }
    queries.push(auditInsert({
      ...auditWho(session), action: "student.level_override", targetType: "student", targetId: studentId,
      details: { from: student.readingLevel, to: readingLevel },
    }));
  }
  if (queries.length > 0) {
    await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  }

  const [updated] = await db.select({
    id: schema.students.id,
    name: schema.students.name,
    readingLevel: schema.students.readingLevel,
    gradeLevel: schema.students.gradeLevel,
    dailyArticleCap: schema.students.dailyArticleCap,
    externalId: schema.students.externalId,
  }).from(schema.students).where(eq(schema.students.id, studentId)).limit(1);

  return NextResponse.json({ student: updated, changed: Object.keys(changes).concat(levelChanged ? ["readingLevel"] : []) });
}
