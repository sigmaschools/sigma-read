import assert from "node:assert/strict";
import { computeAffinities, SIGNALS, type Signal, type SignalType } from "./affinity";
import { summarizeInterests } from "./summary";

const NOW = new Date("2026-10-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const sig = (topicSlug: string, signalType: SignalType, age: number, extra: Partial<Signal> = {}): Signal =>
  ({ topicSlug, signalType, weight: SIGNALS[signalType].weight, createdAt: daysAgo(age), ...extra });

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
  assert.equal(restored[0].status, "inferred", "an adult can restore a removed topic, without making it a declared one");
  assert.ok(restored[0].score > 0.28, "restoring keeps the topic's history");
  // The student reset the topic by naming it again; an adult's later remove and restore keeps that reset
  const reset = computeAffinities([
    sig("chess", "disliked", 40, { sourceRef: "article:1:rating:chess:0" }), sig("chess", "disliked", 39, { sourceRef: "article:2:rating:chess:0" }),
    sig("chess", "checkin_reject", 30), sig("chess", "typed_interest", 20),
    sig("chess", "removed", 10), sig("chess", "restored", 5),
  ], NOW);
  assert.equal(reset[0].status, "declared");
  assert.ok(reset[0].score > 0.5, "restoring doesn't bring back dislikes from before the student's own reset");
  const declaredTurnedNegative = computeAffinities([sig("cars", "onboarding", 200), sig("cars", "disliked", 5, { sourceRef: "article:3:rating:cars:0" }), sig("cars", "disliked", 4, { sourceRef: "article:4:rating:cars:0" })], NOW);
  assert.deepEqual(summarizeInterests(declaredTurnedNegative, new Map(), NOW).fading.map(f => f.slug), ["cars"], "a declared topic that turned negative still shows as fading");
  const faint = computeAffinities([sig("knots", "chose_article", 120), sig("knots", "removed", 10), sig("knots", "restored", 1)], NOW);
  assert.deepEqual(summarizeInterests(faint, new Map(), NOW, new Set(["knots"])).fading.map(f => f.slug), ["knots"], "a restored topic with a faint score still shows");
  console.log("✅ removed and restored");
}
