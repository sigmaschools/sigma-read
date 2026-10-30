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
    ["", null],
  ];
  for (const [phrase, slug] of cases) assert.equal(matchTopic(index, phrase), slug, phrase);

  // Topic names win over aliases with the same key
  const small = buildIndex([{ slug: "cats", label: "Cats" }], [{ alias: "cat", topicSlug: "big-cats" }]);
  assert.equal(matchTopic(small, "cat"), "cats");
  console.log("✅ matchTopic resolves names, aliases and filler phrases");
}
