export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession, createToken } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId, role } = await req.json();
  if (!userId || !role) return NextResponse.json({ error: "Missing userId or role" }, { status: 400 });
  if (role !== "student" && role !== "guide") return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  // Verify user exists
  if (role === "student") {
    const [student] = await db.select().from(schema.students).where(eq(schema.students.id, userId)).limit(1);
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
  } else {
    const [guide] = await db.select().from(schema.guides).where(eq(schema.guides.id, userId)).limit(1);
    if (!guide) return NextResponse.json({ error: "Guide not found" }, { status: 404 });
  }

  // Store admin session in a separate cookie for return
  const adminToken = createToken({ userId: session.userId, role: "admin" });
  const impersonateToken = createToken({ userId, role });
  
  const res = NextResponse.json({ ok: true, role, userId });
  res.cookies.set("session", impersonateToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 });
  res.cookies.set("admin_session", adminToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 });
  return res;
}

// Return to admin
export async function DELETE() {
  const adminCookie = (await import("next/headers")).cookies();
  const adminToken = (await adminCookie).get("admin_session")?.value;
  
  if (!adminToken) return NextResponse.json({ error: "No admin session" }, { status: 400 });
  
  const res = NextResponse.json({ ok: true });
  res.cookies.set("session", adminToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  res.cookies.delete("admin_session");
  return res;
}
