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

console.log("\n🎉 All level-progression tests passed!");
