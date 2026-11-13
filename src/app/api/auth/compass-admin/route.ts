export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createToken } from "@/lib/auth";
import { compassBase, compassIssuer, compassKeys, noteKid, ProfileError, verifyAdultNote } from "@/lib/compass-profile";

/**
 * Signs an admin in to the admin pages from the adult's note Compass Admin opens them with
 * (Compass app contract 1.2, Administration, Apps). Compass decides who is an admin: a note that
 * says `staff` (contract 1.15: the adult runs this Compass for every school) opens the pages, for
 * a day at a time. Until every admin is Compass staff, the older way still works too: a row in
 * `admins` linked to the adult's Compass id, or, the first time, the row with the adult's email,
 * which is then linked. Compass signs adults in only through a link sent to their address, so the
 * email in its note is one they own. A school's own roles (`roles`) never open the pages.
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
  const staff = claims.adult.staff === true;
  let admin: { id: number } | undefined;
  try {
    admin = await linkedAdmin(personId, claims.adult.email);
  } catch (e) {
    // Staff need no row, so a failure here only matters to an admin who is not staff
    console.error(`[compass admin sign-in] admin list unavailable: ${e instanceof Error ? e.message : e}`);
    if (!staff) return signedOut(NextResponse.json({ error: "Could not check the admin list" }, { status: 503 }));
  }
  if (!staff && !admin) {
    console.warn(`[compass admin sign-in] Compass person ${personId} is not a SigmaRead admin`);
    return signedOut(NextResponse.json({ error: "not_admin" }, { status: 403 }));
  }

  // userId 0: staff with no row in the old admin list. The audit log names them by Compass id
  const userId = admin?.id ?? 0;
  const name = claims.adult.name.trim().slice(0, 100) || "Admin";
  // Which way in, so the logs show when nobody needs the old admin list any more
  console.log(`[compass admin sign-in] Compass person ${personId} signed in ${staff ? "as Compass staff" : "by the admin list"}${staff && admin ? " (also on the admin list)" : ""}`);
  const res = NextResponse.json({ role: "admin", userId });
  res.cookies.set("session", createToken({ userId, role: "admin", compassId: personId, name }, staff ? "1d" : "7d"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * (staff ? 1 : 7),
  });
  return res;
}

/** The row in the old admin list for this Compass person, linking it by email the first time */
async function linkedAdmin(personId: string, noteEmail: string | undefined): Promise<{ id: number } | undefined> {
  const byId = () => db.select({ id: schema.admins.id }).from(schema.admins).where(eq(schema.admins.externalId, personId)).limit(1);
  let [admin] = await byId();
  const email = noteEmail?.trim().toLowerCase();
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
    else [admin] = await byId();
  }
  return admin;
}

function signedOut(res: NextResponse): NextResponse {
  res.cookies.set("session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
