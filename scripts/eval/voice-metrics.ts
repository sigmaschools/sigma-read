/**
 * Measurable signs of a dry tutor, computed over the tutor's messages in a transcript. These
 * are the patterns found in the live transcripts of 2-7 Nov 2026 (see the plan doc): the same
 * "[reaction]. [Imagine/Pick X] and tell me Y." shape every turn, grader's remarks instead of a
 * person's reactions, flat energy. Pure functions, unit-tested in voice-metrics.test.ts.
 */

export interface VoiceMetrics {
  /** Tutor messages measured */
  messages: number;
  /** Share of messages containing "tell me" */
  tellMe: number;
  /** Share of messages containing "imagine" or "picture" */
  imagine: number;
  /** Share of messages with an exclamation mark */
  exclaim: number;
  /** Share of messages with a grader's remark ("smart guess", "good catch", "you put that together nicely") */
  grading: number;
  /** Share of messages whose first word also starts another message in the same conversation */
  repeatOpener: number;
  /** Share of messages whose last sentence starts with the same verb as the previous message's */
  repeatMove: number;
  /** Mean words per message */
  words: number;
  /** Coefficient of variation of message length (0 = every message the same length) */
  lengthVariety: number;
  /** Share of messages that ask the kid to argue ("make the case", "defend that", "convince me", "prove it") or announce pushback */
  debate: number;
  /** Share of messages that correct the kid ("look at that part again", "not quite", "one small thing") */
  corrects: number;
  /** Share of messages that end with a question mark */
  question: number;
}

const GRADING = /\b(smart (guess|point|move|idea|catch|way|pick|question)|good (catch|point|way|thinking|guess|question)|great (point|catch|idea|question|thinking)|nice (thinking|catch|point|pick)|sharp (point|catch|way)|clever (point|idea|thinking)|exactly (right|the kind)|you (put|tied|connected|spotted|caught|figured|nailed|got|used|picked|planned|read|noticed) (that|those|two|the|it|both|right|up|a|this|something)|that's (a|the) (good|great|smart|sharp|clever|clear|strong) (way|point|idea|catch|reason)|is a clear way|way to put it|well (put|said|done)|love that (you|idea)|good (one|job)|nicely)\b/i;

/** Debate-club moves: the 8 Nov 2026 pattern ("Make the case…" in four of seven turns, a counter-claim every turn) */
const DEBATE = /\b(make (the|your|a) case|defend (that|it|your|the|yourself)|convince me|argue (the|for|against|it|that|your|with)|prove (it|me|that|you)|the other side|push(ing)? back|i'll push|push on (that|it)|devil's advocate|take the opposite|hold that position)\b/i;
/** A correction of the kid: pointing them back to the text or telling them they have it wrong */
const CORRECTS = /\b(look (again|back|at (that|the|it) [^.?!]{0,30}again)|not quite|i don't think that's (quite )?(what|right|it|how)|that's not (quite )?(what|how|right)|one small thing|small thing:|quick check|reread|read (that|it|the \w+) again|check (that|the \w+) again|you (flipped|mixed|got that backwards|have (that|it) backwards))\b/i;

export const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

function firstWord(t: string): string {
  return (t.trim().toLowerCase().match(/[a-z']+/) ?? [""])[0];
}

function lastSentence(t: string): string {
  const parts = t.trim().split(/(?<=[.!?])\s+/);
  return parts[parts.length - 1] ?? "";
}

/** The verb the last sentence opens with, after "now", "so", "okay", "and" */
function moveVerb(t: string): string {
  const s = lastSentence(t).toLowerCase().replace(/^(now|so|okay|ok|and|but|then|here's the thing)[,:]?\s+/i, "");
  return (s.match(/[a-z']+/) ?? [""])[0];
}

export function voiceMetrics(tutorMessages: string[]): VoiceMetrics {
  const n = tutorMessages.length;
  if (n === 0) return { messages: 0, tellMe: 0, imagine: 0, exclaim: 0, grading: 0, repeatOpener: 0, repeatMove: 0, words: 0, lengthVariety: 0, debate: 0, corrects: 0, question: 0 };
  const share = (f: (m: string, i: number) => boolean) => tutorMessages.filter(f).length / n;
  const openers = tutorMessages.map(firstWord);
  const moves = tutorMessages.map(moveVerb);
  const lens = tutorMessages.map(words);
  const mean = lens.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(lens.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  return {
    messages: n,
    tellMe: share(m => /\btell me\b/i.test(m)),
    imagine: share(m => /\b(imagine|picture)\b/i.test(m)),
    exclaim: share(m => m.includes("!")),
    grading: share(m => GRADING.test(m)),
    repeatOpener: share((m, i) => openers[i] !== "" && openers.some((o, j) => j !== i && o === openers[i])),
    repeatMove: share((m, i) => i > 0 && moves[i] !== "" && moves[i] === moves[i - 1]),
    words: mean,
    lengthVariety: mean ? sd / mean : 0,
    debate: share(m => DEBATE.test(m)),
    corrects: share(m => CORRECTS.test(m)),
    question: share(m => m.trim().endsWith("?")),
  };
}

/** Average of several conversations' metrics (unweighted, so a short conversation counts like a long one) */
export function averageMetrics(all: VoiceMetrics[]): VoiceMetrics {
  const keys = Object.keys(all[0] ?? {}) as (keyof VoiceMetrics)[];
  const out = {} as VoiceMetrics;
  for (const k of keys) out[k] = all.length ? all.reduce((s, m) => s + m[k], 0) / all.length : 0;
  return out;
}
