/**
 * The switch between the two tutors. "classic" is the production tutor of November 2026
 * (src/lib/prompts/md/comprehension-conversation + conversation-turn.ts); "sigma" is the
 * redesign in this folder. A conversation keeps the design it started with.
 *
 * Set TUTOR_DESIGN=sigma in the environment to start new conversations on the redesign; anything
 * else (or unset) keeps the classic tutor. Tutorial articles always use the classic tutor.
 */

export type TutorDesign = "classic" | "sigma";

export function tutorDesignForNewConversation(env: Record<string, string | undefined> = process.env): TutorDesign {
  return env.TUTOR_DESIGN?.trim().toLowerCase() === "sigma" ? "sigma" : "classic";
}
