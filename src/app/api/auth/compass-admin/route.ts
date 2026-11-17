export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createToken } from "@/lib/auth";
import { compassBase, compassIssuer, compassKeys, noteKid, ProfileError, verifyAdultNote } from "@/lib/compass-profile";

/**
 * Signs an admin in to the admin pages from the adult's note Compass Admin opens them with
 * (Compass app contract 1.2, Administration, Apps). Compass decides who is an admin: only a note
 * that says `staff` (contract 1.15: the adult runs this Compass for every school) opens the
 * pages, for a day at a time. SigmaRead keeps no admin list of its own, and a school's own roles
 * (`roles`) never open the pages.
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
  if (claims.adult.staff !== true) {
    console.warn(`[compass admin sign-in] Compass person ${personId} is not Compass staff`);
    return signedOut(NextResponse.json({ error: "not_admin" }, { status: 403 }));
  }

  // userId 0: admins have no row here. The audit log names them by Compass id and name
  const name = claims.adult.name.trim().slice(0, 100) || "Admin";
  console.log(`[compass admin sign-in] Compass person ${personId} signed in as Compass staff`);
  const res = NextResponse.json({ role: "admin", userId: 0 });
  res.cookies.set("session", createToken({ userId: 0, role: "admin", compassId: personId, name }, "1d"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return res;
}

function signedOut(res: NextResponse): NextResponse {
  res.cookies.set("session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
