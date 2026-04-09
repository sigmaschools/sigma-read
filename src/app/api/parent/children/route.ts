export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "parent") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const children = await db.select({
    id: schema.students.id,
    name: schema.students.name,
    readingLevel: schema.students.readingLevel,
    gradeLevel: schema.students.gradeLevel,
    age: schema.students.age,
    interestProfile: schema.students.interestProfile,
    onboardingComplete: schema.students.onboardingComplete,
  })
    .from(schema.students)
    .innerJoin(schema.studentParents, eq(schema.students.id, schema.studentParents.studentId))
    .where(eq(schema.studentParents.parentId, session.userId));

  return NextResponse.json(children);
}
