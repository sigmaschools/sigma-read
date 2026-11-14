import assert from "node:assert/strict";
import { flattenTaxonomy, RELATED } from "./taxonomy";
import { matchKey } from "./resolve";

const topics = flattenTaxonomy();
const slugs = new Set(topics.map(t => t.slug));

{
  assert.equal(slugs.size, topics.length, "slugs are unique");
  for (const t of topics) {
    assert.match(t.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `kebab-case slug: ${t.slug}`);
    assert.ok(t.depth <= 3, `at most three levels: ${t.slug}`);
    if (t.parentSlug) assert.ok(slugs.has(t.parentSlug), `parent exists: ${t.slug}`);
    assert.ok(slugs.has(t.domain) && topics.find(d => d.slug === t.domain)!.depth === 1, `domain is a top-level topic: ${t.slug}`);
  }
  assert.ok(topics.length >= 150, "a useful starting map");
  console.log(`✅ taxonomy: ${topics.length} topics, unique kebab slugs, valid parents`);
}

{
  // An alias that is another topic's own name would silently be ignored, which hides mistakes
  const own = new Map(topics.flatMap(t => [[matchKey(t.slug.replace(/-/g, " ")), t.slug], [matchKey(t.label), t.slug]] as [string, string][]));
  const seen = new Map<string, string>();
  for (const t of topics) {
    for (const a of t.aliases) {
      const key = matchKey(a);
      const owner = own.get(key);
      assert.ok(!owner || owner === t.slug, `alias "${a}" on ${t.slug} is ${owner}'s name`);
      assert.ok(!seen.has(key) || seen.get(key) === t.slug, `alias "${a}" is on both ${seen.get(key)} and ${t.slug}`);
      seen.set(key, t.slug);
    }
  }
  console.log("✅ aliases don't collide across topics");
}

{
  for (const [a, b] of RELATED) assert.ok(slugs.has(a) && slugs.has(b), `related pair uses real slugs: ${a}, ${b}`);
  console.log("✅ related links point at real topics");
}
