/**
 * One tutor turn of a comprehension conversation: build the model messages, call the tutor,
 * score the reply and decide whether the conversation is complete.
 *
 * Shared by the chat route and the offline eval harness (scripts/eval-conversations.ts), so
 * the harness exercises the same completion rules students get. No DB access here.
 */

import Anthropic from "@anthropic-ai/sdk";
import { parseProgressResponse, clampDelta } from "@/lib/progress-scoring";
import { REPLY_SCHEMA } from "@/lib/report-schema";
import { parseJsonResponse } from "@/lib/claude-json";

/** Safety backstop: wrap up after this many real student messages */
export const MAX_STUDENT_MESSAGES = 6;

export const OPENER_INSTRUCTION = "[The student just finished reading. Start the conversation. Open the way a real person would — share one specific thing from the article that you found surprising, interesting, or worth talking about. Make it feel like you actually read it too. Then invite the student in with a single open directive. No greetings, no 'great article', no generic openers. The student has not said anything yet — this is your first message.]";

/** Earned: the student reached the progress threshold. Forced: the backstop ran out of turns. */
export type ClosingKind = "earned" | "forced";

export function closingTargetWords(maxWords: number): number {
  // Never at or above the cap itself, even for a small cap
  return Math.min(maxWords - 1, Math.max(8, maxWords - 5));
}

export function closingInstruction(kind: ClosingKind, maxWords?: number): string {
  const body = kind === "earned"
    ? "The student has shown solid understanding. Wrap up in one warm sentence that picks out one specific idea they explained and reacts to the idea itself, like \"Turtles breathing through their backsides is such a strange trick.\" No verdict on them: no \"You nailed it\", \"Great job\", \"Awesome\" or similar praise, and no stock sign-off like \"Cool chat!\" or \"Nice chatting\"."
    : "We're out of time for this conversation. Wrap up in one warm sentence that names one specific thing the student said or noticed. Don't claim they got the key parts, nailed it or mastered the article. If their last answer missed the point, work the right answer into the goodbye in a few plain words, as the article states it, without saying they were wrong and without opening with Yeah (that tells them they were right). If nothing they said was on track, skip naming something they said: give that answer and thank them for sticking with it, without praise. No stock sign-off such as \"Nice chatting\" or \"Thanks for chatting\": the specific thing is the goodbye.";
  // Short caps (L1-L2) get a target below the cap, since closings overshoot them by a few words.
  // Larger caps don't: there a target near the cap made closings longer, not shorter
  const target = maxWords && maxWords <= 20 ? `, so aim for about ${closingTargetWords(maxWords)}` : "";
  const length = maxWords ? ` Keep it under ${maxWords} words${target}.` : "";
  return `[SYSTEM: This is your final message. ${body}${length} Do not ask a question. Respond with JSON: {"message": "your closing sentence", "progressDelta": 0}]`;
}

/** A student answer this short (in words) counts as a short answer for the quiet-kid nudge */
const SHORT_ANSWER_WORDS = 4;

export const QUIET_NUDGE = "[Their last two answers were very short. This turn, don't ask another question. Tell them one interesting detail from the article that hasn't come up yet, in your own words, and end with a light invite like \"Wild, right?\" or \"I didn't expect that.\"]";

/**
 * True when the student keeps giving very short answers ("yeah", "idk", "it was cool"): more
 * questions then make the chat feel like a quiz, so Sigma shares something instead. Fires on the
 * 2nd, 4th, 6th... short answer in a row, so the nudge never runs two turns in a row and Sigma
 * still asks in between. A short question from the student ("why the Moon?") is not a short answer.
 */
export function needsQuietNudge(messages: TurnMessage[]): boolean {
  const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
  const isShortAnswer = (t: string) => words(t) <= SHORT_ANSWER_WORDS && !t.trim().endsWith("?");
  const answers = messages.filter(m => m.role === "user");
  let streak = 0;
  for (let i = answers.length - 1; i >= 0 && isShortAnswer(answers[i].content); i--) streak++;
  return streak >= 2 && streak % 2 === 0;
}

