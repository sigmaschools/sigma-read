/**
 * Matching free text ("Sharkz!", "great whites", "the planets") to topic slugs. Pure: the
 * caller supplies the index (built from the topics and topic_aliases tables).
 */

/** Lowercase, strip accents and punctuation, collapse spaces, drop a leading "the" */
export function normalizePhrase(text: string): string {
  return text
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

/** Crude per-word singular, applied the same way to both sides, so "sharks" and "shark" meet */
function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (/(ses|xes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

/** The lookup key for a phrase: normalized and singularized word by word */
export function matchKey(text: string): string {
  return normalizePhrase(text).split(" ").map(singular).join(" ");
}

export type TopicIndex = Map<string, string>; // matchKey → slug

/**
 * Build the lookup from topic slugs and labels plus aliases. Earlier entries win, so pass
 * topics before aliases: a label always beats an alias that happens to share its key.
 */
export function buildIndex(
  topics: { slug: string; label: string }[],
  aliases: { alias: string; topicSlug: string }[],
): TopicIndex {
  const index: TopicIndex = new Map();
  const add = (phrase: string, slug: string) => {
    const key = matchKey(phrase);
    if (key && !index.has(key)) index.set(key, slug);
  };
  for (const t of topics) { add(t.slug.replace(/-/g, " "), t.slug); add(t.label, t.slug); }
  for (const a of aliases) add(a.alias, a.topicSlug);
  return index;
}

/** Exact match on the whole phrase, then without filler like "facts about", then on its ending */
export function matchTopic(
  index: TopicIndex,
  phrase: string,
  /** Topic slug → parent slug, so a front word naming an ancestor ("pet dogs") still matches */
  parents?: Map<string, string | null>,
): string | null {
  const key = matchKey(phrase);
  if (!key) return null;
  const direct = index.get(key);
  if (direct) return direct;
  const trimmed = key
    .replace(/^(i (really )?(like|love)|learning about|facts about|fact about|all about|stuff about|anything about|more about|reading about|about) /, "")
    .replace(/ (fact|stuff|thing|video|book|show)$/, "");
  if (trimmed !== key && index.has(trimmed)) return index.get(trimmed)!;
  // Short noun phrases usually end in their subject: "great white sharks", "volcano eruptions".
  // Not when the words in front name a topic of their own: "computer science" isn't science and
  // "animal body language" isn't languages, so those are left to the model (or to nothing).
  // Front words naming the same topic ("great white sharks") or an ancestor ("pet dogs") are fine.
  const isAncestor = (a: string, slug: string) => {
    for (let p = parents?.get(slug); p; p = parents?.get(p)) if (p === a) return true;
    return false;
  };
  const words = trimmed.split(" ");
  if (words.length > 5) return null;
  for (let i = 1; i < words.length; i++) {
    const tail = index.get(words.slice(i).join(" "));
    if (!tail) continue;
    const front = words.slice(0, i);
    const namesOther = front.some((_, a) => front.some((_, b) => {
      const other = b >= a ? index.get(front.slice(a, b + 1).join(" ")) : undefined;
      return other !== undefined && other !== tail && !isAncestor(other, tail);
    }));
    return namesOther ? null : tail;
  }
  return null;
}
