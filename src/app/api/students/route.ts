export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "guide") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentList = await db.select().from(schema.students).where(eq(schema.students.guideId, session.userId));
  return NextResponse.json(studentList);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "guide") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, username, password } = await req.json();
  if (!name || !username || !password) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const passwordHash = await hashPassword(password);
  const [student] = await db.insert(schema.students).values({
    name,
    username,
    passwordHash,
    guideId: session.userId,
  }).returning();

  return NextResponse.json(student, { status: 201 });
}
