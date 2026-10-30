import assert from "node:assert/strict";
import type { Affinity } from "./affinity";
import { candidateScore, isExploreSlot, pickForFeed, pickOne } from "./serving";

const aff = (entries: [string, number, Affinity["status"]?][]) =>
  new Map(entries.map(([topicSlug, score, status]) => [topicSlug, { topicSlug, score, confidence: 1, status: status ?? "declared", lastSignalAt: new Date() }]));
let seed = 1;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

{
  const a = aff([["sharks", 0.8], ["cars", -0.5], ["bugs", 0, "rejected"]]);
  assert.equal(candidateScore(["sharks", "oceans"], a), 0.8, "best topic wins");
  assert.equal(candidateScore([], a), 0, "untagged articles are neutral");
  assert.equal(candidateScore(["sharks", "bugs"], a), null, "any rejected topic excludes the article");
  assert.equal(candidateScore(["cars"], a), -0.5);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(isExploreSlot), [false, false, true, false, false, true]);
  console.log("✅ candidateScore and the one-in-three exploration rhythm");
}

{
  const a = aff([["sharks", 0.9], ["volcanoes", 0.6], ["cars", -0.6], ["bugs", 0, "rejected"]]);
  const pool = [
    { id: 1, topics: ["sharks"] }, { id: 2, topics: ["sharks"] }, { id: 3, topics: ["volcanoes"] },
    { id: 4, topics: ["cars"] }, { id: 5, topics: ["bugs"] }, { id: 6, topics: ["chess"] }, { id: 7, topics: [] },
  ];
  for (let run = 0; run < 50; run++) {
    const picks = pickForFeed(pool, a, 3, { rng });
    const ids = picks.map(p => p.id);
    assert.ok([1, 2].includes(ids[0]), "slot 1: the strongest interest");
    assert.equal(ids[1], 3, "slot 2: the next topic, not a second shark article");
    assert.ok([6, 7].includes(ids[2]), "slot 3 explores something neutral");
    assert.ok(!ids.includes(5) && !ids.includes(4), "never rejected, and exploring never serves a disliked topic");
  }
  console.log("✅ pickForFeed: best matches, topic variety, an exploration slot, nothing rejected");
}

{
  // No signals: every article is neutral, so picks spread across the pool like the old random order
  const pool = Array.from({ length: 10 }, (_, i) => ({ id: i, topics: [`t${i}`] }));
  const seen = new Set<number>();
  for (let run = 0; run < 100; run++) seen.add(pickOne(pool, new Map(), { explore: false, rng })!.id);
  assert.ok(seen.size >= 8, `spread: ${seen.size}`);
  // Only rejected articles left: nothing is served
  assert.equal(pickOne([{ id: 1, topics: ["bugs"] }], aff([["bugs", 0, "rejected"]]), { explore: false }), null);
  // Exploration with nothing neutral falls back to the best match
  assert.equal(pickOne([{ id: 1, topics: ["sharks"] }], aff([["sharks", 0.9]]), { explore: true })!.id, 1);
  // Same topic only when nothing else is left
  assert.equal(pickOne([{ id: 1, topics: ["sharks"] }], aff([["sharks", 0.9]]), { explore: false, avoid: new Set(["sharks"]) })!.id, 1);
  // The exploration rhythm carries across pools
  const two = pickForFeed([{ id: 1, topics: ["sharks"] }, { id: 2, topics: ["chess"] }], aff([["sharks", 0.9]]), 1, { startPosition: 2, rng });
  assert.equal(two[0].id, 2, "position 2 is an exploration slot");
  console.log("✅ pickOne edge cases");
}
