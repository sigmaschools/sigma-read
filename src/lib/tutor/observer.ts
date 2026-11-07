/**
 * The observer: a second, cheaper call that reads each student message and keeps the private
 * notes the tutor used to keep inside its own reply (the 0-40 progress note per answer, what the
 * kid has shown so far, a one-line steer for the next turn, and whether the talk has done its
 * job). Taking this out of the tutor's mouth is what stops Sigma sounding like a grader.
 *
 * The progress scale is unchanged from the old in-reply note, so progressScore, the
 * comprehension report and the Compass report block see the same numbers as before.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { MODELS, requestSettings } from "../models";
import { parseJsonResponse } from "../claude-json";
import { clampDelta } from "../progress-scoring";

export interface ObserverNotes {
  /** 0-40: how much this student message showed about their understanding */
  progressDelta: number;
  /** Running summary of what the kid has shown so far (replaces the previous one) */
  shown: string;
  /** One line for Sigma's next turn, or "" when the conversation is going fine on its own */
  steer: string;
  /** The kid's last message asks Sigma something that deserves an answer */
  askedQuestion: boolean;
  /** The conversation has done its job: close on the next tutor turn */
  done: boolean;
}

export const OBSERVER_SCHEMA = {
  type: "object",
  properties: {
    progressDelta: { type: "integer" },
    shown: { type: "string" },
    steer: { type: "string" },
    askedQuestion: { type: "boolean" },
    done: { type: "boolean" },
  },
  required: ["progressDelta", "shown", "steer", "askedQuestion", "done"],
  additionalProperties: false,
} as const;

/** Fewest student messages before the observer may close the conversation */
export const MIN_EXCHANGES = 4;
/** The conversation closes on the turn after this many student messages, whatever the observer says */
export const MAX_EXCHANGES = 8;

export interface ObserverArgs {
  client: { messages: Pick<Anthropic["messages"], "create"> };
  articleText: string;
  level: number;
  /** Conversation so far, ending with the student's latest message */
  messages: { role: string; content: string }[];
  /** The observer's previous notes, if any */
  previous: ObserverNotes | null;
  /** Progress score before this student message */
  priorProgress: number;
  model?: string;
  settings?: object;
}

export function observerPrompt(args: Omit<ObserverArgs, "client" | "model" | "settings">): string {
  const exchanges = args.messages.filter(m => m.role === "user").length;
  const transcript = args.messages.map(m => `${m.role === "user" ? "Kid" : "Sigma"}: ${m.content}`).join("\n\n");
  return `You are watching a reading discussion between Sigma (a Guide) and a kid at reading level ${args.level} of 6 (1 is about grade 2, 6 about grade 9). They both read the article below; the kid has it open. You keep Sigma's private notes so Sigma can just talk. The kid never sees these notes, and Sigma never mentions them.

ARTICLE
---
${args.articleText.trim()}
---

CONVERSATION SO FAR (the kid's latest message is last)
${transcript}

PREVIOUS NOTES: ${args.previous ? JSON.stringify(args.previous) : "none yet"}
Progress so far: ${args.priorProgress}. Student messages so far: ${exchanges}.

Write the new notes.

progressDelta (0-40): how much the kid's LATEST message showed about their understanding of the article. Quality, not length; a kid's three words can show more than a paragraph.
- 0-10: non-answer (one word, "idk", a copied sentence, off-topic), or a question back with nothing else
- 11-20: surface recall (restated a fact correctly), or an opinion with nothing from the article behind it
- 21-30: an explanation in their own words, or an opinion backed by something from the article
- 31-40: depth (an inference, a connection, applying an idea to something new, pushing back with a reason)
A wrong answer stated confidently is 0-10. A right answer in a kid's messy words is still 21-30.

shown: in one or two sentences, what this kid has shown so far about the article as a whole (cumulative, replacing the previous notes). Name what they've got and what's still untested.

steer: one short line for Sigma's next turn, or an empty string if the conversation is going fine. Useful steers: "they flipped cause and effect on the slingshot; point them to that paragraph", "they've got the main idea; go to why it matters", "two short answers in a row; share something instead of asking", "they asked whether bees die when they sting; answer it". Never a question for Sigma to ask verbatim, never a quiz.

askedQuestion: true if the kid's latest message asks Sigma something that deserves an answer.

done: true only when ALL of these hold: at least ${MIN_EXCHANGES} student messages; the kid has shown the main idea in their own words AND gone one step past it (a why, a how, an application, an opinion with a reason, or a connection); and the kid's latest message is not a question for Sigma. A kid who has clearly checked out (three non-answers in a row) after ${MIN_EXCHANGES} messages is also done. Otherwise false.`;
}

export async function observe(args: ObserverArgs): Promise<ObserverNotes> {
  const model = args.model ?? MODELS.observer;
  const settings = (args.settings ?? requestSettings(model, "observer")) as { output_config?: Record<string, unknown> };
  const response = await args.client.messages.create({
    ...settings,
    model,
    max_tokens: 1000,
    messages: [{ role: "user", content: observerPrompt(args) }],
    output_config: { ...(settings.output_config ?? {}), format: { type: "json_schema", schema: OBSERVER_SCHEMA } },
  } as Anthropic.MessageCreateParamsNonStreaming);
  const notes = parseJsonResponse<ObserverNotes>(response);
  const exchanges = args.messages.filter(m => m.role === "user").length;
  if (!notes) {
    // A refusal or cut-off: keep the conversation going, score nothing
    return { progressDelta: 0, shown: args.previous?.shown ?? "", steer: "", askedQuestion: false, done: false };
  }
  return {
    progressDelta: clampDelta(Number(notes.progressDelta) || 0),
    shown: String(notes.shown ?? ""),
    steer: String(notes.steer ?? "").trim(),
    askedQuestion: Boolean(notes.askedQuestion),
    done: Boolean(notes.done) && exchanges >= MIN_EXCHANGES && !notes.askedQuestion,
  };
}
