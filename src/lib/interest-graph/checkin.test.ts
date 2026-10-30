import assert from "node:assert/strict";
import { SIGNALS, type Signal, type SignalType } from "./affinity";
import { checkinDue, checkinTopics } from "./checkin";

const NOW = new Date("2026-10-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const sig = (topicSlug: string, signalType: SignalType, age: number, sourceRef?: string): Signal =>
  ({ topicSlug, signalType, weight: SIGNALS[signalType].weight, createdAt: daysAgo(age), sourceRef });

{
  assert.equal(checkinDue(null, null, NOW), false, "no signals yet, nothing to ask");
  assert.equal(checkinDue(null, daysAgo(13), NOW), false, "first check-in waits two weeks");
  assert.equal(checkinDue(null, daysAgo(14), NOW), true);
  assert.equal(checkinDue(daysAgo(10), daysAgo(100), NOW), false);
  assert.equal(checkinDue(daysAgo(15), daysAgo(100), NOW), true);
  console.log("✅ checkinDue: about every two weeks");
}

{
  const signals = [
    // two dislikes in a row → first
    sig("bugs", "liked", 20, "article:1:rating:bugs:0"), sig("bugs", "disliked", 5, "article:2:rating:bugs:0"), sig("bugs", "disliked", 2, "article:3:rating:bugs:0"),
    // passed over three times → second
    sig("cars", "passed_over", 3), sig("cars", "passed_over", 2), sig("cars", "passed_over", 1),
    // declared long ago, nothing positive since → third
    sig("dinosaurs", "onboarding", 60),
    // declared long ago but still loved → not asked
    sig("sharks", "onboarding", 60), sig("sharks", "favorite", 3),
    // declared recently → not asked
    sig("volcanoes", "typed_interest", 5),
    // answered in a check-in last week → not asked
    sig("robots", "onboarding", 90), sig("robots", "checkin_keep", 7),
  ];
  const served = new Map([["sharks", 6], ["chess", 4], ["robots", 9], ["lego", 2]]);
  assert.deepEqual(checkinTopics(signals, served, new Set(), NOW), ["bugs", "cars", "dinosaurs"], "at most three, most pressing first");
  assert.deepEqual(checkinTopics(signals, served, new Set(["bugs", "cars"]), NOW), ["dinosaurs", "sharks", "chess"], "rejected topics are skipped; then the most served");
  console.log("✅ checkinTopics: priority order, exclusions and the cap");
}

{
  // Tapping dislike twice on one article is one dislike, not two in a row
  const signals = [sig("bugs", "disliked", 2, "article:9:rating:bugs:1"), sig("bugs", "disliked", 1, "article:9:rating:bugs:2")];
  assert.deepEqual(checkinTopics(signals, new Map(), new Set(), NOW), []);
  console.log("✅ repeated taps on one article count once");
}
