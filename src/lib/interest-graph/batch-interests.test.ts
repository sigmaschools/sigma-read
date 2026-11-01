import assert from "node:assert";
import { mergeBatchInterests, BATCH_MAX_ADDED } from "./batch-interests";
import type { Affinity } from "./affinity";

const at = new Date("2026-11-01");
const aff = (topicSlug: string, score: number, status: Affinity["status"] = "inferred"): Affinity =>
  ({ topicSlug, score, confidence: 0.5, status, lastSignalAt: at });
const labels = new Map([
  ["sharks", "Sharks"], ["soccer", "Soccer"], ["volcanoes", "Volcanoes"], ["lego", "Lego"],
  ["comics", "Comics"], ["music", "Music"], ["dinosaurs", "Dinosaurs"],
]);
const slugs = new Map<string, string | null>([["Sharks", "sharks"], ["dinosaurs", "dinosaurs"], ["my cat", null]]);

// Rejected profile topics are dropped; unmatched phrases stay
assert.deepEqual(
  mergeBatchInterests(["Sharks", "dinosaurs", "my cat"], slugs, [aff("sharks", 0.5, "declared"), aff("dinosaurs", 0, "rejected")], labels),
  ["sharks", "my cat"],
);
console.log("✅ mergeBatchInterests drops rejected profile topics");

// Strong graph topics the profile doesn't name are added, strongest first, capped
const strong = [aff("soccer", 0.6), aff("sharks", 0.5, "declared"), aff("volcanoes", 0.4), aff("lego", 0.3), aff("comics", 0.3), aff("music", 0.1)];
assert.deepEqual(mergeBatchInterests(["Sharks"], slugs, strong, labels), ["sharks", "soccer", "volcanoes", "lego"]);
assert.equal(BATCH_MAX_ADDED, 3);
console.log("✅ mergeBatchInterests adds up to 3 strong graph topics");

// Weak, negative and unlabeled topics aren't added; no duplicates
assert.deepEqual(mergeBatchInterests(["Sharks"], slugs, [aff("music", 0.2), aff("ghost", 0.9), aff("comics", -0.3)], labels), ["sharks"]);
assert.deepEqual(mergeBatchInterests(["Sharks", "sharks"], slugs, [], labels), ["sharks"]);
console.log("✅ mergeBatchInterests skips weak and unknown topics");

// No graph data: the profile as before
assert.deepEqual(mergeBatchInterests(["Sharks", "my cat"], slugs, [], labels), ["sharks", "my cat"]);
console.log("✅ mergeBatchInterests falls back to the profile");

// Order of the input doesn't matter: a weak topic early can't hide strong ones
assert.deepEqual(
  mergeBatchInterests(["Sharks"], slugs, [aff("music", 0.1), aff("lego", 0.3), aff("soccer", 0.6), aff("volcanoes", 0.4), aff("comics", 0.26)], labels),
  ["sharks", "soccer", "volcanoes", "lego"],
);
console.log("✅ mergeBatchInterests sorts by score itself");

// A profile topic at exactly 0 stays; one that went negative is dropped
assert.deepEqual(mergeBatchInterests(["Sharks", "dinosaurs"], slugs, [aff("sharks", 0, "declared"), aff("dinosaurs", -0.1, "declared")], labels), ["sharks"]);
console.log("✅ mergeBatchInterests drops only negative or rejected profile topics");
