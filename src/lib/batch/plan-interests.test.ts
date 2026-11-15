import assert from "node:assert";
import { pickInterests, storiesWanted, studentWants } from "./plan-interests";

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

// ─── Writing to need ─────────────────────────────────────────────────────────

// A student who has not read since the last batch, with a full home screen, gets nothing written
assert.equal(storiesWanted(0, 10), 0);
assert.equal(storiesWanted(0, 5), 0);
// One new story for each article read, up to three
assert.equal(storiesWanted(1, 10), 1);
assert.equal(storiesWanted(3, 12), 3);
assert.equal(storiesWanted(5, 12), 3);
// A student with too few unread articles to fill the home screen gets stories whether or not they read
assert.equal(storiesWanted(0, 4), 1);
assert.equal(storiesWanted(0, 0), 3);
assert.equal(storiesWanted(1, 3), 2);
// Odd inputs never ask for a negative number or more than three
assert.equal(storiesWanted(-2, 40), 0);
assert.equal(storiesWanted(100, 0), 3);

// The interests that have waited longest come first, and only as many as are wanted
const waited: Record<string, number> = { soccer: 30, space: 10, dogs: 20, chess: 0 };
const last = (i: string) => waited[i] ?? 0;
assert.deepEqual(studentWants(["soccer", "space", "dogs", "chess"], 3, last, new Set()), ["chess", "space", "dogs"]);
assert.deepEqual(studentWants(["soccer", "space", "dogs", "chess"], 1, last, new Set()), ["chess"]);
assert.deepEqual(studentWants(["soccer", "space", "dogs", "chess"], 0, last, new Set()), []);
// A story written earlier today takes one of the student's places, so a resumed run does not move on to another interest
assert.deepEqual(studentWants(["soccer", "space", "dogs", "chess"], 3, last, new Set(["chess"])), ["space", "dogs"]);
assert.deepEqual(studentWants(["soccer", "space", "dogs", "chess"], 3, last, new Set(["chess", "space", "dogs"])), []);
// The student's own order is not changed
const mine = ["soccer", "space"];
studentWants(mine, 2, last, new Set());
assert.deepEqual(mine, ["soccer", "space"]);

console.log("plan-interests tests passed");
