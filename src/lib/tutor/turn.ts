/**
 * One of Sigma's turns: plain text in, plain text out. The reply can stream to the student as
 * it is written. Operator notes (the opener, the observer's steer, the quiet-kid nudge, the
 * closing instruction) go in as system messages inside the conversation, so the model never
 * sees them as something the kid said.
 *
 * Shared by the chat route and the eval (scripts/eval-voice.ts). No DB access here.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { endsWithQuestion, endsWithMenu, needsQuietNudge, type ClosingKind, type TurnMessage } from "../conversation-turn";
import { levelVoice } from "./prompt";
import type { GuideNotes } from "./guide-notes";

export const SIGMA_OPENER = "The kid just finished reading and hasn't said anything yet. Start the conversation: your reaction to one specific thing in the article, in your own words, then one move. No greeting, no \"great article\".";

/** Ways into a conversation; one is picked per conversation so openers on the same article differ */
export const OPENER_SHAPES = [
  "a detail that made you think \"wait, really?\"",
  "a confession: something you'd have guessed wrong, or wouldn't have believed before reading it",
  "the funniest or strangest thing in it, and why it got you",
  "a tiny scene from the article, told as if you were standing there",
  "the one thing you're still wondering about after reading it",
  "something ordinary from your own day that the article made you see differently",
];

/**
 * The opener instruction for one conversation. With prep notes, every conversation on an
 * article would otherwise start from the same idea (the eval measured 24-40% repeated
 * openers), so the starting point and the shape are drawn per conversation. `pick` is a
 * number in [0, 1); pass one in tests, leave it to Math.random in the app.
 */
export function sigmaOpener(notes: GuideNotes | null | undefined, pick: number = Math.random()): string {
  const starts = notes
    ? [...notes.worthTalkingAbout.map(i => `${i.idea} (your take: ${i.take})`), ...notes.vividDetails]
    : [];
  const shape = OPENER_SHAPES[Math.floor(pick * OPENER_SHAPES.length) % OPENER_SHAPES.length];
  const start = starts.length
    ? `Start from this one, not from whatever comes first in the article or in your notes: ${starts[Math.floor(pick * 7919) % starts.length]}.`
    : "Start from something in the middle or the end of the article, not its first paragraph.";
  return `${SIGMA_OPENER} ${start} The way in this time: ${shape}.`;
}

export const SIGMA_QUIET_NUDGE = "Note to self: two very short answers in a row. Don't ask anything this time. Share one thing from the article they haven't brought up, the way you'd tell a friend, and end with a light invite like \"Wild, right?\" or just stop.";

export function sigmaClosing(kind: ClosingKind, level: number): string {
  const voice = levelVoice(level);
  const base = kind === "earned"
    ? "This is your last message. Say goodbye like a person: one last reaction to something specific they said, or the thing you'll keep wondering about, or a dare for next time. Not a verdict on them (no \"you really got this\"), not a summary of what they said, no stock sign-off like \"nice chatting\"."
    : "This is your last message; the conversation is out of time. Say goodbye like a person, naming one specific thing they said or noticed. Don't claim they got it or did great. If their last answer missed the point, fold in what the article says, as a plain fact, without saying they were wrong and without opening with \"Yeah\".";
  return `${base} If they just asked you something, answer it inside the goodbye. Don't ask a question. Keep it to a sentence or two (you're talking with ${voice.kid}).`;
}

export const SIGMA_FALLBACK_CLOSING = "That's it for this one. Thanks for talking it through with me.";
export const SIGMA_FALLBACK_PROMPT = "Say more, I want to hear this.";
export const SIGMA_FALLBACK_OPENER = "Tell me about the part of the article that stuck with you most.";

/** Models that accept {role: "system"} messages inside the conversation */
export function supportsSystemMessages(model: string): boolean {
  return /^claude-(opus-5|sonnet-5-5|fable-5|mythos-5|haiku-5-5)/.test(model);
}

/**
 * A debate-club move: the 8 Nov 2026 pattern ("Make the case…" in four of seven turns) that
 * Sigma's character rules out. Checked live so one slip gets a rewrite instead of reaching the kid.
 */
