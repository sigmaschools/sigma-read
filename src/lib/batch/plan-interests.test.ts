import assert from "node:assert";
import { interestCap, pickInterests } from "./plan-interests";

// One student: their three interests, in order (same as before the cap)
assert.deepEqual(pickInterests([["soccer", "space", "dogs"]], interestCap(1)), ["soccer", "space", "dogs"]);

// A shared interest covers both students with one article
const two = pickInterests([["tesla", "space"], ["dogs", "tesla"]], 1);
assert.deepEqual(two, ["tesla"]);

// Everyone gets something before anyone gets a second article
const many = pickInterests([["a", "b"], ["a", "c"], ["d", "e"]], 2);
assert.deepEqual(many, ["a", "d"]);

// Fill goes to the most widely wanted interests
// ("b" covers all three students at once, then "a" and "x" are wanted by two each)
const fill = pickInterests([["a", "b", "x"], ["a", "b"], ["c", "x", "b"]], 3);
assert.deepEqual(fill, ["b", "a", "x"]);

// The cap holds, and grows slower than one per student
assert.equal(interestCap(1), 3);
assert.equal(interestCap(10), 4);
assert.equal(interestCap(100), 30);
const crowd = Array.from({ length: 100 }, (_, i) => [`own-${i}`, "shared"]);
assert.equal(pickInterests(crowd, interestCap(100))[0], "shared");
assert.equal(pickInterests(crowd, interestCap(100)).length, 30);

// No interests, no picks
assert.deepEqual(pickInterests([[], []], 3), []);

console.log("plan-interests tests passed");
