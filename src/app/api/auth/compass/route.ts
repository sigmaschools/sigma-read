export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
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
  if (!issuer || !base) return NextResponse.json({ error: "Compass is not set up" }, { status: 503 });

  const { note } = (await req.json().catch(() => ({}))) as { note?: unknown };
  if (typeof note !== "string" || note.length > 16_000) return NextResponse.json({ error: "No note" }, { status: 400 });

  let claims;
  try {
    const keys = await compassKeys(base, noteKid(note));
    claims = verifyProfileNote(note, { issuer, keys });
  } catch (e) {
    const why = e instanceof ProfileError ? e.message : "could not check the note";
    console.warn(`[compass sign-in] refused: ${why}`);
    return NextResponse.json({ error: "Compass could not sign you in" }, { status: 401 });
  }

  const learnerId = claims.sub.toLowerCase();
  const [student] = await db
    .select({ id: schema.students.id, onboardingComplete: schema.students.onboardingComplete })
    .from(schema.students)
    .where(sql`lower(${schema.students.externalId}) = ${learnerId}`)
    .limit(1);
  if (!student) {
    console.warn(`[compass sign-in] no student linked to learner ${learnerId}`);
    return NextResponse.json({ error: "not_linked" }, { status: 404 });
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
