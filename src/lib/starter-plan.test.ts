import assert from "node:assert/strict";
import { starterInterests, starterProgress } from "./starter-plan";

// First three interests, repeats dropped
assert.deepEqual(starterInterests({ interests: ["Minecraft", "dogs", "minecraft ", "soccer", "space"] }), ["Minecraft", "dogs", "soccer"]);
assert.deepEqual(starterInterests({ interests: ["sharks"] }), ["sharks"]);
assert.deepEqual(starterInterests(null), []);

// Waiting until three are ready, or the job is done
assert.deepEqual(starterProgress("pending", 0), { ready: 0, total: 3, done: false });
assert.deepEqual(starterProgress("pending", 2), { ready: 2, total: 3, done: false });
assert.deepEqual(starterProgress("pending", 5), { ready: 3, total: 3, done: true });
assert.deepEqual(starterProgress("done", 1), { ready: 1, total: 3, done: true });
// Students onboarded before starter articles existed never wait
assert.deepEqual(starterProgress(null, 0), { ready: 0, total: 3, done: true });

console.log("starter-plan tests passed");
