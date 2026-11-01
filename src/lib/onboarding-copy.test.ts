import assert from "node:assert/strict";
import { interviewOpener, interviewWrapUp } from "./onboarding-copy";

assert.ok(interviewOpener("Zack").startsWith("Hi Zack, I'm Sigma. SigmaRead is an app"));
assert.equal(
  interviewWrapUp(["SpaceX", "StarCraft", "fishing"]),
  "SpaceX, StarCraft and fishing, got it! I'm finding your first articles now. While I do, here's a quick look at how SigmaRead works.",
);
assert.ok(interviewWrapUp(["dogs", "soccer"]).startsWith("dogs and soccer, got it!"));
assert.ok(interviewWrapUp(["dogs"]).startsWith("dogs, got it!"));
assert.ok(interviewWrapUp([]).startsWith("Got it! I'm finding"));
assert.ok(interviewWrapUp(["a", "b", "c", "d"]).startsWith("a, b and c, got it!"));
console.log("onboarding-copy tests passed");
