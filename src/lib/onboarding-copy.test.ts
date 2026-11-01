import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interviewOpener, interviewWrapUp } from "./onboarding-copy";

assert.ok(interviewOpener("Zack").startsWith("Hi Zack, I'm Sigma. SigmaRead is an app"));
assert.equal(
  interviewWrapUp(["SpaceX", "StarCraft", "fishing"]),
  "SpaceX, StarCraft and fishing, got it! I'm finding your first articles now. While I do, here's a quick look at how SigmaRead works.",
);
assert.ok(interviewWrapUp(["dogs", "soccer"]).startsWith("Dogs and soccer, got it!"));
assert.ok(interviewWrapUp(["dogs"]).startsWith("Dogs, got it!"));
assert.ok(interviewWrapUp([]).startsWith("Got it! I'm finding"));
assert.ok(interviewWrapUp(["a", "b", "c", "d"]).startsWith("A, b and c, got it!"));
// The prompt quotes the opener; keep the two in sync
const prompt = readFileSync(new URL("./prompts/md/interest-interview.md", import.meta.url), "utf8");
assert.ok(prompt.includes(interviewOpener("[name]")), "interest-interview.md must quote interviewOpener");
assert.ok(interviewWrapUp(["iPhone", "soccer"]).startsWith("iPhone and soccer, got it!"));
console.log("onboarding-copy tests passed");
