export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditInsert } from "@/lib/audit";
import { cleanScopes, generateApiKey } from "@/lib/api-v1/keys";
import { desc, eq } from "drizzle-orm";

/** API clients for /api/v1, newest first. Never returns key hashes. */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const c = schema.apiClients;
  const rows = await db.select({
    id: c.id, name: c.name, keyPrefix: c.keyPrefix, scopes: c.scopes, guideId: c.guideId,
    lastUsedAt: c.lastUsedAt, revokedAt: c.revokedAt, createdAt: c.createdAt,
  }).from(c).orderBy(desc(c.id));
  return NextResponse.json(rows);
}

/** Create a client: { name, scopes[], guideId? }. The key is in this response only. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) return NextResponse.json({ error: "Name is required (up to 100 characters)" }, { status: 400 });
  const scopes = cleanScopes(body?.scopes);
  if (scopes.length === 0) return NextResponse.json({ error: "Pick at least one scope" }, { status: 400 });
  if (scopes.includes("transcripts:read") && !scopes.includes("reports:read")) {
    return NextResponse.json({ error: "transcripts:read needs reports:read" }, { status: 400 });
  }
  let guideId: number | null = null;
  if (body?.guideId !== undefined && body?.guideId !== null && body?.guideId !== "") {
    guideId = Number(body.guideId);
    const [guide] = Number.isInteger(guideId) && guideId > 0 && guideId <= 2_147_483_647
      ? await db.select({ id: schema.guides.id }).from(schema.guides).where(eq(schema.guides.id, guideId)).limit(1)
      : [];
    if (!guide) return NextResponse.json({ error: "Guide not found" }, { status: 400 });
  }

  const { key, prefix, hash } = generateApiKey();
  const [created] = await db.insert(schema.apiClients).values({
    name, scopes, guideId, keyPrefix: prefix, keyHash: hash, createdBy: session.userId,
  }).returning({ id: schema.apiClients.id });
  // A credential with no audit record shouldn't exist: if the audit write fails, remove the key
  try {
    await auditInsert({ adminId: session.userId, action: "api_client.create", targetType: "api_client", targetId: created.id, details: { name, scopes, guideId } });
  } catch (e) {
    console.error("audit write failed, removing new API client:", e);
    await db.delete(schema.apiClients).where(eq(schema.apiClients.id, created.id));
    return NextResponse.json({ error: "Could not create the key. Try again." }, { status: 500 });
  }

  return NextResponse.json({ id: created.id, key });
}
