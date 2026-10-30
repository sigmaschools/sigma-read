import assert from "node:assert/strict";
import { computeAffinities, SIGNALS, type Signal, type SignalType } from "./affinity";
import { summarizeInterests } from "./summary";

const NOW = new Date("2026-10-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const sig = (topicSlug: string, signalType: SignalType, age: number): Signal =>
  ({ topicSlug, signalType, weight: SIGNALS[signalType].weight, createdAt: daysAgo(age) });

{
  const signals = [
    sig("sharks", "onboarding", 10), sig("sharks", "favorite", 2),
    sig("robots", "liked", 3), sig("robots", "chose_article", 3),
    sig("cars", "onboarding", 400),
    sig("bugs", "onboarding", 20), sig("bugs", "checkin_reject", 5),
    sig("chess", "removed", 1), sig("chess", "liked", 30),
    sig("lego", "passed_over", 1),
  ];
  const firstSeen = new Map<string, Date>();
  for (const s of signals) if (!firstSeen.has(s.topicSlug) || firstSeen.get(s.topicSlug)! > s.createdAt) firstSeen.set(s.topicSlug, s.createdAt);
  const summary = summarizeInterests(computeAffinities(signals, NOW), firstSeen, NOW);
  assert.deepEqual(summary.current.map(c => [c.slug, c.declared, c.isNew]), [["sharks", true, false], ["robots", false, true]]);
  assert.deepEqual(summary.fading.map(f => f.slug), ["cars"], "a year-old declared interest has faded");
  assert.deepEqual(summary.removed.map(r => r.slug).sort(), ["bugs", "chess"], "student and adult removals both show");
  console.log("✅ summarizeInterests: current, new, fading and removed");
}

{
  const restored = computeAffinities([sig("chess", "liked", 3), sig("chess", "removed", 2), sig("chess", "restored", 1)], NOW);
  assert.equal(restored[0].status, "declared", "an adult can restore a removed topic");
  assert.ok(restored[0].score > 0.28, "restoring keeps the topic's history");
  console.log("✅ removed and restored");
}
