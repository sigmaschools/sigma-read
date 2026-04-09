export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allParents = await db.select({
    id: schema.parents.id,
    name: schema.parents.name,
    email: schema.parents.email,
    createdAt: schema.parents.createdAt,
  }).from(schema.parents);

  // Get all student-parent links
  const links = await db.select({
    parentId: schema.studentParents.parentId,
    studentId: schema.studentParents.studentId,
    relationship: schema.studentParents.relationship,
    studentName: schema.students.name,
  }).from(schema.studentParents)
    .innerJoin(schema.students, eq(schema.studentParents.studentId, schema.students.id));

  const linkMap: Record<number, { studentId: number; studentName: string; relationship: string | null }[]> = {};
  links.forEach(l => {
    if (!linkMap[l.parentId]) linkMap[l.parentId] = [];
    linkMap[l.parentId].push({ studentId: l.studentId, studentName: l.studentName, relationship: l.relationship });
  });

  const result = allParents.map(p => ({
    ...p,
    students: linkMap[p.id] || [],
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, email, password, studentIds, relationship } = await req.json();
  if (!name || !email || !password) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const passwordHash = await hashPassword(password);
  const [parent] = await db.insert(schema.parents).values({ name, email, passwordHash }).returning();

  // Link to students
  if (studentIds && studentIds.length > 0) {
    await db.insert(schema.studentParents).values(
      studentIds.map((sid: number) => ({
        studentId: sid,
        parentId: parent.id,
        relationship: relationship || "parent",
      }))
    );
  }

  return NextResponse.json(parent);
}
