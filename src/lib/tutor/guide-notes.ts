/**
 * The guide's prep notes for an article: what a Guide who read it carefully would want to talk
 * about, their own honest reactions, the details worth bringing up, where a kid is likely to go
 * wrong, and a few good discussion moves. Written once per base article (the ideas are the same
 * at every level; Sigma adapts them to the kid) and shared by every student who reads it.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { MODELS, requestSettings } from "../models";
import { parseJsonResponse } from "../claude-json";

export interface GuideNotes {
  /** Two or three ideas most worth a conversation, each with Sigma's own take */
  worthTalkingAbout: { idea: string; take: string }[];
  /** Vivid, surprising or funny details, in Sigma's words */
  vividDetails: string[];
  /** What a kid might misread, and what the article actually says */
  likelyConfusions: { confusion: string; articleSays: string }[];
  /** Discussion moves that fit this article: scenarios, dares, sides to pick */
  goodMoves: string[];
}

export const GUIDE_NOTES_SCHEMA = {
  type: "object",
  properties: {
    worthTalkingAbout: {
      type: "array",
      items: { type: "object", properties: { idea: { type: "string" }, take: { type: "string" } }, required: ["idea", "take"], additionalProperties: false },
    },
    vividDetails: { type: "array", items: { type: "string" } },
    likelyConfusions: {
      type: "array",
      items: { type: "object", properties: { confusion: { type: "string" }, articleSays: { type: "string" } }, required: ["confusion", "articleSays"], additionalProperties: false },
    },
    goodMoves: { type: "array", items: { type: "string" } },
  },
  required: ["worthTalkingAbout", "vividDetails", "likelyConfusions", "goodMoves"],
  additionalProperties: false,
} as const;

export function guideNotesPrompt(title: string, bodyText: string): string {
  return `You are Sigma, a Guide at Sigma School: a favorite older cousin, late teens, who reads everything and is about to talk about this article with a kid who also just read it. Before the chat, write your own prep notes. These are your private notes, in your own voice (plain, quick, honest, a little playful, no grading language), and they must stay true to the article: nothing the article doesn't say.

ARTICLE: ${title}
---
${bodyText.trim()}
---

Write:
- worthTalkingAbout: the 2 or 3 ideas in this article most worth a real conversation (not a list of facts: the things that make someone think). For each, your own honest take in one sentence: which side you'd pick, what you keep wondering, what surprised you.
- vividDetails: 3 to 5 details from the article that you can't get past: the strange number, the gross part, the thing that's secretly unfair, the funny image. One short line each, in your words.
- likelyConfusions: 1 to 3 things a kid could easily get backwards or misread, each with what the article actually says, in plain words.
- goodMoves: 3 to 5 conversation moves that fit this article: a scenario to drop the kid into, a side to make them defend, a dare, a "what would you do" moment. Short, no questions that a sentence from the article could answer.

Keep every line short. Opinions only on everyday things; on anything political, religious or contested, note it as a thing to ask the kid about instead.`;
}

/** Only messages.create is used, so a usage-tracked client works too */
type Client = { messages: Pick<Anthropic["messages"], "create"> };

export interface NotesOptions {
  /** Defaults to the article-writing model and its settings in models.ts */
  model?: string;
  settings?: Record<string, unknown>;
}

export async function writeGuideNotes(client: Client, title: string, bodyText: string, opts?: NotesOptions): Promise<GuideNotes | null> {
  const model = opts?.model ?? MODELS.writer;
  const settings = opts?.settings ?? requestSettings(model, "writer");
  const own = (settings as { output_config?: Record<string, unknown> }).output_config ?? {};
  const response = await client.messages.create({
    ...settings,
    model,
    max_tokens: 4000,
    messages: [{ role: "user", content: guideNotesPrompt(title, bodyText) }],
    output_config: { ...own, format: { type: "json_schema", schema: GUIDE_NOTES_SCHEMA } },
  } as Anthropic.MessageCreateParamsNonStreaming);
  const notes = parseJsonResponse<GuideNotes>(response);
  return notes && isGuideNotes(notes) ? notes : null;
}

export function isGuideNotes(x: unknown): x is GuideNotes {
  if (!x || typeof x !== "object") return false;
  const n = x as Record<string, unknown>;
  return Array.isArray(n.worthTalkingAbout) && Array.isArray(n.vividDetails) && Array.isArray(n.likelyConfusions) && Array.isArray(n.goodMoves);
}
