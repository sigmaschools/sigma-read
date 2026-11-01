/** Fixed copy for the onboarding interest chat, so every student gets the same clear start and end */

/** Sigma's first message (the owner's own copy; quoted in interest-interview.md too, keep in sync) */
export function interviewOpener(name: string): string {
  return `Hi ${name}, I'm Sigma. SigmaRead is an app that helps you become a stronger reader by giving you articles matched to your interests. To get started, tell me three things you're interested in — they can be hobbies, topics, sports, whatever you like.`;
}

/** "a", "a and b", "a, b and c" */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Sigma's last message, shown above the "Next" button. Built in code because the model ran long
 * (47+ words) however the prompt capped it.
 */
export function interviewWrapUp(interests: string[]): string {
  const named = interests.slice(0, 3);
  const heard = named.length > 0 ? `${joinList(named)}, got it! ` : "Got it! ";
  return `${heard}I'm finding your first articles now. While I do, here's a quick look at how SigmaRead works.`;
}
