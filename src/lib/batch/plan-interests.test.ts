import assert from "node:assert";
import { pickInterests } from "./plan-interests";

// One student: their interests, in their order
assert.deepEqual(pickInterests([["soccer", "space", "dogs"]]), ["soccer", "space", "dogs"]);

// Two students with nothing in common: every student's first interest before anyone's second,
// and nothing left out
const two = pickInterests([["airsoft", "starcraft", "space"], ["animals", "cooking", "history"]]);
assert.deepEqual(two, ["airsoft", "animals", "starcraft", "cooking", "space", "history"]);

// A shared interest is written once, and first within its rank
const shared = pickInterests([["soccer", "space"], ["minecraft", "soccer"], ["soccer", "dogs"]]);
assert.deepEqual(shared, ["soccer", "minecraft", "space", "dogs"]);

// An interest already picked at an earlier rank is not picked again
assert.deepEqual(pickInterests([["a", "b"], ["b", "a"]]), ["a", "b"]);

// A crowd of students: everyone's own first interest is written, however many students there are
const crowd = Array.from({ length: 100 }, (_, i) => [`own-${i}`, "animals", "space"]);
const picks = pickInterests(crowd);
assert.equal(picks.length, 102);
assert.ok(crowd.every(w => picks.includes(w[0])));
assert.deepEqual(picks.slice(100), ["animals", "space"]);

// Students with no interests contribute nothing
assert.deepEqual(pickInterests([[], ["dogs"]]), ["dogs"]);
assert.deepEqual(pickInterests([]), []);

console.log("plan-interests tests passed");
