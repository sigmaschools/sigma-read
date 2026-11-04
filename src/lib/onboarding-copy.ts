/** Fixed copy for the onboarding interest chat, so every student gets the same clear start and end */

/** Sigma's first message (the owner's own copy; quoted in interest-interview.md too, keep in sync) */
export function interviewOpener(name: string): string {
  return `Hi ${name}, I'm Sigma. SigmaRead is an app that helps you become a stronger reader by giving you articles matched to your interests. To get started, tell me three things you're interested in — they can be hobbies, topics, sports, whatever you like.`;
}

/** The name Sigma calls the student: the first word only ("Maya Lopez" → "Maya"), never the full form-letter name */
export function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  // "Lopez, Maya" is last-name-first; "Maya Lopez, Jr." is not
  const [before, after] = [trimmed.split(",")[0].trim(), trimmed.split(",").slice(1).join(",").trim()];
  const lastFirst = !/\s/.test(before) && !!after && !/^(jr|sr|ii|iii|iv)\.?$/i.test(after);
  const given = lastFirst ? after : trimmed;
  return given.split(/\s+/)[0]?.replace(/,+$/, "") || "there";
}

/** Longest [ANSWER] Sigma may put before the wrap-up; a longer one is dropped, not cut */
export const MAX_ANSWER_CHARS = 160;

/**
 * Sigma's short answer to the student's question, from an [ANSWER] line on the profile turn.
 * Anything without end punctuation, with a question, too long, or empty is dropped (the wrap-up
 * still reads fine without it).
 */
export function extractAnswer(text: string): string | null {
  const raw = text.match(/\[ANSWER\][ \t]*([^\n]*)/)?.[1] ?? "";
  const line = raw.replace(/\[PROFILE\][\s\S]*/, "").trim();
  // Keep the whole line (no cutting at "Mr." or "3.5"). The wrap-up screen has no reply box,
  // only "Next", so an answer holding a question is dropped.
  if (!/[.!]["')]?$/.test(line) || line.includes("?") || line.length > MAX_ANSWER_CHARS) return null;
  return line;
}

/** Text with any [ANSWER] tag removed (the answer itself stays), for turns that show the model's text */
export function stripAnswer(text: string): string {
  return text.replace(/[ \t]*\[ANSWER\][ \t]*/g, " ").replace(/^ | $/gm, "").trim();
}

/** Most interests named in the wrap-up; a longer list names one fewer and says "and N more" */
const MAX_NAMED = 6;

/** "a", "a and b", "a, b and c" */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Sigma's last message, shown above the "Next" button. Built in code because the model ran long
 * (47+ words) however the prompt capped it. Names every interest, so the student knows all were
 * heard. `reply` is Sigma's one-sentence answer when the student's last message asked Sigma
 * something; it goes first so the question isn't ignored.
 */
export function interviewWrapUp(interests: string[], reply?: string | null): string {
  const named = interests.length > MAX_NAMED ? [...interests.slice(0, MAX_NAMED - 1), `${interests.length - MAX_NAMED + 1} more`] : interests;
  const list = joinList(named);
  // Capitalize "dogs" but leave mixed-case names like "iPhone" alone
  const first = list.split(/\s/)[0];
  const start = list && first === first.toLowerCase() ? `${list[0].toUpperCase()}${list.slice(1)}` : list;
  const heard = list ? `${start}, got it! ` : "Got it! ";
  const answer = reply?.trim() ? `${reply.trim()} ` : "";
  return `${answer}${heard}I'm finding your first articles now. While I do, here's a quick look at how SigmaRead works.`;
}
