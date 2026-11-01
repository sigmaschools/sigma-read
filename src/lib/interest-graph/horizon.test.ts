import assert from "node:assert";
import { rankHorizonTopics, horizonSeeds, HORIZON_SEEDS } from "./horizon";
import type { Affinity } from "./affinity";
import type { RelatedTopic } from "./index";

const at = new Date("2026-11-01");
const aff = (topicSlug: string, score: number, status: Affinity["status"] = "inferred"): Affinity =>
  ({ topicSlug, score, confidence: 0.5, status, lastSignalAt: at });
const rel = (slug: string, weight: number, via: RelatedTopic["via"] = "sibling"): RelatedTopic => ({ slug, weight, via });

// Topics next to several strong interests rank first; known, rejected and group topics are skipped
{
  const affinities = [aff("sharks", 0.8, "declared"), aff("volcanoes", 0.5), aff("whales", 0.3), aff("spiders", -0.4), aff("dolphins", 0, "rejected")];
  const related = new Map([
    ["sharks", [rel("whales", 0.5), rel("dolphins", 0.5), rel("octopuses", 0.5), rel("marine-animals", 0.3, "parent"), rel("deep-sea", 0.5)]],
    ["volcanoes", [rel("earthquakes", 0.5), rel("deep-sea", 0.4, "related"), rel("spiders", 0.5)]],
    ["whales", [rel("octopuses", 0.5)]],
  ]);
  const ranked = rankHorizonTopics(affinities, related, new Set(["marine-animals"]));
  assert.deepEqual(ranked.map(r => r.slug), ["deep-sea", "octopuses", "earthquakes"]);
  assert.ok(Math.abs(ranked[0].score - (0.8 * 0.5 + 0.5 * 0.4)) < 1e-9);
  console.log("✅ rankHorizonTopics ranks neighbours of strong interests, skipping known topics");
}

// Seeds: strongest non-rejected topics above the floor, capped
{
  const many = Array.from({ length: 8 }, (_, i) => aff(`t${i}`, 0.9 - i * 0.1));
  assert.equal(horizonSeeds(many).length, HORIZON_SEEDS);
  assert.deepEqual(horizonSeeds([aff("a", 0.1), aff("b", 0.9, "rejected")]), []);
  assert.deepEqual(rankHorizonTopics([aff("a", 0.1)], new Map([["a", [rel("b", 0.5)]]]), new Set()), []);
  console.log("✅ horizonSeeds takes only strong topics");
}
