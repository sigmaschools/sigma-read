/**
 * From an interest to stories. A bare interest word ("animals", "cooking", "airsoft") searched
 * as typed lands on the encyclopedia overview of the subject, and an overview in gives an overview
 * out. So before any search, a small model turns the interest into a few specific stories a kid
 * would click on: a real creature, person, event, machine, number or how-does-it-work question.
 * Each angle carries its own search query; the batch tries them in order.
 *
 * Pure prompt and parser here, so they can be tested without the API.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { forJob } from "../models";

export interface StoryAngle {
  /** The story in one line a kid would click on ("The fish that climbs waterfalls") */
  angle: string;
  /** A short web search for pages about this story */
  query: string;
  /** What makes it surprising or fun, for the writer's brief */
  why: string;
}

export const ANGLES_PER_INTEREST = 3;

const SCHEMA = {
  type: "object",
  properties: {
    angles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          angle: { type: "string" },
          query: { type: "string" },
          why: { type: "string" },
        },
        required: ["angle", "query", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["angles"],
  additionalProperties: false,
} as const;

export function anglesPrompt(interest: string, type: "interest" | "horizon", recentTitles: string[]): string {
  const next = type === "horizon"
    ? `This is a horizon article: a story NEXT TO "${interest}", in a nearby area the kid probably hasn't read about, that someone who likes "${interest}" would still click on.`
    : `Every story must be squarely about "${interest}" as a kid who said it most likely means it.`;
  return `A reading app writes one short nonfiction article a day for a kid aged 8 to 14 about something they love. The kid's interest, in their own words: "${interest}".

Suggest ${ANGLES_PER_INTEREST} specific stories to write, best first. ${next}

Each story is ONE concrete thing: a real creature, person, event, machine, record, mystery, number or how-does-it-work question. Things a kid would retell at dinner. Not an overview of the subject, not its history from the beginning, not a definition, not a list of types. For "animals": the bird that sleeps mid-flight, why wombats poop cubes, the fish that climbs waterfalls. For "cooking": why onions make you cry and how chefs beat it, the pizza oven that reaches 900 degrees, the kid who won a national baking contest. For "airsoft": how a hop-up makes a BB fly farther, the physics of a spring piston.

Rules:
- Vary the three: not three animals, not three records.
- Nothing about real war, weapons used on people, crime, politics, religion, or anything else unsuitable for a child's reading app. Sports, games, replica and toy guns, and history told for kids are fine.
- Skip stories the app already has articles on:
${recentTitles.length ? recentTitles.map(t => `  - ${t}`).join("\n") : "  (none yet)"}

For each story give:
- "angle": the story in one line, as a kid would see it
- "query": 3 to 7 words to search the web for pages about this exact story (proper names and concrete nouns, no filler)
- "why": one sentence on what makes it surprising or fun

Reply with JSON only: {"angles": [{"angle": "...", "query": "...", "why": "..."}, ...]}`;
}

/** Reads the model's reply; null if it can't be read or holds no usable angle */
export function parseAngles(text: string): StoryAngle[] | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { angles?: unknown };
    if (!Array.isArray(parsed.angles)) return null;
    const angles = parsed.angles
      .filter((a): a is StoryAngle => !!a && typeof a === "object"
        && typeof (a as StoryAngle).angle === "string" && (a as StoryAngle).angle.trim().length > 0
        && typeof (a as StoryAngle).query === "string" && (a as StoryAngle).query.trim().length > 0)
      .map(a => ({ angle: a.angle.trim(), query: a.query.trim(), why: typeof a.why === "string" ? a.why.trim() : "" }))
      .slice(0, ANGLES_PER_INTEREST);
    return angles.length > 0 ? angles : null;
  } catch {
    return null;
  }
}

/** The interest itself as the one angle, when the model gives nothing usable */
export function bareAngle(interest: string): StoryAngle {
  return { angle: interest, query: interest, why: "" };
}

type Client = { messages: Pick<Anthropic["messages"], "create"> };

/**
 * Story angles for an interest, best first. Falls back to the bare interest if the model call
 * fails or its reply can't be read, so a failure never blocks writing.
 * The writer model does this: choosing the story is the step that decides whether a kid wants to
 * read the article at all, so it gets the strongest model (quality over cost, user decision
 * 2026-11-08). The large max_tokens leaves room for its thinking.
 */
export async function storyAngles(client: Client, interest: string, type: "interest" | "horizon", recentTitles: string[]): Promise<StoryAngle[]> {
  try {
    const response = await client.messages.create(forJob("writer", {
      max_tokens: 4000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: anglesPrompt(interest, type, recentTitles.slice(0, 60)) }],
    }) as Anthropic.MessageCreateParamsNonStreaming);
    const text = response.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
    return parseAngles(text) ?? [bareAngle(interest)];
  } catch (e) {
    console.error(`Story angles failed for "${interest}", searching the interest itself:`, (e as Error).message);
    return [bareAngle(interest)];
  }
}
