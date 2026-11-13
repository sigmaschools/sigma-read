/**
 * What Compass already knows about a new student, so SigmaRead does not ask again.
 *
 * Compass's profile note (app contract 1.1) carries the student's grade and up to five of their
 * strongest interests. A student who has not onboarded yet and whose note names at least three
 * interests skips the interest chat: those interests become the profile, as the chat's would.
 * With fewer than three the chat still runs (never fewer than three interests, the owner's rule).
 */
import { normalizeInterestProfile, type NormalizedProfile } from "@/lib/normalize-interests";
import { gradeFromNote, type CompassStudentNote } from "@/lib/compass-profile";

export const MIN_INTERESTS = 3;

/** The profile Compass's interests make, or null when there are too few to skip the chat */
export function profileFromNote(student: CompassStudentNote): NormalizedProfile | null {
  const labels = (Array.isArray(student.interests) ? student.interests : [])
    .map((i) => (i && typeof i.label === "string" ? i.label.trim() : ""))
    .filter((l) => l.length > 0 && l.length <= 60);
  const profile = normalizeInterestProfile({ interests: labels });
  return profile.interests.length >= MIN_INTERESTS ? profile : null;
}

/** The grade to start from: Compass's, which owns it; a note without one keeps the grade on the row */
export function startingGrade(own: number | null, student: CompassStudentNote): number | null {
  return gradeFromNote(student.grade) ?? own;
}

const NO_NAME = "Student";

/**
 * Who the student is, as the note says. Compass owns the people (issue 164): SigmaRead makes its
 * row from this at the first launch and keeps the name and grade as the note last gave them,
 * because the tutor, the reports and the morning batch need them when no note is at hand.
 */
export function personFromNote(student: CompassStudentNote): { name: string; gradeLevel: number | null } {
  const name = typeof student.name === "string" ? student.name.trim().slice(0, 100) : "";
  return { name: name || NO_NAME, gradeLevel: gradeFromNote(typeof student.grade === "string" ? student.grade : undefined) };
}

/** What a later note changes on the row, or null. A note missing a name or grade leaves that field as it is. */
export function personChanges(
  row: { name: string; gradeLevel: number | null },
  student: CompassStudentNote,
): { name?: string; gradeLevel?: number } | null {
  const now = personFromNote(student);
  const out: { name?: string; gradeLevel?: number } = {};
  if (now.name !== NO_NAME && now.name !== row.name) out.name = now.name;
  if (now.gradeLevel !== null && now.gradeLevel !== row.gradeLevel) out.gradeLevel = now.gradeLevel;
  return Object.keys(out).length > 0 ? out : null;
}
