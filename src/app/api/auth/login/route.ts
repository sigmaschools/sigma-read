export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { verifyPassword, createToken } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  // Try guide (email-based)
  const [guide] = await db.select().from(schema.guides).where(eq(schema.guides.email, username)).limit(1);
  if (guide && await verifyPassword(password, guide.passwordHash)) {
    const token = createToken({ userId: guide.id, role: "guide" });
    const res = NextResponse.json({ role: "guide", userId: guide.id, name: guide.name });
    res.cookies.set("session", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return res;
  }

  // Try student (username-based)
  const [student] = await db.select().from(schema.students).where(eq(schema.students.username, username)).limit(1);
  if (student && await verifyPassword(password, student.passwordHash)) {
    const token = createToken({ userId: student.id, role: "student" });
    const res = NextResponse.json({
      role: "student",
      userId: student.id,
      name: student.name,
      onboardingComplete: student.onboardingComplete,
    });
    res.cookies.set("session", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return res;
  }

  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}
