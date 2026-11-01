import assert from "node:assert/strict";
import { starterInterests, starterPending, starterProgress, STARTER_STALE_MS } from "./starter-plan";

// First three interests, repeats dropped
assert.deepEqual(starterInterests({ interests: ["Minecraft", "dogs", "minecraft ", "soccer", "space"] }), ["Minecraft", "dogs", "soccer"]);
assert.deepEqual(starterInterests({ interests: ["sharks"] }), ["sharks"]);
assert.deepEqual(starterInterests(null), []);

// Waiting until three are ready, or the job is done
assert.deepEqual(starterProgress(true, 0), { ready: 0, total: 3, done: false });
assert.deepEqual(starterProgress(true, 2), { ready: 2, total: 3, done: false });
assert.deepEqual(starterProgress(true, 5), { ready: 3, total: 3, done: true });
assert.deepEqual(starterProgress(false, 1), { ready: 1, total: 3, done: true });

// Pending only while the job is fresh: a job that died must not trap the student
const now = new Date("2026-11-01T12:00:00Z");
assert.equal(starterPending("pending", new Date(now.getTime() - 60_000), now), true);
assert.equal(starterPending("pending", new Date(now.getTime() - STARTER_STALE_MS), now), false);
assert.equal(starterPending("pending", null, now), false);
assert.equal(starterPending("done", new Date(now.getTime() - 60_000), now), false);
// Students onboarded before starter articles existed never wait
assert.equal(starterPending(null, null, now), false);

console.log("starter-plan tests passed");
