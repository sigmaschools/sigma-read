/** Fixed copy for the onboarding interest chat, so every student gets the same clear start and end */

/** Sigma's first message (the owner's own copy; quoted in interest-interview.md too, keep in sync) */
export function interviewOpener(name: string): string {
  return `Hi ${name}, I'm Sigma. SigmaRead is an app that helps you become a stronger reader by giving you articles matched to your interests. To get started, tell me three things you're interested in — they can be hobbies, topics, sports, whatever you like.`;
}

/** The name Sigma calls the student: the first word only ("Maya Lopez" → "Maya"), never the full form-letter name */
export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "there";
}

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
  const list = joinList(interests);
  // Capitalize "dogs" but leave mixed-case names like "iPhone" alone
  const first = list.split(/\s/)[0];
  const start = list && first === first.toLowerCase() ? `${list[0].toUpperCase()}${list.slice(1)}` : list;
  const heard = list ? `${start}, got it! ` : "Got it! ";
  const answer = reply?.trim() ? `${reply.trim()} ` : "";
  return `${answer}${heard}I'm finding your first articles now. While I do, here's a quick look at how SigmaRead works.`;
}
