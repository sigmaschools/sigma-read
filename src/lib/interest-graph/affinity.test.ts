import assert from "node:assert/strict";
import { latestRatings, ratingKey, SIGNALS, type Signal, type SignalType } from "./affinity";

const NOW = new Date("2026-10-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const sig = (topicSlug: string, signalType: SignalType, age: number, extra: Partial<Signal> = {}): Signal =>
  ({ topicSlug, signalType, weight: SIGNALS[signalType].weight, createdAt: daysAgo(age), ...extra });

{
  // Changing a like to a dislike: only the latest rating counts
  const ref = "article:7:rating:sharks";
  assert.equal(ratingKey(`${ref}:1730000000000`), ref);
  const flips = [
    sig("sharks", "liked", 3, { sourceRef: `${ref}:0` }),
    sig("sharks", "disliked", 2, { sourceRef: `${ref}:2` }),
    sig("sharks", "liked", 1, { sourceRef: `${ref}:3` }),
    sig("sharks", "chose_article", 4, { sourceRef: "session:1:sharks" }),
  ];
  const kept = latestRatings(flips);
  assert.deepEqual(kept.map(s => s.sourceRef).sort(), [`${ref}:3`, "session:1:sharks"]);
  console.log("✅ only the latest like or dislike per article counts");
}
