import assert from "node:assert/strict";
import { reportConfidence, clampScore } from "./report-schema";

// ─── Test: reportConfidence ───────────────────────────────────────────────
{
  assert.strictEqual(reportConfidence({ forcedClose: true, exchangeCount: 6, studentAvgWords: 20 }), "low", "forced close is low");
  assert.strictEqual(reportConfidence({ forcedClose: false, exchangeCount: 2, studentAvgWords: 20 }), "low", "under 3 exchanges is low");
  assert.strictEqual(reportConfidence({ forcedClose: false, exchangeCount: 4, studentAvgWords: 3 }), "low", "very short answers are low");
  assert.strictEqual(reportConfidence({ forcedClose: false, exchangeCount: 3, studentAvgWords: 6 }), "medium", "short answers are medium");
  assert.strictEqual(reportConfidence({ forcedClose: false, exchangeCount: 3, studentAvgWords: 12 }), "high", "full answers are high");
  console.log("✅ reportConfidence grades conversation shape");
}

// ─── Test: clampScore ─────────────────────────────────────────────────────
{
  assert.strictEqual(clampScore(150), 100);
  assert.strictEqual(clampScore(0), 1);
  assert.strictEqual(clampScore(72.6), 73);
  console.log("✅ clampScore keeps scores in 1-100");
}
