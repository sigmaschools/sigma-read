import assert from "node:assert/strict";
import { computeAffinities, decay, lessWeight, ratingKey, SIGNALS, type Signal, type SignalType } from "./affinity";

const NOW = new Date("2026-10-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const sig = (topicSlug: string, signalType: SignalType, age: number, extra: Partial<Signal> = {}): Signal =>
  ({ topicSlug, signalType, weight: SIGNALS[signalType].weight, createdAt: daysAgo(age), ...extra });
const score = (list: Signal[], slug: string) => computeAffinities(list, NOW).find(a => a.topicSlug === slug);

{
  assert.equal(decay(sig("x", "liked", 0), NOW), 1);
  assert.ok(Math.abs(decay(sig("x", "liked", 45), NOW) - 0.5) < 1e-9, "behaviour half-life is 45 days");
  assert.ok(Math.abs(decay(sig("x", "onboarding", 90), NOW) - 0.5) < 1e-9, "declared half-life is 90 days");
  assert.ok(decay(sig("x", "onboarding", 365), NOW) < 0.07, "no floor: a year-old interest is almost gone");
  console.log("✅ decay halves on schedule with no floor");
}

{
  const list = [sig("sharks", "onboarding", 0), sig("sharks", "liked", 0), sig("sharks", "favorite", 0), sig("cars", "onboarding", 180)];
  const [top, second] = computeAffinities(list, NOW);
  assert.equal(top.topicSlug, "sharks");
  assert.equal(top.score, 1, "scores are capped at 1");
  assert.equal(top.status, "declared");
  assert.equal(second.topicSlug, "cars");
  assert.equal(second.score, 0.15, "two half-lives: 0.6 → 0.15");
  console.log("✅ recent signals outrank old ones and scores stay in [-1, 1]");
}

{
  const behaviour = [sig("robots", "chose_article", 1), sig("robots", "liked", 2)];
  assert.equal(score(behaviour, "robots")!.status, "inferred", "no declaration means inferred");
  const disliked = [sig("bugs", "disliked", 0), sig("bugs", "disliked", 0), sig("bugs", "disliked", 0), sig("bugs", "disliked", 0)];
  assert.equal(score(disliked, "bugs")!.score, -1, "floor at -1");
  console.log("✅ status and the -1 floor");
}

{
  // "No more" rejects until the student names the topic again
  const rejected = [sig("dinosaurs", "onboarding", 30), sig("dinosaurs", "liked", 20), sig("dinosaurs", "checkin_reject", 10)];
  assert.deepEqual([score(rejected, "dinosaurs")!.status, score(rejected, "dinosaurs")!.score], ["rejected", 0]);
  const renamed = [...rejected, sig("dinosaurs", "typed_interest", 1)];
  const back = score(renamed, "dinosaurs")!;
  assert.equal(back.status, "declared");
  assert.ok(Math.abs(back.score - 0.6 * Math.pow(0.5, 1 / 90)) < 0.001, "starts over from the new declaration only");
  const restored = [...rejected, sig("dinosaurs", "restored", 0)];
  assert.equal(score(restored, "dinosaurs")!.status, "declared", "a guide or parent can restore it");
  console.log("✅ rejection holds until the topic is named again or restored");
}

{
  // "Not as much" halves the score at once
  const before = [sig("volcanoes", "onboarding", 0), sig("volcanoes", "liked", 0)];
  const s = score(before, "volcanoes")!.score;
  const after = [...before, sig("volcanoes", "checkin_less", 0, { weight: lessWeight(s) })];
  assert.ok(Math.abs(score(after, "volcanoes")!.score - s / 2) < 0.001);
  assert.equal(lessWeight(-0.4), 0, "never pushes a negative score further");
  console.log("✅ Not as much halves the current score");
}

{
  // Changing a like to a dislike: only the latest rating counts
  const ref = "article:7:rating:sharks";
  assert.equal(ratingKey(`${ref}:1730000000000`), ref);
  const flips = [
    sig("sharks", "liked", 3, { sourceRef: `${ref}:0` }),
    sig("sharks", "disliked", 2, { sourceRef: `${ref}:2` }),
    sig("sharks", "liked", 1, { sourceRef: `${ref}:3` }),
  ];
  assert.ok(Math.abs(score(flips, "sharks")!.score - 0.3 * Math.pow(0.5, 1 / 45)) < 0.001);
  console.log("✅ only the latest like or dislike per article counts");
}

{
  const fresh = computeAffinities([sig("a", "liked", 0)], NOW)[0].confidence;
  const lots = computeAffinities(Array.from({ length: 8 }, () => sig("a", "liked", 0)), NOW)[0].confidence;
  const stale = computeAffinities([sig("a", "liked", 300)], NOW)[0].confidence;
  assert.ok(lots > fresh && fresh > stale, "confidence grows with recent evidence");
  assert.ok(lots <= 1);
  console.log("✅ confidence reflects how much recent evidence there is");
}
