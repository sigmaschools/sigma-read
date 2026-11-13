export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== "guide" && session.role !== "admin")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentList = session.role === "admin"
    ? await db.select().from(schema.students)
    : await db.select().from(schema.students).where(eq(schema.students.guideId, session.userId));
  return NextResponse.json(studentList);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "guide" && session.role !== "admin")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, username: rawUsername, gradeLevel, age, guideId: bodyGuideId } = await req.json();
  // Usernames are stored lowercase; there is no password: the student signs in from Compass
  const username = typeof rawUsername === "string" ? rawUsername.trim().toLowerCase() : "";
  if (!name || !username) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // Admin must provide guideId; guide uses own userId
  const guideId = session.role === "admin" ? bodyGuideId : session.userId;
  if (!guideId) return NextResponse.json({ error: "guideId required" }, { status: 400 });

  // Set initial reading level from grade level
  const gradeToLevel: Record<number, number> = {
    2: 1, 3: 1, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5,
  };
  const initialLevel = gradeLevel ? gradeToLevel[gradeLevel] || 2 : null;

  const [student] = await db.insert(schema.students).values({
    name,
    username,
    guideId,
    gradeLevel: gradeLevel || null,
    age: age || null,
    readingLevel: initialLevel,
  }).returning();

  return NextResponse.json(student, { status: 201 });
}
