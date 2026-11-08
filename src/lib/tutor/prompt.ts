/**
 * The system prompt for Sigma, the redesigned tutor: who Sigma is (md/character.md), example
 * conversations (md/examples.md), then this article, the guide's prep notes for it and the
 * kid's age. Plain text in, plain text out: scoring lives in observer.ts, not in the reply.
 *
 * Two cache blocks: the character and examples are the same for every conversation; the
 * article block is the same for every turn of one conversation.
 */

import characterMd from "./md/character.md";
import examplesMd from "./md/examples.md";
import type { GuideNotes } from "./guide-notes";

export interface SigmaPromptArgs {
  articleTitle: string;
  articleText: string;
  level: number;
  notes?: GuideNotes | null;
  /** Another character and examples, for evals that compare prompt versions; the app uses md/ */
  voice?: { character: string; examples: string } | null;
}

/** How Sigma pitches each reading level: who the kid is and roughly how long a message runs */
export const LEVEL_VOICE: Record<number, { kid: string; length: string }> = {
  1: { kid: "a 7- or 8-year-old (second or third grade)", length: "one or two short sentences, about 10 to 30 words, everyday words, one thing at a time, always concrete" },
  2: { kid: "an 8- or 9-year-old (third or fourth grade)", length: "one to three short sentences, about 15 to 40 words, concrete and direct" },
  3: { kid: "a 10- or 11-year-old (fifth or sixth grade)", length: "two or three sentences, about 25 to 55 words; why and how are fair game" },
  4: { kid: "a 12-year-old (seventh grade)", length: "two to four sentences, about 30 to 65 words; connections between ideas are fair game" },
  5: { kid: "a 13-year-old (eighth grade)", length: "two to four sentences, about 30 to 75 words; what the article implies is fair game" },
  6: { kid: "a 14-year-old who reads well", length: "three or four sentences, about 35 to 85 words; room for a thought of your own now and then, still light and on the article" },
};

export function levelVoice(level: number) {
  return LEVEL_VOICE[Math.min(6, Math.max(1, Math.round(level)))] ?? LEVEL_VOICE[3];
}

export function formatNotes(notes: GuideNotes): string {
  const lines: string[] = [
    "YOUR NOTES FROM READING IT (your own reactions, written before the chat; use them when they fit, don't recite them)",
    "These notes come from the full article. The kid's version above may leave a detail out: if something in these notes isn't in the article text above, don't bring it up.",
  ];
  if (notes.worthTalkingAbout?.length) {
    lines.push("Worth talking about:");
    for (const w of notes.worthTalkingAbout) lines.push(`- ${w.idea} (your take: ${w.take})`);
  }
  if (notes.vividDetails?.length) lines.push("Details you loved: " + notes.vividDetails.join("; "));
  if (notes.likelyConfusions?.length) {
    lines.push("Where a kid might get it wrong, and what the article says:");
    for (const c of notes.likelyConfusions) lines.push(`- ${c.confusion}: ${c.articleSays}`);
  }
  if (notes.goodMoves?.length) lines.push("Moves you could make: " + notes.goodMoves.join(" / "));
  return lines.join("\n");
}

/** The two system blocks, in order; put cache_control on each */
export function sigmaSystemBlocks(args: SigmaPromptArgs): [string, string] {
  const voice = levelVoice(args.level);
  const stable = `${(args.voice?.character ?? characterMd).trim()}\n\n${(args.voice?.examples ?? examplesMd).trim()}`;
  const article = [
    `THIS CONVERSATION`,
    `You're talking with ${voice.kid}. Pitch everything to them: ${voice.length}. Length comes from their age and the moment, not from a count; a quiet kid gets a shorter message, a kid on a roll can get a longer one.`,
    ``,
    `ARTICLE: ${args.articleTitle}`,
    `---`,
    args.articleText.trim(),
    `---`,
    ...(args.notes ? ["", formatNotes(args.notes)] : []),
    ``,
    `Your first message: your reaction to one specific thing in the article, in your own words, then one move. The system will name a starting point and a way in; other kids reading this article get different ones, so stick to yours. Never "great article", never a greeting.`,
    `Every message after that: react to what they said, add something of your own, hand it back with one move. Keep going until the system tells you to close.`,
  ].join("\n");
  return [stable, article];
}

/** The whole prompt as one string (for evals and tests) */
export function sigmaSystemPrompt(args: SigmaPromptArgs): string {
  return sigmaSystemBlocks(args).join("\n\n");
}