/** Used when the model asks a question in its closing anyway */
export const FALLBACK_CLOSING = "That's it for this one. Thanks for talking it through with me.";

/** Used if the model returns an empty mid-conversation message */
export const FALLBACK_PROMPT = "Tell me a little more about that.";

/** Used if the model returns an empty opener */
export const FALLBACK_OPENER = "Tell me about the part of the article that stuck with you most.";

export interface TurnMessage { role: string; content: string }

export interface TurnResult {
  message: string;
  progressDelta: number;
  progressScore: number;
  complete: boolean;
  /** Set when this turn was the closing message */
  closing: ClosingKind | null;
  /** Set when the model's message was replaced, so evals can count model failures */
  usedFallback: "closing_question" | "empty" | null;
}

/**
 * @param messages conversation so far, including the student's latest message (empty for the opener)
 * @param priorProgress progress score before this student message
 */
export async function runTutorTurn(args: {
  /** Plain or usage-tracked client; only messages.create is used */
  client: { messages: Pick<Anthropic["messages"], "create"> };
  model: string;
  systemPrompt: string;
  messages: TurnMessage[];
  priorProgress: number;
  /** The level's word cap, repeated in the closing instruction (it otherwise runs long at L1) */
  maxWords: number;
}): Promise<TurnResult> {
  const exchangeNumber = args.messages.filter(m => m.role === "user").length;
  const forceComplete = exchangeNumber >= MAX_STUDENT_MESSAGES;
  // The threshold was reached on an earlier turn; the tutor's reply then still expected an answer,
  // so the closing comes one exchange later, here.
  const alreadyComplete = args.priorProgress >= 100 && exchangeNumber >= 3;
  let closing: ClosingKind | null = alreadyComplete ? "earned" : forceComplete ? "forced" : null;

  const finalMessages: { role: "user" | "assistant"; content: string }[] = args.messages.length > 0
    ? args.messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content }))
    : [{ role: "user", content: OPENER_INSTRUCTION }];
  if (closing) finalMessages.push({ role: "user", content: closingInstruction(closing, args.maxWords) });
  const nudged = !closing && needsQuietNudge(args.messages);
  if (nudged) finalMessages.push({ role: "user", content: QUIET_NUDGE });

  async function ask(messages: typeof finalMessages) {
    const request = { model: args.model, max_tokens: 1024, system: args.systemPrompt, messages };
    const response = await args.client.messages.create({
      ...request,
      output_config: { format: { type: "json_schema", schema: REPLY_SCHEMA } },
    }).catch(e => {
      // If the API ever rejects the schema (e.g. a model without structured outputs), keep the
      // student's chat working: retry as plain text and let parseProgressResponse handle it
      if (e instanceof Anthropic.BadRequestError) {
        console.error("Structured tutor turn rejected, retrying as text:", e.message);
        return args.client.messages.create(request);
      }
      throw e;
    });
    // Structured output guarantees the JSON shape; fall back to the old text parser on a refusal or cut-off
    const assistantText = response.content.filter(b => b.type === "text").map(b => b.text).join("");
    const structured = parseJsonResponse<{ message: string; progressDelta: number }>(response);
    return structured?.message?.trim() ? structured : parseProgressResponse(assistantText);
  }

  const parsed = await ask(finalMessages);
  // The prompt bans quiz-show questions and long turns, but the model still slips (live tests):
  // ask once for a rewrite. The score stays from the first reply, since it grades the same answer.
  const problem = closing ? null : rewriteReason(parsed.message || "", args.maxWords, nudged, lastTutorMessage(args.messages));
  if (problem) {
    console.warn(`Tutor turn ${problem.kind}, asking for a rewrite`);
    const retry = await ask([...finalMessages, { role: "user", content: problem.instruction(parsed.message || "") }]).catch(e => {
      console.error("Tutor rewrite failed, keeping the first reply:", e);
      return null;
    });
    if (retry?.message?.trim()) parsed.message = retry.message;
  }
  // The closing turn scores nothing: the instruction asks for 0, and an answer given after
  // the threshold (or at the backstop) shouldn't change the in-chat score
  const progressDelta = closing ? 0 : clampDelta(parsed.progressDelta);
  const progressScore = args.priorProgress + progressDelta;

  let message = (parsed.message || "").replace("[CONVERSATION_COMPLETE]", "").trim();
  // Never end the session on a question the student can't answer, or show an empty turn
  let usedFallback: TurnResult["usedFallback"] = null;
  if (!message) {
    usedFallback = "empty";
    message = closing ? FALLBACK_CLOSING : args.messages.length === 0 ? FALLBACK_OPENER : FALLBACK_PROMPT;
  } else if (closing && endsWithQuestion(message)) {
    usedFallback = "closing_question";
    message = FALLBACK_CLOSING;
  }

  // Past the threshold the tutor sometimes says goodbye on its own instead of asking. Treat that
  // as the earned closing, so the student isn't left with a goodbye and an open reply box.
  if (!closing && progressScore >= 100 && exchangeNumber >= 3 && !endsWithQuestion(message) && soundsLikeGoodbye(message)) {
    closing = "earned";
    console.warn("Tutor said goodbye before the closing instruction; treating it as the earned closing");
  }

  // Complete only on a closing turn. When the threshold is first crossed mid-conversation, the
  // tutor's reply still ends with a directive, so the student answers once more and the next
  // turn closes cleanly.
  const complete = closing !== null;

  return { message, progressDelta, progressScore, complete, closing, usedFallback };
}

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** The last sentence of a message (where its question is) */
function lastSentence(text: string): string {
  const parts = text.trim().split(/(?<=[.!?])\s+/);
  return parts[parts.length - 1] ?? "";
}

