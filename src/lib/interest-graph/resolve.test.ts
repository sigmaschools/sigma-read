import assert from "node:assert/strict";
import { buildIndex, matchKey, matchTopic, normalizePhrase } from "./resolve";
import { flattenTaxonomy } from "./taxonomy";

{
  assert.equal(normalizePhrase("  The Pokémon!! "), "pokemon");
  assert.equal(normalizePhrase("Rubik's cube"), "rubiks cube");
  assert.equal(normalizePhrase("T-Rex"), "t rex");
  assert.equal(matchKey("Sharks"), matchKey("shark"));
  assert.equal(matchKey("butterflies"), matchKey("butterfly"));
  assert.equal(matchKey("boxes"), "box");
  assert.equal(matchKey("bus"), "bus", "short words are left alone");
  assert.equal(matchKey("tennis"), "tennis");
  console.log("✅ normalizePhrase and matchKey");
}

{
  const topics = flattenTaxonomy();
  const index = buildIndex(topics, topics.flatMap(t => t.aliases.map(alias => ({ alias, topicSlug: t.slug }))));
  const cases: [string, string | null][] = [
    ["Sharks", "sharks"],
    ["great whites", "sharks"],
    ["SHARK", "sharks"],
    ["the planets", "planets"],
    ["Minecraft", "video-games"],
    ["facts about volcanoes", "volcanoes"],
    ["I love dogs", "dogs"],
    ["dinosaur stuff", "dinosaurs"],
    ["Ocean animals", "marine-animals"],
    ["space", "space"],
    ["art", "drawing"],
    ["Great white sharks", "sharks"],
    ["volcano eruptions", "volcanoes"],
    ["my dad", null],
    // Compounds whose front words name another topic are left to the model
    ["computer science", null],
    ["animal body language", null],
    ["rocket science", null],
    ["ocean sharks", null],
    ["dinosaur fossils", null],
    ["pet dogs", "dogs"], // the front word is an ancestor
    ["space rockets", "space-exploration"],
    ["baby sharks", "sharks"],
    ["pro football", "football"],
    ["", null],
  ];
  const parents = new Map(topics.map(t => [t.slug, t.parentSlug]));
  for (const [phrase, slug] of cases) assert.equal(matchTopic(index, phrase, parents), slug, phrase);

  // Topic names win over aliases with the same key
  const small = buildIndex([{ slug: "cats", label: "Cats" }], [{ alias: "cat", topicSlug: "big-cats" }]);
  assert.equal(matchTopic(small, "cat", new Map()), "cats");

  // Front words naming a descendant or a grandparent are fine; an unrelated one blocks the match
  const tree = buildIndex([
    { slug: "animals", label: "Animals" }, { slug: "fish", label: "Fish" }, { slug: "sharks", label: "Sharks" },
    { slug: "space", label: "Space" },
  ], []);
  const up = new Map<string, string | null>([["animals", null], ["fish", "animals"], ["sharks", "fish"], ["space", null]]);
  assert.equal(matchTopic(tree, "sharks fish", up), "fish");
  assert.equal(matchTopic(tree, "animal sharks", up), "sharks");
  assert.equal(matchTopic(tree, "space sharks", up), null);
  assert.equal(matchTopic(tree, "space sharks fish", up), null, "a blocked tail doesn't fall through");
  console.log("✅ matchTopic resolves names, aliases and filler phrases");
}
