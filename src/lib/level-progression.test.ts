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

console.log("\n🎉 All level-progression tests passed!");
