import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { answerScorePrompt, pointsForTier, scoreAnswer, ANSWER_TIER_POINTS } from "./answer-score";

// A solid answer for the level fills a fifth of the bar; a strong one more; thin ones barely move it
assert.deepEqual(ANSWER_TIER_POINTS, [2, 5, 20, 30]);
assert.equal(pointsForTier(0), 2);
assert.equal(pointsForTier(1), 5);
assert.equal(pointsForTier(2), 20);
assert.equal(pointsForTier(3), 30);
assert.equal(pointsForTier(7), 30, "clamped");
assert.equal(pointsForTier(-1), 2, "clamped");
assert.ok(5 * pointsForTier(2) >= 100, "five solid answers finish");
assert.ok(10 * pointsForTier(1) < 100, "ten thin ones don't");
console.log("✅ tiers set the bar's move");

// The prompt judges against the student's grade, not an adult, and names the question being answered
const p = answerScorePrompt({ articleText: "Crows remember faces.", level: 3, question: "Tell me why that matters.", answer: "they can tell who was mean to them" });
assert.match(p, /grade 5-6/i);
assert.doesNotMatch(p, /Crows remember faces/, "the article goes in the cached system block");
assert.match(p, /Tell me why that matters\./);
assert.match(p, /they can tell who was mean to them/);
assert.match(p, /not length/i);
assert.match(p, /<student_answer>\nthey can tell who was mean to them\n<\/student_answer>/, "the answer is fenced as data");
console.log("✅ prompt is level-anchored");

function fake(text: string, stop = "end_turn") {
  const calls: unknown[] = [];
  const options: unknown[] = [];
  const client = { messages: { create: async (req: unknown, opts?: unknown) => { calls.push(req); options.push(opts); return { stop_reason: stop, content: [{ type: "text", text }] }; } } } as unknown as Anthropic;
  return { client, calls, options };
}

async function main() {
  const ok = fake(JSON.stringify({ reason: "explains with a detail", tier: 2 }));
  assert.equal(await scoreAnswer(ok.client, { articleText: "Crows remember faces.", level: 3, question: "q", answer: "a" }), 2);
  assert.match(JSON.stringify(ok.calls[0]), /Crows remember faces/);
  assert.deepEqual(ok.options[0], { timeout: 8000, maxRetries: 0 }, "a slow scorer gives up quickly");
  const odd = fake(JSON.stringify({ reason: "", tier: 9 }));
  assert.equal(await scoreAnswer(odd.client, { articleText: "x", level: 3, question: "q", answer: "a" }), null, "out-of-range tier is ignored");
  const refused = fake("", "refusal");
  assert.equal(await scoreAnswer(refused.client, { articleText: "x", level: 3, question: "q", answer: "a" }), null);
  const broken = { messages: { create: async () => { throw new Error("overloaded"); } } } as unknown as Anthropic;
  assert.equal(await scoreAnswer(broken, { articleText: "x", level: 3, question: "q", answer: "a" }), null, "a failed call never breaks the turn");
  console.log("✅ scorer answers a tier or null");
}

main().catch(e => { console.error(e); process.exit(1); });
