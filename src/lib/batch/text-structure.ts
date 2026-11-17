/**
 * How a nonfiction article is organized. Reading tests ask students to name a text's structure,
 * and a reader meets all five only if the articles vary, so the batch asks each new base article
 * for the structure used least among the recent ones. The writer may pick another when the
 * story won't bear it, and says which it used; that answer is what is stored
 * (article_cache.text_structure, on base articles only). Pure functions, no database.
 */

export const TEXT_STRUCTURES = [
  {
    id: "sequence",
    brief: "Tell it in time order: what happened first, next and last, or the steps of how something works. Signal the order with words like first, then, after, by the time, finally.",
  },
  {
    id: "cause_effect",
    brief: "Build it around why something happens and what it leads to: one cause and its effects, or one effect traced back to its causes. Signal the links with words like because, so, as a result, that is why, which led to.",
  },
  {
    id: "problem_solution",
    brief: "Set out a real problem early, then the ways people tried to solve it and how well each worked. Signal it with words like the problem was, to fix this, the solution, it worked because.",
  },
  {
    id: "compare_contrast",
    brief: "Hold two things side by side (two animals, two inventions, then and now) and show how they are alike and how they differ. Signal it with words like both, unlike, while, however, on the other hand.",
  },
  {
    id: "description",
    brief: "Describe one thing through its parts or features, one paragraph per feature, so the reader builds a full picture of it. Signal it with words like for example, one feature, another, also, in addition.",
  },
] as const;

export type TextStructure = (typeof TEXT_STRUCTURES)[number]["id"];

const IDS: readonly string[] = TEXT_STRUCTURES.map(s => s.id);

/** The structure the model named, or null when it named none we know */
export function parseStructure(raw: unknown): TextStructure | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/_and_/g, "_");
  return IDS.includes(id) ? (id as TextStructure) : null;
}

/**
 * The structure to ask for next: the one used least among the recent base articles (newest
 * first), ties going to the one used longest ago, then to the list's order. Never the newest
 * one's again. Unknown or missing entries (articles written before structures were tracked)
 * don't count.
 */
export function nextStructure(recent: readonly (string | null)[]): TextStructure {
  const known = recent.map(parseStructure);
  const score = (id: TextStructure) => {
    const lastSeen = known.indexOf(id); // 0 = newest; -1 = not in the window
    return { count: known.filter(s => s === id).length, age: lastSeen === -1 ? Infinity : lastSeen };
  };
  const newest = known.find(s => s !== null) ?? null;
  let best: TextStructure | null = null;
  for (const { id } of TEXT_STRUCTURES) {
    if (id === newest) continue;
    if (best === null) { best = id; continue; }
    const a = score(id), b = score(best);
    if (a.count < b.count || (a.count === b.count && a.age > b.age)) best = id;
  }
  return best!;
}

/** The writer's brief for a structure; nothing when there is none */
export function structureLine(structure: TextStructure | undefined): string {
  if (!structure) return "";
  const { brief } = TEXT_STRUCTURES.find(s => s.id === structure)!;
  return `\nHOW IT IS ORGANIZED: ${brief} Use this structure for the whole article, so a reader could say how it is organized, but let it serve the story: never a template, never a label like "Cause:". If the story truly can't be told this way, use whichever of ${IDS.join(", ")} fits it best.\n`;
}

/** The line that asks the writer to name the structure it used, inside the output JSON */
export const STRUCTURE_FIELD = `"structure": "the one of ${IDS.join(" | ")} the article uses",`;
