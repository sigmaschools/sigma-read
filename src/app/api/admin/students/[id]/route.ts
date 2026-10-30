export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { parseStudentUpdate } from "@/lib/admin-student-update";
import { DEFAULT_MIX } from "@/lib/level-progression-rules";
import { auditInsert } from "@/lib/audit";

/**
 * Edit a student's profile and settings. A readingLevel change is a guide override
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

  // One transaction: the edit, the level override and their audit rows land together or not at all
  const queries: BatchItem<"pg">[] = [];
  if (Object.keys(changes).length > 0) {
    const set = Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.to]));
    queries.push(db.update(schema.students).set(set).where(eq(schema.students.id, studentId)));
    queries.push(auditInsert({ adminId: session.userId, action: "student.update", targetType: "student", targetId: studentId, details: changes }));
  }
  if (levelChanged) {
    // Same effect as an automatic level change in applyProgressionResult
    queries.push(db.update(schema.students).set({ readingLevel, feedMix: DEFAULT_MIX }).where(eq(schema.students.id, studentId)));
    // Not assessed yet: there's no previous level or evaluation window to record
    if (student.readingLevel !== null) {
      queries.push(db.insert(schema.levelHistory).values({ studentId, fromLevel: student.readingLevel, toLevel: readingLevel }));
    }
    queries.push(auditInsert({
      adminId: session.userId, action: "student.level_override", targetType: "student", targetId: studentId,
      details: { from: student.readingLevel, to: readingLevel },
    }));
  }
  if (queries.length > 0) {
    try {
      await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    } catch (e) {
      // Unique index on external_id
      if ((e as { code?: string }).code === "23505") return NextResponse.json({ error: "That Compass ID is already used by another student" }, { status: 409 });
      throw e;
    }
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
    externalId: schema.students.externalId,
  }).from(schema.students).where(eq(schema.students.id, studentId)).limit(1);

  return NextResponse.json({ student: updated, changed: Object.keys(changes).concat(levelChanged ? ["readingLevel"] : []) });
}
