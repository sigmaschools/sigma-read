import assert from "node:assert/strict";
import { matchTopic } from "./resolve";
import { bundledMap, currentSlug, fromCompassMap, relatedIn } from "./topic-map";

{
  const map = bundledMap();
  assert.equal(matchTopic(map.index, "great whites", map.parents), "sharks", "the bundled map keeps its aliases");
  assert.ok(map.matchable.has("sharks") && map.labels.has("sharks"));
  const near = relatedIn(map, "sharks");
  assert.ok(near.some(r => r.slug === "oceans" && r.via === "related"), "a seeded link");
  assert.ok(near.some(r => r.slug === "whales" && r.via === "sibling"));
  assert.ok(near.some(r => r.slug === "marine-animals" && r.via === "parent"));
  assert.ok(relatedIn(map, "oceans").some(r => r.slug === "sharks"), "links run both ways");
  assert.deepEqual(relatedIn(map, "no-such-topic"), []);
  console.log("✅ the bundled map: aliases, labels and neighbours");
}

{
  const map = fromCompassMap({
    version: "v", redirects: {},
    topics: [
      { id: "animals", label: "Animals", kind: "domain", minGrade: 0 },
      { id: "marine-animals", label: "Ocean animals", parentId: "animals", kind: "group", minGrade: 0 },
      { id: "sharks", label: "Sharks", parentId: "marine-animals", kind: "topic", minGrade: 0, related: { oceans: 0.6, "great-white-shark": 0.9 } },
      { id: "whales", label: "Whales", parentId: "marine-animals", kind: "topic", minGrade: 0 },
      { id: "oceans", label: "Oceans", kind: "topic", minGrade: 0 },
      { id: "great-white-shark", label: "Great white shark", parentId: "sharks", kind: "thing", minGrade: 0 },
    ],
  });
  assert.equal(matchTopic(map.index, "Sharks", map.parents), "sharks");
  assert.equal(matchTopic(map.index, "great whites", map.parents), "sharks", "SigmaRead's seeded aliases still match");
  assert.equal(matchTopic(map.index, "great white shark", map.parents), "sharks", "a specific thing's name lands on its topic (by its last word), never on the thing");
  assert.ok(!map.matchable.has("great-white-shark"));
  assert.equal(map.labels.get("great-white-shark"), "Great white shark", "but its label is known, for a student's interests");
  assert.deepEqual(relatedIn(map, "sharks").map(r => [r.slug, r.via, r.weight]), [
    ["oceans", "related", 0.6], ["whales", "sibling", 0.5], ["marine-animals", "parent", 0.3],
  ]);
  assert.ok(relatedIn(map, "oceans").some(r => r.slug === "sharks" && r.weight === 0.6));
  console.log("✅ Compass's map: topics to land on, things by label only, neighbours");
}

{
  // Compass renamed sharks: stored tags and SigmaRead's aliases follow
  const map = fromCompassMap({
    version: "v2", redirects: { sharks: "sharks-and-rays", "older-sharks": "sharks" },
    topics: [
      { id: "animals", label: "Animals", kind: "domain", minGrade: 0 },
      { id: "sharks-and-rays", label: "Sharks and rays", parentId: "animals", kind: "topic", minGrade: 0 },
    ],
  });
  assert.equal(currentSlug(map, "sharks"), "sharks-and-rays");
  assert.equal(currentSlug(map, "older-sharks"), "sharks-and-rays", "through two renames");
  assert.equal(currentSlug(map, "animals"), "animals");
  assert.equal(matchTopic(map.index, "great whites", map.parents), "sharks-and-rays", "the alias follows the rename");
  console.log("✅ renamed topics: stored slugs and aliases follow Compass's redirects");
}
