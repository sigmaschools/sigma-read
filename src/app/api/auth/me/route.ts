export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (session.role === "guide") {
    const [guide] = await db.select().from(schema.guides).where(eq(schema.guides.id, session.userId)).limit(1);
    if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ role: "guide", userId: guide.id, name: guide.name, email: guide.email });
  }

  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, session.userId)).limit(1);
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    role: "student",
    userId: student.id,
    name: student.name,
    onboardingComplete: student.onboardingComplete,
    readingLevel: student.readingLevel,
    interestProfile: student.interestProfile,
  });
}
