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

export function closingInstruction(kind: ClosingKind, maxWords?: number): string {
  const body = kind === "earned"
    ? "The student has shown solid understanding. Wrap up in one warm sentence that names something specific they got right."
    : "We're out of time for this conversation. Wrap up in one warm sentence that names one specific thing the student said or noticed. Don't claim they got the key parts, nailed it or mastered the article. If their last answer missed the point, work the right answer into the goodbye in a few plain words, as the article states it, without saying they were wrong and without opening with Yeah (that tells them they were right). If nothing they said was on track, skip naming something they said: give that answer and thank them for sticking with it, without praise.";
  const length = maxWords ? ` Keep it under ${maxWords} words.` : "";
  return `[SYSTEM: This is your final message. ${body}${length} Do not ask a question. Respond with JSON: {"message": "your closing sentence", "progressDelta": 0}]`;
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
  const closing: ClosingKind | null = alreadyComplete ? "earned" : forceComplete ? "forced" : null;

  const finalMessages: { role: "user" | "assistant"; content: string }[] = args.messages.length > 0
    ? args.messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content }))
    : [{ role: "user", content: OPENER_INSTRUCTION }];
  if (closing) finalMessages.push({ role: "user", content: closingInstruction(closing, args.maxWords) });

  const request = { model: args.model, max_tokens: 1024, system: args.systemPrompt, messages: finalMessages };
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
  const parsed = structured?.message?.trim() ? structured : parseProgressResponse(assistantText);
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

  // Complete only on a closing turn. When the threshold is first crossed mid-conversation, the
  // tutor's reply still ends with a directive, so the student answers once more and the next
  // turn closes cleanly.
  const complete = closing !== null;

  return { message, progressDelta, progressScore, complete, closing, usedFallback };
}

/** True if the text ends in a question, ignoring trailing quotes, brackets and emoji */
export function endsWithQuestion(text: string): boolean {
  return /\?[\s"'”’)\]\p{Extended_Pictographic}]*$/u.test(text);
}
