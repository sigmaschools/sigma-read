export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createToken } from "@/lib/auth";
import { compassBase, compassIssuer, compassKeys, noteKid, ProfileError, verifyAdultNote } from "@/lib/compass-profile";

/**
 * Signs an admin in to the admin pages from the adult's note Compass Admin opens them with
 * (Compass app contract 1.2, Administration, Apps). Compass vouches for who the adult is;
 * SigmaRead decides who is an admin: a row in `admins` linked to the adult's Compass id, or,
 * the first time, the row with the adult's email, which is then linked for good. Compass signs
 * adults in only through a link sent to their address, so the email in its note is one they own.
 */
export async function POST(req: NextRequest) {
  const issuer = compassIssuer();
  const base = compassBase();

  if (!req.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON only" }, { status: 415 });
  if (Number(req.headers.get("content-length") ?? 0) > 64_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const text = await req.text();
  if (text.length > 64_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let note: unknown;
  try { note = (JSON.parse(text) as { note?: unknown })?.note; } catch { note = undefined; }
  if (typeof note !== "string") return NextResponse.json({ error: "No note" }, { status: 400 });
  if (!issuer || !base) return signedOut(NextResponse.json({ error: "Compass is not set up" }, { status: 503 }));

  let claims;
  try {
    const keys = await compassKeys(base, noteKid(note));
    claims = verifyAdultNote(note, { issuer, keys });
  } catch (e) {
    const why = e instanceof Error ? e.message : "could not check the note";
    console.warn(`[compass admin sign-in] refused: ${why}`);
    const status = e instanceof ProfileError ? 401 : 503;
    return signedOut(NextResponse.json({ error: "Compass could not sign you in" }, { status }));
  }

  const personId = claims.sub.toLowerCase();
  let [admin] = await db.select({ id: schema.admins.id }).from(schema.admins).where(eq(schema.admins.externalId, personId)).limit(1);
  const email = claims.adult.email?.trim().toLowerCase();
  if (!admin && email) {
    try {
      [admin] = await db
        .update(schema.admins)
        .set({ externalId: personId })
        .where(and(sql`${schema.admins.id} = (SELECT min(id) FROM admins WHERE lower(email) = ${email})`, isNull(schema.admins.externalId)))
        .returning({ id: schema.admins.id });
    } catch (e) {
      console.error(`[compass admin sign-in] could not link Compass person ${personId}: ${e instanceof Error ? e.message : e}`);
    }
    if (admin) console.log(`[compass admin sign-in] admin ${admin.id} linked to Compass person ${personId}`);
    // Two first visits at once: the other one linked the row
    else [admin] = await db.select({ id: schema.admins.id }).from(schema.admins).where(eq(schema.admins.externalId, personId)).limit(1);
  }
  if (!admin) {
    console.warn(`[compass admin sign-in] Compass person ${personId} is not a SigmaRead admin`);
    return signedOut(NextResponse.json({ error: "not_admin" }, { status: 403 }));
  }

  const res = NextResponse.json({ role: "admin", userId: admin.id });
  res.cookies.set("session", createToken({ userId: admin.id, role: "admin" }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

function signedOut(res: NextResponse): NextResponse {
  res.cookies.set("session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
