/**
 * Keeps the shared article pool free of near-duplicates: two articles that a student would read
 * as "the same article again" (same subject, same angle), even when they came from different
 * source pages or different interests ("tesla" and "electric cars" both landing on the company page).
 *
 * Checked before an article is written, so a duplicate costs one small model call, not a rewrite.
 * A different angle on a familiar subject is fine (octopus camouflage, then octopus intelligence).
 */

import type Anthropic from "@anthropic-ai/sdk";
import { forJob } from "../models";

const STOP = new Set("a an the and or of to in on for with from by at is are was were how why what who its it this that these those your you new about into over under".split(" "));

function singular(w: string): string {
  if (w.length <= 4 || /(us|is|ss)$/.test(w)) return w;
  if (/(ses|xes|zes|ches|shes|oes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Content words of a title, lowercased, plurals made singular */
export function titleWords(title: string): Set<string> {
  return new Set(title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))
    .map(singular));
}

/** Share of the smaller title's content words that the other title also has (0-1) */
export function titleOverlap(a: string, b: string): number {
  const wa = titleWords(a), wb = titleWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size);
}

/** Titles this close are treated as the same article without asking a model */
export const SAME_TITLE = 0.8;

export interface ExistingArticle { id: number; title: string }

type Client = { messages: Pick<Anthropic["messages"], "create"> };

const SCHEMA = {
  type: "object",
  properties: { duplicate_of: { type: ["integer", "null"] } },
  required: ["duplicate_of"],
  additionalProperties: false,
} as const;

/**
 * The id of an existing article the candidate would duplicate, or null. `candidate.text` is the
 * start of the source page (or the article). Falls back to the title check alone if the model
 * call fails, so a failure never blocks writing.
 */
export async function findDuplicate(
  client: Client,
  candidate: { title: string; text: string },
  existing: ExistingArticle[],
): Promise<number | null> {
  if (existing.length === 0) return null;
  const byTitle = existing.find(e => titleOverlap(candidate.title, e.title) >= SAME_TITLE);
  if (byTitle) return byTitle.id;

  const list = existing.slice(0, 300);
  try {
    // The standard model: a wrong "duplicate" throws away a good story, a miss repeats one
    const response = await client.messages.create(forJob("standard", {
      max_tokens: 100,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: `A children's reading app is about to write a new article from this source.

NEW SOURCE: "${candidate.title}"
${candidate.text.split(/\s+/).slice(0, 120).join(" ")}

ARTICLES IT ALREADY HAS:
${list.map(e => `${e.id}. ${e.title}`).join("\n")}

Would a student who read one of the existing articles feel the new one is the same article again, because it is about the same specific subject from the same angle (for example a company overview after another company overview of the same company)? A different angle or a different part of a broad subject is NOT a duplicate (octopus camouflage vs octopus intelligence; volcano eruptions vs a famous volcano).

Reply with the id of the article it duplicates, or null.`,
      }],
    }) as Anthropic.MessageCreateParamsNonStreaming);
    const text = response.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
    const id = (JSON.parse(text) as { duplicate_of: number | null }).duplicate_of;
    return id !== null && list.some(e => e.id === id) ? id : null;
  } catch (e) {
    console.error("Duplicate check failed, using the title check only:", (e as Error).message);
    return null;
  }
}
