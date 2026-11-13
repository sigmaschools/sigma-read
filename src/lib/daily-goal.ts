/**
 * How many articles make a student's reading day.
 *
 * Compass sets each learner's daily goal for reading in XP, and says what that is in articles in
 * the profile note it opens SigmaRead with (app contract 1.11, `student.goal.units`: 30 XP at
 * 10 XP an article is 3). The Compass sign-in stores it on the student; the home page stops
 * offering articles there and shows the end screen Compass closes. A student Compass has said
 * nothing about reads three, as before.
 */
import type { CompassStudentNote } from "./compass-profile";

export const DEFAULT_DAILY_GOAL = 3;
/** More than a school day holds: a mistyped plan must not ask for ninety articles */
const MAX_DAILY_GOAL = 20;

/** The day's goal in articles from a checked note, or null when the note does not give one */
export function goalFromNote(student: CompassStudentNote): number | null {
  const goal = student.goal;
  if (!goal || typeof goal !== "object") return null;
  // `units` counts what SigmaRead earns XP for in Compass's registry (named "exercise" there): a finished article
  const units = goal.units;
  if (typeof units !== "number" || !Number.isInteger(units) || units < 1) return null;
  return Math.min(units, MAX_DAILY_GOAL);
}

export function dailyGoalOf(student: { dailyGoalArticles: number | null }): number {
  return student.dailyGoalArticles && student.dailyGoalArticles > 0 ? student.dailyGoalArticles : DEFAULT_DAILY_GOAL;
}

/** The most articles served in a day: the admin's cap, and never fewer than the goal */
export function effectiveDailyCap(student: { dailyGoalArticles: number | null; dailyArticleCap: number | null }): number {
  return Math.max(student.dailyArticleCap || 5, dailyGoalOf(student));
}
