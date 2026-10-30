export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditInsert } from "@/lib/audit";
import { and, eq, isNull } from "drizzle-orm";

/** Revoke a client's key. Revocation is permanent; create a new client to restore access. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const c = schema.apiClients;
  const revoked = await db.update(c).set({ revokedAt: new Date() })
    .where(and(eq(c.id, id), isNull(c.revokedAt))).returning({ id: c.id });
  if (revoked.length === 0) return NextResponse.json({ error: "Not found or already revoked" }, { status: 404 });
  await auditInsert({ adminId: session.userId, action: "api_client.revoke", targetType: "api_client", targetId: id })
    .catch(e => console.error("audit write failed:", e));
  return NextResponse.json({ ok: true });
}
