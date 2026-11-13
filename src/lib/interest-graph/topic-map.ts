/**
 * The topic map as SigmaRead uses it: built from Compass's map (contract 6.2, `GET
 * /interests/topics`), or from the one bundled in taxonomy.ts when Compass's has never been
 * read. Pure.
 */

import type { TopicMap as CompassTopicMap } from "./compass";
import { buildIndex, type TopicIndex } from "./resolve";
import { flattenTaxonomy, RELATED } from "./taxonomy";

export interface TopicMap {
  /** Exact and alias matching over the topics an article or a phrase may land on */
  index: TopicIndex;
  /** Those topics' labels: what the Haiku step may choose from */
  matchable: Map<string, string>;
  /** Every approved topic's label, the specific things Compass adds included */
  labels: Map<string, string>;
  parents: Map<string, string | null>;
  /** Links across branches of the tree, both ways, with weights */
  related: Map<string, Map<string, number>>;
}

/** The aliases SigmaRead seeded Compass's map with; Compass's map call lists topics only */
const SEED = flattenTaxonomy();

/** `topics` are the ones matching may land on; `all` adds the rest (labels only) */
export function buildTopicMap(
  topics: { slug: string; label: string; parentSlug: string | null }[],
  links: [string, string, number][],
  all: { slug: string; label: string }[] = topics,
): TopicMap {
  const known = new Set(topics.map(t => t.slug));
  const related = new Map<string, Map<string, number>>();
  const link = (a: string, b: string, w: number) => {
    if (a === b || !known.has(a) || !known.has(b)) return;
    if (!related.has(a)) related.set(a, new Map());
    related.get(a)!.set(b, Math.max(w, related.get(a)!.get(b) ?? 0));
  };
  for (const [a, b, w] of links) { link(a, b, w); link(b, a, w); }
  return {
    index: buildIndex(topics, SEED.filter(t => known.has(t.slug)).flatMap(t => t.aliases.map(alias => ({ alias, topicSlug: t.slug })))),
    matchable: new Map(topics.map(t => [t.slug, t.label])),
    labels: new Map(all.map(t => [t.slug, t.label])),
    parents: new Map(topics.map(t => [t.slug, t.parentSlug && known.has(t.parentSlug) ? t.parentSlug : null])),
    related,
  };
}

/** Compass's map in SigmaRead's shape. Articles and phrases land on topics, not on specific things */
export function fromCompassMap(map: CompassTopicMap): TopicMap {
  const topics = map.topics.filter(t => t.kind !== "thing");
  return buildTopicMap(
    topics.map(t => ({ slug: t.id, label: t.label, parentSlug: t.parentId ?? null })),
    topics.flatMap(t => Object.entries(t.related ?? {}).map(([to, w]) => [t.id, to, w] as [string, string, number])),
    map.topics.map(t => ({ slug: t.id, label: t.label })),
  );
}

/** The map SigmaRead was built with (Compass's started from it) */
export function bundledMap(): TopicMap {
  return buildTopicMap(SEED, RELATED.map(([a, b]) => [a, b, 0.5]));
}

export interface RelatedTopic { slug: string; weight: number; via: "related" | "parent" | "sibling" | "child" }

/** Neighbours of a topic: explicit links first, then the tree (children, siblings, parent) */
export function relatedIn(map: Pick<TopicMap, "parents" | "related">, slug: string): RelatedTopic[] {
  if (!map.parents.has(slug)) return [];
  const parent = map.parents.get(slug) ?? null;
  const out = new Map<string, RelatedTopic>();
  const add = (t: RelatedTopic) => { if (t.slug !== slug && !out.has(t.slug)) out.set(t.slug, t); };
  for (const [to, weight] of map.related.get(slug) ?? []) add({ slug: to, weight, via: "related" });
  for (const [t, p] of map.parents) {
    if (p === slug) add({ slug: t, weight: 0.5, via: "child" });
    else if (parent && t === parent) add({ slug: t, weight: 0.3, via: "parent" });
    else if (parent && p === parent) add({ slug: t, weight: 0.5, via: "sibling" });
  }
  return [...out.values()].sort((a, b) => b.weight - a.weight);
}
