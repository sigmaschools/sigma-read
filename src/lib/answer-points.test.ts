import assert from "node:assert/strict";
import { pointsForScore, answerTier, answerPointsOn, lastAnswerWasThin, ANSWER_POINTS_LEARNERS, GOOD_ANSWER_POINTS } from "./answer-points";

// Thin answers barely move the bar; good ones jump it
assert.equal(pointsForScore(0), 2);
assert.equal(pointsForScore(10), 2);
assert.equal(pointsForScore(15), 5);
assert.equal(pointsForScore(20), 5);
assert.equal(pointsForScore(25), 20);
assert.equal(pointsForScore(35), 30);
assert.equal(pointsForScore(40), 35);
// Out of range or missing scores are clamped, never NaN
assert.equal(pointsForScore(99), 35);
assert.equal(pointsForScore(-5), 2);
assert.equal(pointsForScore(Number.NaN), 2);
assert.equal(pointsForScore(undefined as unknown as number), 2);
// Five solid explanations fill the bar; ten repeated facts don't
assert.ok(5 * pointsForScore(25) >= 100);
assert.ok(10 * pointsForScore(20) < 100);
// Two answers can never finish it, however good
assert.ok(2 * pointsForScore(40) < 100);
console.log("✅ points follow the answer's quality");

assert.equal(answerTier(2), "quiet");
assert.equal(answerTier(5), "quiet");
assert.equal(answerTier(GOOD_ANSWER_POINTS), "good");
assert.equal(answerTier(20), "good");
assert.equal(answerTier(26), "great");
assert.equal(answerTier(35), "great");
console.log("✅ only good answers pop, the best ones bigger");

const learner = [...ANSWER_POINTS_LEARNERS][0];
const base = { externalId: learner, design: "spring", isTutorial: false, priorMessages: [] };
assert.equal(answerPointsOn(base), true);
assert.equal(answerPointsOn({ ...base, design: "classic" }), true);
assert.equal(answerPointsOn({ ...base, externalId: "someone-else" }), false, "only listed learners");
assert.equal(answerPointsOn({ ...base, externalId: null }), false);
assert.equal(answerPointsOn({ ...base, isTutorial: true }), false, "never the tutorial");
assert.equal(answerPointsOn({ ...base, design: "sigma" }), false, "the redesigned tutor scores elsewhere");
assert.equal(answerPointsOn({ ...base, priorMessages: [{ role: "assistant" }, { role: "user", points: 5 }] }), true);
assert.equal(answerPointsOn({ ...base, priorMessages: [{ role: "assistant" }, { role: "user" }] }), false, "a conversation begun without points keeps the old bar");
console.log("✅ on only for listed learners and conversations that began with it");

assert.equal(lastAnswerWasThin([]), false);
assert.equal(lastAnswerWasThin([{ role: "user", points: 5 }]), true);
assert.equal(lastAnswerWasThin([{ role: "user", points: 2 }, { role: "assistant" }, { role: "user", points: 20 }]), false);
assert.equal(lastAnswerWasThin([{ role: "user", points: 20 }, { role: "assistant" }, { role: "user", points: 5 }, { role: "assistant" }]), true);
console.log("✅ a thin answer brings help on the next");
