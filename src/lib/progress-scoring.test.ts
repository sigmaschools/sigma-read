import assert from "node:assert/strict";
import {
  parseProgressResponse,
  clampDelta,
  isConversationComplete,
} from "./progress-scoring";

// ─── Test: clampDelta clamps between 0 and 40 ─────────────────────────────
{
  assert.strictEqual(clampDelta(25), 25, "normal value passes through");
  assert.strictEqual(clampDelta(50), 40, "delta > 40 clamped to 40");
  assert.strictEqual(clampDelta(-5), 0, "negative delta clamped to 0");
  assert.strictEqual(clampDelta(0), 0, "zero stays zero");
  assert.strictEqual(clampDelta(40), 40, "exactly 40 stays 40");
  console.log("✅ clampDelta clamps between 0 and 40");
}

// ─── Test: parseProgressResponse extracts JSON from model output ───────────
{
  const result = parseProgressResponse(
    '{"message": "Tell me more about that.", "progressDelta": 25}'
  );
  assert.strictEqual(result.message, "Tell me more about that.");
  assert.strictEqual(result.progressDelta, 25);
  console.log("✅ parseProgressResponse extracts valid JSON");
}

// ─── Test: parseProgressResponse handles JSON with surrounding text ────────
{
  const result = parseProgressResponse(
    'Here is my response: {"message": "Good thinking!", "progressDelta": 30} end'
  );
  assert.strictEqual(result.message, "Good thinking!");
  assert.strictEqual(result.progressDelta, 30);
  console.log("✅ parseProgressResponse handles JSON with surrounding text");
}

// ─── Test: parseProgressResponse falls back on non-JSON ────────────────────
{
  const result = parseProgressResponse(
    "That's a great observation! Tell me more about what you think."
  );
  assert.strictEqual(
    result.message,
    "That's a great observation! Tell me more about what you think."
  );
  assert.strictEqual(result.progressDelta, 0);
  console.log("✅ parseProgressResponse falls back to plain text with delta 0");
}

// ─── Test: parseProgressResponse handles malformed JSON ────────────────────
{
  const result = parseProgressResponse('{"message": "broken json, "progressDelta": 10}');
  // Should not crash — falls back to raw text
  assert.strictEqual(result.progressDelta, 0);
  assert.ok(result.message.length > 0, "message is non-empty on fallback");
  console.log("✅ parseProgressResponse handles malformed JSON without crash");
}

// ─── Test: conversation does NOT complete before 3 exchanges ───────────────
{
  const result = isConversationComplete({
    progressScore: 110,
    exchangeNumber: 2,
    forceComplete: false,
  });
  assert.strictEqual(result, false, "should not complete at exchange 2 even with high score");
  console.log("✅ conversation does not complete before 3 exchanges even if progressScore >= 100");
}

// ─── Test: conversation completes when progressScore >= 100 AND exchanges >= 3
{
  const result = isConversationComplete({
    progressScore: 100,
    exchangeNumber: 3,
    forceComplete: false,
  });
  assert.strictEqual(result, true, "should complete at exchange 3 with score 100");
  console.log("✅ conversation completes when progressScore >= 100 AND exchangeNumber >= 3");
}

// ─── Test: conversation does NOT complete with low score even at exchange 3 ─
{
  const result = isConversationComplete({
    progressScore: 80,
    exchangeNumber: 3,
    forceComplete: false,
  });
  assert.strictEqual(result, false, "should not complete with score < 100");
  console.log("✅ conversation does not complete with score < 100 at exchange 3");
}

// ─── Test: forceComplete overrides everything ──────────────────────────────
{
  const result = isConversationComplete({
    progressScore: 20,
    exchangeNumber: 1,
    forceComplete: true,
  });
  assert.strictEqual(result, true, "forceComplete should override");
  console.log("✅ forceComplete overrides score and exchange requirements");
}

// ─── Test: conversation completes with score well above 100 ────────────────
{
  const result = isConversationComplete({
    progressScore: 150,
    exchangeNumber: 5,
    forceComplete: false,
  });
  assert.strictEqual(result, true, "should complete with high score and high exchange");
  console.log("✅ conversation completes with score well above 100");
}

console.log("\n🎉 All progress-scoring tests passed!");
