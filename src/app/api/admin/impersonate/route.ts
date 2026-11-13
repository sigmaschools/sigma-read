export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession, createToken, verifyToken } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { auditInsert, auditWho, logAdminAction } from "@/lib/audit";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId, role } = await req.json();
  if (!userId || !role) return NextResponse.json({ error: "Missing userId or role" }, { status: 400 });
  // Only students: Sigma Read's guide pages are retired (guides follow students in Compass)
  if (role !== "student") return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, userId)).limit(1);
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  // Fails closed: no impersonation without an audit record
  await auditInsert({ ...auditWho(session), action: "impersonate.start", targetType: role, targetId: userId });

  // Keep the admin's own session, as it is, in a separate cookie for the return: it ends when it would have
  const adminToken = (await cookies()).get("session")!.value;
  const impersonateToken = createToken({ userId, role });
  
  const res = NextResponse.json({ ok: true, role, userId });
  res.cookies.set("session", impersonateToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 });
  res.cookies.set("admin_session", adminToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 });
  return res;
}

// Return to admin
export async function DELETE() {
  const adminToken = (await cookies()).get("admin_session")?.value;
  
  if (!adminToken) return NextResponse.json({ error: "No admin session" }, { status: 400 });
  const admin = verifyToken(adminToken);
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "No admin session" }, { status: 400 });
  const impersonated = await getSession();
  await logAdminAction({
    ...auditWho(admin), action: "impersonate.end",
    targetType: impersonated?.role === "student" || impersonated?.role === "guide" ? impersonated.role : undefined,
    targetId: impersonated?.userId,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("session", adminToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  res.cookies.delete("admin_session");
  return res;
}
