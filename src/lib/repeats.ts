/**
 * Keeps a student from being served an article that reads like one they already have.
 *
 * The pool's duplicate check (batch/dedup.ts) runs before an article is written and allows a
 * different angle on a familiar subject, which is right for the pool. But one student can still
 * meet two articles that tell the same story: "How Cooking Changed Humanity Forever", then "The
 * Ancient Art of Smoking Food" the next day, both opening with early humans and fire, citing the
 * same 780,000-year-old site in Israel and the same Egyptian, medieval and Chinese history.
 *
 * This check runs when articles are served: the candidates are compared with the student's
 * recent articles (title and opening), first by title words, then with one light-model call.
 * A failed model call serves as before, so it never empties a feed. Pure; the student's recent
 * articles and topics are read in recent-reading.ts.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { forJob } from "./models";
import { titleOverlap, SAME_TITLE } from "./batch/dedup";

type Client = { messages: Pick<Anthropic["messages"], "create"> };

export interface ArticleGist { title: string; opening: string }
export interface RepeatCandidate extends ArticleGist { id: number }

/** How far back a student's articles count, and how many of them the check sees */
export const REPEAT_DAYS = 30;
/** Topics served this many days back are avoided when serving, if anything else is left */
export const TOPIC_SPACING_DAYS = 2;
export const MAX_HISTORY = 40;
/** Words of each article's opening shown to the model */
const OPENING_WORDS = 70;

/** The first `words` words of an article body, on one line */
export function opening(body: string | null | undefined, words = OPENING_WORDS): string {
  return (body ?? "").split(/\s+/).filter(Boolean).slice(0, words).join(" ");
}

const SCHEMA = {
  type: "object",
  properties: { repeats: { type: "array", items: { type: "integer" } } },
  required: ["repeats"],
  additionalProperties: false,
} as const;

export function repeatsPrompt(candidates: RepeatCandidate[], history: ArticleGist[]): string {
  return `A children's reading app is choosing articles for one student.

ARTICLES THE STUDENT ALREADY HAS (recent first):
${history.map(h => `- "${h.title}": ${h.opening}`).join("\n")}

CANDIDATES:
${candidates.map(c => `${c.id}. "${c.title}": ${c.opening}`).join("\n")}

Which candidates would this student feel are the same article again, compared with an article they already have or an earlier candidate in this list? That is either:
- the same specific subject, even with a different title or wording (two overviews of the same company), or
- the same story told again: the same history, examples or opening scene, so it reads like a rerun even though the subject's name differs (a history of cooking, then a history of smoking food that opens with the same early humans around the same fires).

A new angle on a subject the student likes is NOT a repeat: octopus camouflage after octopus intelligence, a famous volcano after how eruptions work, blanching after a history of cooking. Only mark a candidate when the student would recognise it.

Reply with the ids of the repeat candidates, or an empty list.`;
}

/**
 * Ids of candidates that repeat something in `history`. Title near-matches are caught without a
 * model call; the rest go to one light-model call. If that call fails, only the title matches count.
 */
export async function findRepeats(
  client: Client,
  candidates: RepeatCandidate[],
  history: ArticleGist[],
): Promise<Set<number>> {
  const repeats = new Set<number>();
  if (candidates.length === 0 || history.length === 0) return repeats;

  for (const c of candidates) {
    if (history.some(h => titleOverlap(c.title, h.title) >= SAME_TITLE)) repeats.add(c.id);
  }
  const rest = candidates.filter(c => !repeats.has(c.id));
  if (rest.length === 0) return repeats;

  try {
    const response = await client.messages.create(forJob("light", {
      max_tokens: 200,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: repeatsPrompt(rest, history.slice(0, MAX_HISTORY)) }],
    }) as Anthropic.MessageCreateParamsNonStreaming);
    const text = response.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
    const ids = (JSON.parse(text) as { repeats: number[] }).repeats;
    for (const id of ids) if (rest.some(c => c.id === id)) repeats.add(id);
  } catch (e) {
    console.error("Repeat check failed, using the title check only:", (e as Error).message);
  }
  return repeats;
}

/**
 * Pick articles, check the picks for repeats, and pick again without the repeats, up to `rounds`
 * times. `pick(excluded)` must not return an excluded id. The last round's picks are filtered
 * without a further pick, so a repeat is never served, but a slot can stay empty.
 */
export async function pickWithoutRepeats<T extends { id: number }>(
  pick: (excluded: Set<number>) => T[] | Promise<T[]>,
  check: (picks: T[]) => Promise<Set<number>>,
  rounds = 3,
): Promise<T[]> {
  const excluded = new Set<number>();
  const approved = new Set<number>();
  let picks: T[] = [];
  for (let round = 0; round < rounds; round++) {
    picks = await pick(excluded);
    const unchecked = picks.filter(p => !approved.has(p.id));
    if (unchecked.length === 0) return picks;
    const repeats = await check(unchecked);
    unchecked.forEach(p => repeats.has(p.id) ? excluded.add(p.id) : approved.add(p.id));
    if (repeats.size === 0) return picks;
  }
  return picks.filter(p => !excluded.has(p.id));
}
