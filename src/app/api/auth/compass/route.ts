export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createToken } from "@/lib/auth";
import { compassBase, compassIssuer, compassKeys, noteKid, ProfileError, verifyProfileNote } from "@/lib/compass-profile";

/**
 * Signs a student in from the profile note Compass opened SigmaRead with (app contract 1.1).
 * This is the way in: the page posts the note from `#compass_profile`, the server checks it
 * against Compass's published keys and signs in the student whose external_id is the note's
 * subject. No password is involved.
 */
export async function POST(req: NextRequest) {
  const issuer = compassIssuer();
  const base = compassBase();
  if (!issuer || !base) return signedOut(NextResponse.json({ error: "Compass is not set up" }, { status: 503 }));

  // JSON only, so another site cannot post here with a plain form; small bodies only
  if (!req.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON only" }, { status: 415 });
  if (Number(req.headers.get("content-length") ?? 0) > 64_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const text = await req.text();
  if (text.length > 64_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let note: unknown;
  try { note = (JSON.parse(text) as { note?: unknown })?.note; } catch { note = undefined; }
  if (typeof note !== "string") return NextResponse.json({ error: "No note" }, { status: 400 });

  let keys;
  try {
    keys = await compassKeys(base, noteKid(note));
  } catch (e) {
    // Compass's key page is down or slow: not the note's fault, and worth noticing in the logs
    console.error(`[compass sign-in] keys unavailable: ${e instanceof Error ? e.message : e}`);
    return signedOut(NextResponse.json({ error: "Compass keys unavailable" }, { status: 503 }));
  }
  let claims;
  try {
    claims = verifyProfileNote(note, { issuer, keys });
  } catch (e) {
    const why = e instanceof ProfileError ? e.message : "could not check the note";
    console.warn(`[compass sign-in] refused: ${why}`);
    return signedOut(NextResponse.json({ error: "Compass could not sign you in" }, { status: 401 }));
  }

  const learnerId = claims.sub.toLowerCase();
  const [student] = await db
    .select({ id: schema.students.id, onboardingComplete: schema.students.onboardingComplete })
    .from(schema.students)
    // external_id is unique and written lowercase (migration 0014)
    .where(eq(schema.students.externalId, learnerId))
    .limit(1);
  if (!student) {
    console.warn(`[compass sign-in] no student linked to learner ${learnerId}`);
    return signedOut(NextResponse.json({ error: "not_linked" }, { status: 404 }));
  }

  const res = NextResponse.json({ role: "student", userId: student.id, onboardingComplete: student.onboardingComplete });
  res.cookies.set("session", createToken({ userId: student.id, role: "student" }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

/**
 * A note was there and did not sign anyone in (refused, unlinked, or not checkable just now):
 * whoever was signed in on this device before is signed out, so a shared iPad never shows one
 * student another's reading. The page then goes to /login, where Compass fills the right
 * student's saved password for as long as that path exists.
 */
function signedOut(res: NextResponse): NextResponse {
  res.cookies.set("session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
