import assert from "node:assert/strict";
import {
  trimmedMean,
  checkUpwardTrigger,
  checkDownwardTrigger,
  evaluateUpwardProbe,
  evaluateDownwardProbe,
} from "./level-progression-rules";
import type { FeedMix } from "./level-progression-rules";

// ─── trimmedMean ─────────────────────────────────────────────────────────────

// drops lowest score when >= 4 scores
{
  // [20, 80, 85, 90] → drop 20 → mean(80,85,90) = 85
  assert.strictEqual(trimmedMean([20, 80, 85, 90]), 85);
  console.log("✅ trimmedMean drops lowest with 4 scores");
}

// plain average when < 4 scores
{
  assert.strictEqual(trimmedMean([60, 80, 90]), (60 + 80 + 90) / 3);
  console.log("✅ trimmedMean plain average with 3 scores");
}

// single score
{
  assert.strictEqual(trimmedMean([75]), 75);
  console.log("✅ trimmedMean single score");
}

// empty → 0
{
  assert.strictEqual(trimmedMean([]), 0);
  console.log("✅ trimmedMean empty returns 0");
}

// ─── checkUpwardTrigger ──────────────────────────────────────────────────────

// fires at 3 of 4 >= 80
{
  const scores = [{ score: 85 }, { score: 70 }, { score: 82 }, { score: 90 }];
  assert.strictEqual(checkUpwardTrigger(scores), true, "3 of 4 >= 80 should trigger");
  console.log("✅ upward trigger fires at 3 of 4 >= 80");
}

// does NOT fire with 2 of 4 >= 80
{
  const scores = [{ score: 85 }, { score: 70 }, { score: 82 }, { score: 65 }];
  assert.strictEqual(checkUpwardTrigger(scores), false, "2 of 4 >= 80 should NOT trigger");
  console.log("✅ upward trigger does NOT fire with 2 of 4 >= 80");
}

// does not fire with < 4 scores
{
  const scores = [{ score: 90 }, { score: 90 }, { score: 90 }];
  assert.strictEqual(checkUpwardTrigger(scores), false, "need at least 4 scores");
  console.log("✅ upward trigger requires 4 scores");
}

// ─── checkDownwardTrigger ────────────────────────────────────────────────────

// fires at 2 consecutive scores < 60
{
  const scores = [{ score: 80 }, { score: 55 }, { score: 45 }];
  assert.strictEqual(checkDownwardTrigger(scores), true, "2 consecutive < 60 should trigger");
  console.log("✅ downward trigger fires at 2 consecutive < 60");
}

// does NOT fire if only last score < 60
{
  const scores = [{ score: 80 }, { score: 70 }, { score: 45 }];
  assert.strictEqual(checkDownwardTrigger(scores), false, "only 1 of last 2 < 60");
  console.log("✅ downward trigger does NOT fire with only 1 consecutive < 60");
}

// ─── evaluateUpwardProbe — gamed low score doesn't block advancement ─────────

// One gamed low score (20) in 4 probe scores does not block when other 3 >= 75
{
  const feedMix: FeedMix = {
    probeDirection: "up",
    probePhase: 2,
    probeStartDate: "2026-01-01T00:00:00Z",
    probeScores: [20, 80, 85, 90], // trimmedMean = 85 (drop 20)
  };
  const result = evaluateUpwardProbe({ name: "Test" }, feedMix, [], 3);
  assert.strictEqual(result.action, "level_change", "one gamed score should not block advancement");
  assert.strictEqual(result.newLevel, 4);
  console.log("✅ one gamed low score in 4 probes does not block upward advancement");
}

// Upward probe does NOT advance with < 3 probe scores
{
  const feedMix: FeedMix = {
    probeDirection: "up",
    probePhase: 2,
    probeStartDate: "2026-01-01T00:00:00Z",
    probeScores: [80, 85],
  };
  const result = evaluateUpwardProbe({ name: "Test" }, feedMix, [], 3);
  assert.strictEqual(result.action, "none", "need at least 3 probe scores for level change");
  console.log("✅ upward probe needs >= 3 scores for level change");
}

// ─── evaluateDownwardProbe — trimmedMean threshold ──────────────────────────

// Downward probe succeeds with trimmedMean >= 70
{
  const feedMix: FeedMix = {
    probeDirection: "down",
    probePhase: 2,
    probeStartDate: "2026-01-01T00:00:00Z",
    probeScores: [30, 72, 75, 80], // trimmedMean = (72+75+80)/3 = 75.67
  };
  // base scores still struggling (< 60)
  const scores = [
    { score: 50, articleLevel: 4 },
    { score: 55, articleLevel: 4 },
  ];
  const result = evaluateDownwardProbe({ name: "Test" }, feedMix, scores, 4);
  assert.strictEqual(result.action, "level_change", "trimmedMean >= 70 with base struggling should change level");
  assert.strictEqual(result.newLevel, 3);
  console.log("✅ downward probe advances when trimmedMean >= 70 and base struggling");
}

console.log("\n🎉 All level-progression tests passed!");
