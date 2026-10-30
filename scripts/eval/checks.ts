/**
 * Rule checks on a finished conversation transcript, from docs/conversation-design.md.
 * Pure functions so they can be unit tested and reused on real transcripts later.
 */

export interface Msg { role: "user" | "assistant"; content: string }

/** Rough word ceilings per level, from the message-length table in conversation-design.md */
export const MAX_TUTOR_WORDS: Record<number, number> = { 1: 15, 2: 20, 3: 40, 4: 40, 5: 50, 6: 50 };

const BANNED_PRAISE = /\b(nice|exactly right|great job|awesome|cool|great work|amazing|perfect)\b[!.]?/i;
const CORRECTION_ACTUALLY = /(^|[.!?]\s+)actually\b/i;
const MARKDOWN = /(\*\*|__|^#+\s|^\s*[-*]\s|`)/m;
const CHORE_FRAMING = /\b(sooner (we|you)('re| are)? (finish|done)|get through this|almost done)\b/i;

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
    if (isClosing && t.endsWith("?")) out.push({ turn: i, rule: "closing_question", text: t });
    if (!isClosing && !endsWithPrompt(t)) out.push({ turn: i, rule: "no_directive", text: t });
  });
  return out;
}

/** A mid-conversation tutor message should end by inviting a reply */
function endsWithPrompt(text: string): boolean {
  if (text.endsWith("?")) return true;
  const last = text.split(/(?<=[.!?])\s+/).pop() || text;
  return /\b(tell me|walk me|explain|describe|show me|talk me|say more|what|why|how|which|pick|imagine|think about|give me)\b/i.test(last);
}
