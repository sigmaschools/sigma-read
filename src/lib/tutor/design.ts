/**
 * The switch between the two tutors. "classic" is the production tutor of November 2026
 * (src/lib/prompts/md/comprehension-conversation + conversation-turn.ts); "sigma" is the
 * redesign in this folder. A conversation keeps the design it started with.
 *
 * "spring" is the tutor of spring 2026 (the May 2026 prompt on Claude Opus 4.6, restored 8 Nov 2026
 * after the owner found the redesign worse): springConversationPrompt + runTutorTurn({ spring: true }).
 *
 * Set TUTOR_DESIGN=sigma (or spring) in the environment to start new conversations on that design; anything
 * else (or unset) keeps the classic tutor. Tutorial articles always use the classic tutor.
 */

export type TutorDesign = "classic" | "sigma" | "spring";

export function tutorDesignForNewConversation(env: Record<string, string | undefined> = process.env): TutorDesign {
  const value = env.TUTOR_DESIGN?.trim().toLowerCase();
  return value === "sigma" ? "sigma" : value === "spring" ? "spring" : "classic";
}
