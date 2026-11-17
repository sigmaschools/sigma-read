/**
 * Answer points: the discussion's progress bar moves by how good each answer is.
 *
 * The tutor already scores every student answer 0-40 (`progressDelta`: 0-10 a non-answer, 11-20
 * a fact repeated, 21-30 an explanation in their own words, 31-40 an inference or connection).
 * With answer points on, that score becomes the bar's move: a thin answer nudges it, a good one
 * jumps it, and the discussion ends the moment the bar is full. A good answer's points float up
 * above the bar for a second; a thin one moves the bar quietly, and the tutor asks for more in
 * its own words. Nothing here changes XP: the article counts as read as before.
 *
 * On only for the learners listed below while the owner tries it. See docs/answer-points.md.
 */

/** Compass learner ids (students.external_id) that get answer points: the test learner account */
export const ANSWER_POINTS_LEARNERS: ReadonlySet<string> = new Set([
  "bb41aac7-6d24-4dcf-aae0-30203739a8fe",
]);

/** Backstop with answer points: the discussion ends here even if the bar isn't full (6 without) */
export const ANSWER_POINTS_MAX_STUDENT_MESSAGES = 10;

/** Points at or above this float above the bar; below it the bar moves quietly */
export const GOOD_ANSWER_POINTS = 16;
/** Points at or above this float bigger, bolder and in their own colour */
export const GREAT_ANSWER_POINTS = 26;

/**
 * The bar's move for one answer, from the tutor's 0-40 score. Thin answers (a non-answer or a
 * fact repeated) move it 2 or 5; an explanation moves it 16-25 and an inference 26-35, so about
 * four or five good answers fill it and a run of thin ones barely moves it.
 */
export function pointsForScore(score: number): number {
  const s = Math.max(0, Math.min(40, Math.round(Number.isFinite(score) ? score : 0)));
  if (s <= 10) return 2;
  if (s <= 20) return 5;
  return s - 5;
}

export type AnswerTier = "quiet" | "good" | "great";

export function answerTier(points: number): AnswerTier {
  return points >= GREAT_ANSWER_POINTS ? "great" : points >= GOOD_ANSWER_POINTS ? "good" : "quiet";
}

interface PointedMessage { role: string; points?: number }

/**
 * Whether a conversation runs with answer points: the student is listed, the tutor is the classic
 * or spring one (the redesigned tutor scores in its own observer), it isn't the tutorial, and every
 * answer so far carries points. That last part keeps a conversation that began without them on the
 * old bar if the list grows while it is open.
 */
export function answerPointsOn(args: {
  externalId: string | null | undefined;
  design: string;
  isTutorial: boolean;
  /** Student messages before the one being answered now */
  priorMessages: PointedMessage[];
  learners?: ReadonlySet<string>;
}): boolean {
  const learners = args.learners ?? ANSWER_POINTS_LEARNERS;
  if (!args.externalId || !learners.has(args.externalId)) return false;
  if (args.isTutorial || args.design === "sigma") return false;
  return args.priorMessages.filter(m => m.role === "user").every(m => typeof m.points === "number");
}

/** True when the student's last scored answer was thin: the tutor then gets HELP_NOTE */
export function lastAnswerWasThin(messages: PointedMessage[]): boolean {
  const last = [...messages].reverse().find(m => m.role === "user" && typeof m.points === "number");
  return last !== undefined && (last.points as number) < GOOD_ANSWER_POINTS;
}

/**
 * The floor: after a thin answer, a second thin one gets an easier way in rather than another
 * open directive, so a student who is trying but stuck can still fill the bar.
 */
export const HELP_NOTE = "[Their last answer was thin. If this one is thin too (a few words, a guess, or a fact repeated without explaining it), make your next directive easier to answer well: point them to one specific part of the article, name the detail, and ask them to explain it in their own words. Stay warm and plain. Never mention points, scores or the progress bar.]";
