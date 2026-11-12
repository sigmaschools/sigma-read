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

/** The grade to start from: SigmaRead's own when it has one, else Compass's */
export function startingGrade(own: number | null, student: CompassStudentNote): number | null {
  return own ?? gradeFromNote(student.grade);
}