export function asksForDebate(text: string): boolean {
  return /\b(make (the|your|a) case|defend (that|it|your|the|yourself)|convince me|argue (the|for|against|it|that|your|with)|prove (it|me|that|you)|(take|argue|try) the other side|push(ing)? back on (that|it|you)|devil's advocate)\b/i.test(text);
}

type Create = Pick<Anthropic["messages"], "create">;
type Stream = Pick<Anthropic["messages"], "stream">;

export interface SigmaTurnArgs {
  /** Plain or usage-tracked client; messages.stream is used when onDelta is given and it exists */
  client: { messages: Create | (Create & Stream) };
  model: string;
  /** Extra request fields for the model (thinking, effort) */
  settings?: object;
  /** From sigmaSystemBlocks: [character and examples, this article] */
  systemBlocks: [string, string];
  /** Conversation so far, including the student's latest message (empty for the opener) */
  messages: TurnMessage[];
  level: number;
  /** Set when this turn closes the conversation */
  closing: ClosingKind | null;
  /** The observer's steer for this turn, if any */
  steer?: string | null;
  /** The guide's prep notes, used to vary the opener (ignored after the first turn) */
  guideNotes?: GuideNotes | null;
  /** Fixes the opener's random draw (tests and evals that want repeatable openers) */
  openerPick?: number;
  /** Streams the reply's text as it is written */
  onDelta?: (text: string) => void;
}

export interface SigmaTurnResult {
  message: string;
  /** Set when the model's message was replaced or rewritten, so evals can count it */
  fixed: "empty" | "closing_question" | "menu" | "debate" | null;
  /** Tutor API calls made (1, or 2 after a rewrite) */
  calls: number;
}

type Msg = { role: "user" | "assistant" | "system"; content: string };

/** Operator note for the model: a system message where the model supports it, a bracketed user message otherwise */
function note(model: string, text: string): Msg {
  return supportsSystemMessages(model) ? { role: "system", content: text } : { role: "user", content: `[${text}]` };
}

/** Strip the markdown the model adds anyway: emphasis, headings, list markers */
export function plain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|[.,!?]|$)/g, "$1$2")
    .replace(/(^|\s)_(\S[^_]*?)_(?=\s|[.,!?]|$)/g, "$1$2")
    .replace(/^#+\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .trim();
}

export async function runSigmaTurn(args: SigmaTurnArgs): Promise<SigmaTurnResult> {
  const history: Msg[] = args.messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
  const isOpener = history.length === 0;
  const notes: Msg[] = [];
  if (isOpener) notes.push({ role: "user", content: sigmaOpener(args.guideNotes, args.openerPick) });
  else if (args.closing) notes.push(note(args.model, sigmaClosing(args.closing, args.level)));
  else {
    if (needsQuietNudge(args.messages)) notes.push(note(args.model, SIGMA_QUIET_NUDGE));
    else if (args.steer?.trim()) notes.push(note(args.model, `Note to self: ${args.steer.trim()}`));
  }
  const messages = mergeNotes([...history, ...notes]);
  let calls = 0;

  const ask = async (msgs: Msg[], stream: boolean): Promise<string> => {
    calls++;
    const request = {
      ...args.settings,
      model: args.model,
      max_tokens: 1024,
      system: args.systemBlocks.map(text => ({ type: "text" as const, text, cache_control: { type: "ephemeral" as const } })),
      messages: msgs,
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;
    const m = args.client.messages;
    if (stream && args.onDelta && "stream" in m && typeof m.stream === "function") {
      const s = m.stream(request as Anthropic.MessageStreamParams);
      s.on("text", t => args.onDelta?.(t));
      const final = await s.finalMessage();
      return final.content.filter(b => b.type === "text").map(b => b.text).join("");
    }
    const res = await m.create(request);
    return res.content.filter(b => b.type === "text").map(b => b.text).join("");
  };

  let message = plain(await ask(messages, true));
  let fixed: SigmaTurnResult["fixed"] = null;

  // The one check that still earns its keep: a menu ("the detector, the horn or the lights") gets a
  // one-word pick. Ask once for a rewrite; keep the first reply if that fails.
  if (message && !args.closing && endsWithMenu(message)) {
    fixed = "menu";
    const retry = await ask([...messages, { role: "assistant", content: message }, note(args.model, "Rewrite that last message without the list of options to pick from: let them come up with the answer themselves. Same voice, same length. Reply with the new message only.")], false)
      .then(plain).catch(() => "");
    if (retry) message = retry;
  }
  // A debate move ("make the case", "convince me") is against the character; one rewrite, then keep what came back
  if (message && !fixed && asksForDebate(message)) {
    fixed = "debate";
    const retry = await ask([...messages, { role: "assistant", content: message }, note(args.model, "That asks them to argue or defend something, which isn't how you talk. Rewrite the last message with the same reaction and one easy move instead (something to pick, picture or say), no debating. Same voice, same length. Reply with the new message only.")], false)
      .then(plain).catch(() => "");
    if (retry && !asksForDebate(retry)) message = retry;
  }
  if (args.closing && message && endsWithQuestion(message)) {
    fixed = "closing_question";
    const retry = await ask([...messages, { role: "assistant", content: message }, note(args.model, "That ends with a question, and the kid can't reply any more. Rewrite it as a goodbye with no question in it. Reply with the new message only.")], false)
      .then(plain).catch(() => "");
    message = retry && !endsWithQuestion(retry) ? retry : SIGMA_FALLBACK_CLOSING;
  }
  if (!message) {
    fixed = "empty";
    message = args.closing ? SIGMA_FALLBACK_CLOSING : isOpener ? SIGMA_FALLBACK_OPENER : SIGMA_FALLBACK_PROMPT;
  }
  return { message, fixed, calls };
}

/** Consecutive user messages (a bracketed note after the kid's message) merge into one turn */
function mergeNotes(msgs: Msg[]): Msg[] {
  const out: Msg[] = [];
  for (const m of msgs) {
    const last = out[out.length - 1];
    if (last && last.role === "user" && m.role === "user") last.content = `${last.content}\n\n${m.content}`;
    else out.push({ ...m });
  }
  return out;
}
