import assert from "node:assert/strict";
import { learnerIdFrom, rankScores, replaceKeyFor, toAffinities, toEvidence, toSummary, type CompassInterest } from "./compass";
import { pickForFeed } from "./serving";

const L = "0b5e3c1a-2f4d-4e6a-9b7c-1d2e3f4a5b6c";

{
  assert.equal(learnerIdFrom(L.toUpperCase()), L, "ids are compared lowercase");
  assert.equal(learnerIdFrom(" " + L + " "), L);
  assert.equal(learnerIdFrom("lily"), null, "anything but a Compass learner id is not linked");
  assert.equal(learnerIdFrom(null), null);
  console.log("✅ learnerIdFrom");
}

{
  const at = new Date("2026-11-01T10:00:00Z");
  const base = { phrase: null, weight: 0.15, createdAt: at };
  assert.deepEqual(
    toEvidence(L, { ...base, topicSlug: "sharks", signalType: "chose_article", sourceRef: "session:4:sharks" }),
    { learnerId: L, type: "chose_article", sourceRef: "session:4:sharks", topicId: "sharks", occurredAt: at.toISOString() },
    "live events carry the topic, the same source ref and no weight",
  );
  const imported = toEvidence(L, { ...base, weight: -0.2, topicSlug: "sharks", signalType: "checkin_less", sourceRef: "checkin:2026-11-01:sharks" }, { importing: true });
  assert.equal(imported?.weight, -0.2, "an import keeps the recorded weight");

  const phrase = toEvidence(L, { ...base, topicSlug: null, phrase: "  barbecue and smoking meats ", signalType: "onboarding", sourceRef: "profile:barbecue smoking meats" });
  assert.equal(phrase?.phrase, "barbecue and smoking meats");
  assert.equal(phrase?.topicId, undefined, "a phrase is sent instead of a topic");
  assert.equal(phrase?.phraseBy, undefined, "the student's own words");
  const mention = toEvidence(L, { ...base, topicSlug: null, phrase: "horses", signalType: "chat_mention", sourceRef: "chat:1:x" });
  assert.equal(mention?.phraseBy, "model", "discussion mentions are a model's words");

  const removed = { ...base, topicSlug: "sharks", signalType: "removed" as const, sourceRef: "adult:guide:1:123" };
  assert.equal(toEvidence(L, removed), null, "removes go through the controls call live");
  assert.equal(toEvidence(L, removed, { importing: true })?.type, "removed", "but the import carries them, in order");

  assert.equal(toEvidence(L, { ...base, topicSlug: "sharks", signalType: "liked", sourceRef: null }), null, "no source ref, no event");
  assert.equal(toEvidence(L, { ...base, topicSlug: null, phrase: "  ", signalType: "onboarding", sourceRef: "profile:" }), null, "nothing to land on");
  console.log("✅ toEvidence: topics, phrases, weights only on import, controls only on import");
}

{
  assert.equal(replaceKeyFor({ signalType: "liked", topicSlug: "sharks", sourceRef: "article:42:rating:sharks:1730000000000" }), "rating:42:sharks");
  assert.equal(replaceKeyFor({ signalType: "disliked", topicSlug: "oceans", sourceRef: "article:42:rating:oceans:0" }), "rating:42:oceans",
    "each topic of an article keeps its own rating, so one doesn't cancel another");
  assert.equal(replaceKeyFor({ signalType: "favorite", topicSlug: "sharks", sourceRef: "favorite:3:sharks" }), null);
  const e = toEvidence(L, { topicSlug: "sharks", phrase: null, weight: 0.3, signalType: "liked", sourceRef: "article:42:rating:sharks:9" });
  assert.equal(e?.replaceKey, "rating:42:sharks");
  console.log("✅ replace keys for likes and dislikes");
}

const interest = (topicId: string, score: number, status: CompassInterest["status"], trend: CompassInterest["trend"] = "steady"): CompassInterest =>
  ({ topicId, label: topicId[0].toUpperCase() + topicId.slice(1), score, confidence: 0.5, status, trend, lastSeen: "2026-11-05T00:00:00Z" });

{
  const a = toAffinities([interest("sharks", 0.8, "declared"), interest("bugs", 0.4, "removed"), interest("cars", -0.3, "inferred"), interest("chess", 0.2, "rejected")]);
  assert.deepEqual(a.map(x => [x.topicSlug, x.score, x.status]), [["sharks", 0.8, "declared"], ["bugs", 0, "rejected"], ["cars", -0.3, "inferred"], ["chess", 0, "rejected"]],
    "removed and rejected both become rejected, which is never served");
  assert.equal(a[0].lastSignalAt.toISOString(), "2026-11-05T00:00:00.000Z");
  console.log("✅ toAffinities");
}

{
  const s = toSummary([
    interest("sharks", 0.8, "declared"), interest("horses", 0.3, "inferred", "new"), interest("space", 0.05, "declared"),
    interest("lego", 0.1, "inferred", "fading"), interest("dust", 0.05, "inferred"), interest("bugs", 0.4, "removed"),
  ]);
  assert.deepEqual(s.current.map(c => [c.slug, c.declared, c.isNew]), [["sharks", true, false], ["horses", false, true]]);
  assert.deepEqual(s.fading.map(f => f.slug), ["space", "lego"], "declared or fading, below the shown line");
  assert.deepEqual(s.removed.map(r => r.slug), ["bugs"]);
  assert.equal(s.labels.get("horses"), "Horses");
  console.log("✅ toSummary for the adults' panel");
}

{
  const scores = rankScores([
    { id: "1", score: 0.7, excluded: false, reason: { code: "match", text: "" } },
    { id: "2", score: 0.1, excluded: false, reason: { code: "near", text: "" } },
    { id: "3", score: 0, excluded: true, reason: { code: "excluded", text: "" } },
  ]);
  assert.equal(scores.get("1"), 0.7);
  assert.equal(scores.get("3"), null, "excluded items are never served");
  const pool = [{ id: 1, topics: ["a"] }, { id: 2, topics: ["b"] }, { id: 3, topics: ["c"] }];
  for (let run = 0; run < 20; run++) {
    const picks = pickForFeed(pool, c => scores.has(String(c.id)) ? scores.get(String(c.id))! : 0, 3).map(p => p.id);
    assert.equal(picks[0], 1, "Compass's best match comes first");
    assert.ok(!picks.includes(3), "an excluded item is never picked");
  }
  console.log("✅ rankScores drive the feed, excluded items left out");
}
