/**
 * Rule checks on a finished conversation transcript, from docs/conversation-design.md.
 * Pure functions so they can be unit tested and reused on real transcripts later.
 */

import { endsWithQuestion } from "../../src/lib/conversation-turn";

export interface Msg { role: "user" | "assistant"; content: string }

/** Rough word ceilings per level, from the message-length table in conversation-design.md */
export const MAX_TUTOR_WORDS: Record<number, number> = { 1: 15, 2: 20, 3: 40, 4: 40, 5: 50, 6: 50 };

// Praise as a reaction at the start of a sentence ("Nice!", "Great job."), not "perfect camouflage"
const BANNED_PRAISE = /(^|[.!?]\s+)(nice|exactly right|great job|awesome|cool|great work|amazing|perfect)\b/i;
const CORRECTION_ACTUALLY = /(^|[.!?]\s+)actually\b/i;
const MARKDOWN = /(\*\*|__|^#+\s|^\s*[-*]\s|`)/m;
const CHORE_FRAMING = /\b(sooner (we|you)('re| are)? (finish|done)|get through this)\b/i;

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

export interface Violation { turn: number; rule: string; text: string }

/**
 * @param closingIndex index of the tutor's closing message, if the conversation completed
 */
export function checkTranscript(messages: Msg[], level: number, closingIndex: number | null): Violation[] {
  const out: Violation[] = [];
  const limit = MAX_TUTOR_WORDS[level] ?? 40;

  messages.forEach((m, i) => {
    if (m.role !== "assistant") return;
    const t = m.content.trim();
    const isClosing = i === closingIndex;

    if (wordCount(t) > limit * 1.25) out.push({ turn: i, rule: "too_long", text: t });
    if ((t.match(/\?/g) || []).length > 1) out.push({ turn: i, rule: "stacked_questions", text: t });
    if (BANNED_PRAISE.test(t)) out.push({ turn: i, rule: "empty_praise", text: t });
    if (CORRECTION_ACTUALLY.test(t)) out.push({ turn: i, rule: "actually_correction", text: t });
    if (MARKDOWN.test(t)) out.push({ turn: i, rule: "markdown", text: t });
    if (CHORE_FRAMING.test(t)) out.push({ turn: i, rule: "chore_framing", text: t });
    if (isClosing && endsWithQuestion(t)) out.push({ turn: i, rule: "closing_question", text: t });
    if (!isClosing && !endsWithPrompt(t)) out.push({ turn: i, rule: "no_directive", text: t });
  });
  return out;
}

const DIRECTIVE_VERBS = "tell|walk|explain|describe|show|talk|say|pick|imagine|think|give|look|find|share|name|compare|check";
const DIRECTIVE = new RegExp(`(^|[—–:;]\\s*|\\s-\\s|\\bso\\s)(and |now |ok,? |okay,? )?(${DIRECTIVE_VERBS})\\b`, "i");

/** A mid-conversation tutor message should end by inviting a reply */
function endsWithPrompt(text: string): boolean {
  if (endsWithQuestion(text)) return true;
  const last = text.split(/(?<=[.!?])\s+/).pop() || text;
  // The directive can open the sentence or follow a dash, colon or "so": "Check the part about X — tell me what..."
  if (DIRECTIVE.test(last)) return true;
  // After a comma or "and" only the unambiguous forms count: "...and tell me why" but not "Yeah, give or take"
  return /(,\s*|\band\s)(tell|walk) me\b/i.test(last);
}
