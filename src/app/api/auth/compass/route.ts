export const dynamic = "force-dynamic";
// The first articles of a student onboarded from Compass are written after the answer (after())
export const maxDuration = 300;
import { NextRequest, NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createToken } from "@/lib/auth";
import { gradeToReadingLevel } from "@/lib/grade-to-level";
import { markStarterPending, prepareStarterArticles } from "@/lib/starter-articles";
import { profileFromNote, startingGrade } from "@/lib/compass-onboarding";
import { goalFromNote } from "@/lib/daily-goal";
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

  // JSON only, so another site cannot post here with a plain form; small bodies only
  if (!req.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON only" }, { status: 415 });
  if (Number(req.headers.get("content-length") ?? 0) > 64_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const text = await req.text();
  if (text.length > 64_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let note: unknown;
  try { note = (JSON.parse(text) as { note?: unknown })?.note; } catch { note = undefined; }
  if (typeof note !== "string") return NextResponse.json({ error: "No note" }, { status: 400 });
  if (!issuer || !base) return signedOut(NextResponse.json({ error: "Compass is not set up" }, { status: 503 }));

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
    .select({ id: schema.students.id, onboardingComplete: schema.students.onboardingComplete, gradeLevel: schema.students.gradeLevel, dailyGoalArticles: schema.students.dailyGoalArticles })
    .from(schema.students)
    // external_id is unique and written lowercase (migration 0014)
    .where(eq(schema.students.externalId, learnerId))
    .limit(1);
  if (!student) {
    console.warn(`[compass sign-in] no student linked to learner ${learnerId}`);
    return signedOut(NextResponse.json({ error: "not_linked" }, { status: 404 }));
  }

  // The day's goal as Compass has it now (contract 1.11): kept so the home page ends the day there.
  // A note without one puts the student back on three. A failure here never fails the sign-in.
  try {
    const goal = goalFromNote(claims.student);
    if (goal !== student.dailyGoalArticles) {
      await db.update(schema.students).set({ dailyGoalArticles: goal }).where(eq(schema.students.id, student.id));
      console.log(`[compass sign-in] student ${student.id} daily goal ${goal ?? "default"} (was ${student.dailyGoalArticles ?? "default"})`);
    }
  } catch (e) {
    console.error(`[compass sign-in] daily goal not saved for student ${student.id}: ${e instanceof Error ? e.message : e}`);
  }

  // A student who has not onboarded yet: what Compass knows (interests, grade) replaces the
  // interest chat when it names at least three interests. The first articles start as the chat's
  // would, and the home page shows the tutorial cards while they come.
  // A failure here never fails the sign-in: the student signs in and gets the chat instead.
  let onboardingComplete = student.onboardingComplete;
  if (!onboardingComplete) {
    try {
      const profile = profileFromNote(claims.student);
      if (profile) {
        const grade = startingGrade(student.gradeLevel, claims.student);
        const [done] = await db.update(schema.students)
          .set({ interestProfile: profile, readingLevel: gradeToReadingLevel(grade), gradeLevel: grade, onboardingComplete: true })
          .where(and(eq(schema.students.id, student.id), eq(schema.students.onboardingComplete, false)))
          .returning({ id: schema.students.id });
        if (done) {
          // As after the chat: a failure here still leaves a home page that fills the feed from the cache
          try {
            await markStarterPending(student.id);
            after(() => prepareStarterArticles(student.id, new Anthropic()).catch((e) =>
              console.error(`[compass sign-in] first articles failed for student ${student.id}: ${e instanceof Error ? e.message : e}`)));
          } catch (e) {
            console.error(`[compass sign-in] first articles not started for student ${student.id}: ${e instanceof Error ? e.message : e}`);
          }
          console.log(`[compass sign-in] student ${student.id} onboarded from Compass (${profile.interests.length} interests)`);
        }
        onboardingComplete = true;
      }
    } catch (e) {
      console.error(`[compass sign-in] onboarding from Compass failed for student ${student.id}, chat instead: ${e instanceof Error ? e.message : e}`);
    }
  }

  const res = NextResponse.json({ role: "student", userId: student.id, onboardingComplete });
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