/**
 * True if the message ends in a question a kid can answer with one word: either/or
 * ("skill or luck?") or a long yes/no ("Does it surprise you that...?"). Short tag invites
 * after a share ("Wild, right?", "Would you have guessed that?") are fine.
 */
export function endsWithClosedQuestion(text: string): boolean {
  // A menu hidden in a directive is the same pick-one: "Tell me what you'd build first — the
  // detector, the horn, or the lights — and why."
  if (!endsWithQuestion(text)) return endsWithMenu(text);
  const q = lastSentence(text);
  if (/\bor\b/i.test(q) && !/\bor not\b/i.test(q)) {
    // "What matters more — skill or luck?" is a menu; "How did scientists or engineers do it?" is open
    if (/[—–,:]\s*[^,—–:?]*\bor\b[^?]*\?/.test(q)) return true;
    if (!/^["'“]?(how|why)\b/i.test(q)) return true;
  }
  return /^["'“]?(do|does|did|is|are|was|were|would|could|can|will|have|has|should)\b/i.test(q) && words(q) > 6;
}

/** True if the last sentence offers options to pick from ("the detector, the horn, or the lights") */
export function endsWithMenu(text: string): boolean {
  const q = lastSentence(text);
  // Only a list the student is told to choose from: "Seals, whales, or penguins all handle cold" is a share
  if (!/\b(pick|choose|which|first|rather|prefer|tell me what (part|kind|one))\b/i.test(q)) return false;
  // "A, B, or C" lists, or ", or one that..." alternatives after a dash or comma
  return /[^,.?!]{1,40},\s[^,.?!]{1,40},\s*or\s/i.test(q) || /[—–,]\s*(one|a|an|the)\b[^,.?!—–]*,?\s*or\s+(one|a|an|the)\b/i.test(q);
}

/** Sigma's last message before this turn, or null on the opener */
function lastTutorMessage(messages: TurnMessage[]): string | null {
  return [...messages].reverse().find(m => m.role === "assistant")?.content ?? null;
}

/** A short tag after a share ("Wild, right?", "Would you have guessed that?"): an invite, not a question to answer */
function isLightInvite(text: string): boolean {
  if (!endsWithQuestion(text)) return false;
  const q = lastSentence(text);
  // It follows a share: the text before it is a statement, not another question
  const before = text.trim().slice(0, text.trim().length - q.length).trim();
  if (!before || endsWithQuestion(before)) return false;
  // "Pretty wild, right?", "Huh?", "Would you have guessed that?" — not "Why?" or "Is that right?"
  if (/^["'“]?(why|how|what|who|where|when|is|are|do|does|did|was|were|would|could|can|will|have|has)\b/i.test(q)
    && !/^["'“]?(would|could|can) you (have )?(guessed|believe|imagine|expect) (that|it)\?/i.test(q)) return false;
  return /(,\s*(right|huh)|(guessed|believe|imagine|expect) (that|it))\?[\s"'”’)\]\p{Extended_Pictographic}]*$/iu.test(q) || /^(pretty |so |kinda )?(really|right|huh|wild|crazy|weird|nuts|cool|amazing)\?/i.test(q.trim());
}

/**
 * True when this reply would make two questions in a row (or opens on one). Sigma mostly gives
 * directives ("Pick a fact that stands out and tell me why"); a question now and then is fine,
 * all questions is a quiz (the owner, 2026-11-01).
 */
export function questionInARow(message: string, prevMessage: string | null): boolean {
  if (!endsWithQuestion(message) || isLightInvite(message)) return false;
  return prevMessage === null || (endsWithQuestion(prevMessage) && !isLightInvite(prevMessage));
}

/** Why a (non-closing) tutor reply needs a rewrite, if it does */
export function rewriteReason(message: string, maxWords: number, nudged = false, prevMessage: string | null = null): { kind: string; instruction: (m: string) => string } | null {
  if (!message.trim()) return null;
  const closed = endsWithClosedQuestion(message);
  const asksAgain = !closed && !nudged && questionInARow(message, prevMessage);
  const long = words(message) > Math.round(maxWords * 1.5);
  if (!closed && !asksAgain && !long) return null;
  const fixes = [
    asksAgain ? "it ends with a question, and too many questions make this feel like a quiz. Keep your thought, but end with a directive instead (\"Pick the part that... and tell me why\", \"Imagine you were... and tell me...\")" : "",
    closed
      ? nudged
        // The quiet-kid turn shares instead of asking, so the fix is a light invite, not a new question
        ? "it ends with a yes/no question or options to pick from. Keep the detail you shared, but end with a light invite (\"Wild, right?\"), not a question to answer"
        : "it ends with a yes/no question or options to pick from, which a kid answers with one word. Keep your thought, but end with a directive instead (\"Tell me why...\", \"Pick the part that... and explain...\"), with no options to pick from"
      : "",
    long ? `it is ${words(message)} words. Say the same thing in under ${maxWords} words` : "",
  ].filter(Boolean).join("; and ");
  return {
    kind: [closed && "ended in a closed question", asksAgain && "ended in a question where a directive was expected", long && "ran long"].filter(Boolean).join(" and "),
    instruction: m => `[Your reply was: "${m}". Write it again: ${fixes}. Same progressDelta.]`,
  };
}

/** True if the text ends in a question, ignoring trailing quotes, brackets and emoji */
export function endsWithQuestion(text: string): boolean {
  return /\?[\s"'”’)\]\p{Extended_Pictographic}]*$/u.test(text);
}

/**
 * A sign-off rather than a prompt: the last sentence says goodbye and asks nothing of the student.
 * "Thanks for talking games with me, this was fun!" is one; "Thanks for that, tell me more." is not.
 */
export function soundsLikeGoodbye(text: string): boolean {
  const last = text.trim().split(/(?<=[.!?])\s+/).at(-1) ?? "";
  const signOff = /\b(thanks|thank you|bye|goodbye|see you|was fun|fun talking|nice talking|great talking|talking with me|chatting with me)\b/i;
  const directive = /\b(tell|say|explain|describe|think|imagine|pick|show|walk|share|try|look|guess|what|why|how|which|would|could)\b/i;
  return signOff.test(last) && !directive.test(last);
}
