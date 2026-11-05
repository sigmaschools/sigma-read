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

export interface ArticleGist { title: string; excerpt: string }
export interface RepeatCandidate extends ArticleGist { id: number }

/** How far back a student's articles count, and how many of them the check sees */
export const REPEAT_DAYS = 30;
/** Topics served this many days back are avoided when serving, if anything else is left */
export const TOPIC_SPACING_DAYS = 2;
export const MAX_HISTORY = 40;
/** Words of each article's opening shown to the model */
const OPENING_WORDS = 60;
/** Sentences with numbers or dates added from the rest of the article, and their length cap */
const FACT_SENTENCES = 3;
const FACT_WORDS = 30;
/** The model calls for one serving may take this long in total; after that, or after a failure, only the title check runs */
export const CHECK_BUDGET_MS = 6000;

/** Shared by the checks of one serving, so a slow or failing model costs at most one wait */
export interface CheckBudget { until: number; failed: boolean }
export function checkBudget(ms = CHECK_BUDGET_MS): CheckBudget {
  return { until: Date.now() + ms, failed: false };
}

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/**
 * What the model sees of an article: its opening, then the first few sentences from the rest that
 * carry a number or date ("780,000 years ago", "By 3000 BCE"). Two articles telling the same
 * story share those facts even when their openings differ.
 */
export function excerpt(body: string | null | undefined): string {
  const all = words(body ?? "");
  const head = all.slice(0, OPENING_WORDS).join(" ");
  const rest = all.slice(OPENING_WORDS).join(" ");
  const facts = (rest.match(/[^.!?]+[.!?]/g) ?? [])
    .map(s => s.trim())
    .filter(s => /\d{3,}|\d,\d{3}/.test(s))
    .slice(0, FACT_SENTENCES)
    .map(s => words(s).slice(0, FACT_WORDS).join(" "));
  return facts.length ? `${head} … ${facts.join(" … ")}` : head;
}

const SCHEMA = {
  type: "object",
  properties: { repeats: { type: "array", items: { type: "integer" } } },
  required: ["repeats"],
  additionalProperties: false,
} as const;

export function repeatsPrompt(candidates: RepeatCandidate[], history: ArticleGist[]): string {
  return `A children's reading app is choosing articles for one student.

ARTICLES THE STUDENT ALREADY HAS (recent first; opening, then … dated facts from later on):
${history.map(h => `- "${h.title}": ${h.excerpt}`).join("\n")}

CANDIDATES:
${candidates.map(c => `${c.id}. "${c.title}": ${c.excerpt}`).join("\n")}

Which candidates would this student feel are the same article again, compared with an article they already have or an earlier candidate in this list? That is either:
- the same specific subject, even with a different title or wording (two overviews of the same company), or
- the same story told again: the same history, examples or opening scene, so it reads like a rerun even though the subject's name differs (a history of bread, then a history of ovens that retells the same ancient Egyptian bakeries and the same dates).

If two candidates repeat each other, mark only the later one.

A new angle on a subject the student likes is NOT a repeat: octopus camouflage after octopus intelligence, a famous volcano after how eruptions work, how yeast makes bread rise after a history of bread. Only mark a candidate when the student would recognise it.

Reply with the ids of the repeat candidates, or an empty list.`;
}

/**
 * Ids of candidates that repeat something in `history` (the caller keeps it to MAX_HISTORY).
 * Title near-matches are caught without a model call; the rest go to one light-model call.
 * If that call fails or the budget is spent, only the title matches count; `strict` (for the
 * eval) throws instead, so an unreachable model can't pass for "no repeats".
 */
export async function findRepeats(
  client: Client,
  candidates: RepeatCandidate[],
  history: ArticleGist[],
  opts: { budget?: CheckBudget; strict?: boolean } = {},
): Promise<Set<number>> {
  const repeats = new Set<number>();
  // Nothing to compare: no history and a single candidate (two candidates are compared with each other)
  if (candidates.length === 0 || (history.length === 0 && candidates.length < 2)) return repeats;

  for (const c of candidates) {
    if (history.some(h => titleOverlap(c.title, h.title) >= SAME_TITLE)) repeats.add(c.id);
  }
  const rest = candidates.filter(c => !repeats.has(c.id));
  if (rest.length === 0) return repeats;

  const budget = opts.budget ?? checkBudget();
  const timeout = budget.until - Date.now();
  if (budget.failed || timeout <= 0) return repeats;

  try {
    const response = await client.messages.create(forJob("light", {
      max_tokens: 200,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: repeatsPrompt(rest, history) }],
    }) as Anthropic.MessageCreateParamsNonStreaming, { timeout, maxRetries: 0 });
    const text = response.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
    const ids = (JSON.parse(text) as { repeats: number[] }).repeats;
    for (const id of ids) if (rest.some(c => c.id === id)) repeats.add(id);
  } catch (e) {
    if (opts.strict) throw e;
    budget.failed = true;
    console.error("Repeat check failed, using the title check only:", (e as Error).message);
  }
  return repeats;
}

/**
 * Pick articles, check the picks for repeats, and pick again without the repeats, up to `rounds`
 * times. `pick(excluded)` must not return an excluded id. `check` gets the new picks and the ones
 * already approved, so a replacement is also compared with the rest of the serving. The last round's picks are filtered
 * without a further pick, so a repeat is never served, but a slot can stay empty.
 */
export async function pickWithoutRepeats<T extends { id: number }>(
  pick: (excluded: Set<number>) => T[] | Promise<T[]>,
  check: (unchecked: T[], approved: T[]) => Promise<Set<number>>,
  rounds = 3,
): Promise<T[]> {
  const excluded = new Set<number>();
  const approved = new Set<number>();
  let picks: T[] = [];
  for (let round = 0; round < rounds; round++) {
    picks = await pick(excluded);
    const unchecked = picks.filter(p => !approved.has(p.id));
    if (unchecked.length === 0) return picks;
    const repeats = await check(unchecked, picks.filter(p => approved.has(p.id)));
    unchecked.forEach(p => repeats.has(p.id) ? excluded.add(p.id) : approved.add(p.id));
    if (repeats.size === 0) return picks;
  }
  return picks.filter(p => !excluded.has(p.id));
}
