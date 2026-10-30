import assert from "node:assert/strict";
import { ratingForScore, verifiedEvidence, reportConfidence, clampScore } from "./report-schema";

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

// ─── ratingForScore follows the documented bands ───────────────────────────
{
  assert.equal(ratingForScore(85), "Exceptional");
  assert.equal(ratingForScore(84), "Strong");
  assert.equal(ratingForScore(70), "Strong");
  assert.equal(ratingForScore(69), "Solid");
  assert.equal(ratingForScore(55), "Solid");
  assert.equal(ratingForScore(54), "Developing");
  assert.equal(ratingForScore(40), "Developing");
  assert.equal(ratingForScore(39), "Struggled");
  console.log("✅ ratingForScore follows the documented bands");
}

// ─── verifiedEvidence drops quotes the student never wrote ─────────────────
{
  const said = ["It squirts INK and swims away!", "um i think the three hearts"];
  const kept = verifiedEvidence([
    { skill: "key_details", quote: "squirts ink and swims away" },
    { skill: "main_idea", quote: "octopuses are masters of disguise" },
    { skill: "key_details", quote: "three hearts" },
    { skill: "vocabulary", quote: "" },
  ], said);
  assert.deepEqual(kept.map(e => e.quote), ["squirts ink and swims away", "three hearts"]);
  assert.equal(verifiedEvidence([{ skill: "key_details", quote: "ink" }], ["i think so"]).length, 0, "no match inside a word");
  assert.equal(verifiedEvidence([{ skill: "key_details", quote: "la pieuvre a trois cœurs" }], ["La pieuvre a trois cœurs!"]).length, 1, "non-ASCII text matches");
  const many = Array.from({ length: 5 }, () => ({ skill: "key_details" as const, quote: "three hearts" }));
  assert.equal(verifiedEvidence(many, said).length, 3, "capped at 3");
  console.log("✅ verifiedEvidence keeps only real student quotes");
}

// ─── reportConfidence boundaries ───────────────────────────────────────────
{
  assert.equal(reportConfidence({ forcedClose: false, exchangeCount: 3, studentAvgWords: 4 }), "medium");
  assert.equal(reportConfidence({ forcedClose: false, exchangeCount: 3, studentAvgWords: 8 }), "high");
  assert.equal(reportConfidence({ forcedClose: false, exchangeCount: 2, studentAvgWords: 20 }), "low");
  console.log("✅ reportConfidence boundaries");
}
