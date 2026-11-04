import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractAnswer, firstName, interviewOpener, interviewWrapUp, stripAnswer } from "./onboarding-copy";

assert.ok(interviewOpener("Zack").startsWith("Hi Zack, I'm Sigma. SigmaRead is an app"));
assert.equal(
  interviewWrapUp(["SpaceX", "StarCraft", "fishing"]),
  "SpaceX, StarCraft and fishing, got it! I'm finding your first articles now. While I do, here's a quick look at how SigmaRead works.",
);
assert.ok(interviewWrapUp(["dogs", "soccer"]).startsWith("Dogs and soccer, got it!"));
assert.ok(interviewWrapUp(["dogs"]).startsWith("Dogs, got it!"));
assert.ok(interviewWrapUp([]).startsWith("Got it! I'm finding"));
// Every interest is named, not just the first three
assert.ok(interviewWrapUp(["a", "b", "c", "d"]).startsWith("A, b, c and d, got it!"));
// An answer to the student's question comes first
assert.ok(interviewWrapUp(["dogs"], "I love octopuses.").startsWith("I love octopuses. Dogs, got it!"));
assert.ok(interviewWrapUp(["dogs"], "  ").startsWith("Dogs, got it!"));
assert.equal(firstName("Maya Lopez"), "Maya");
assert.equal(firstName("  Zack "), "Zack");
assert.equal(firstName(""), "there");
assert.equal(firstName(null), "there");
assert.equal(firstName("Lopez, Maya"), "Lopez");
// Long lists stay short: four named, then "and N more"
assert.ok(interviewWrapUp(["a", "b", "c", "d", "e"]).startsWith("A, b, c, d and e, got it!"));
assert.ok(interviewWrapUp(["a", "b", "c", "d", "e", "f", "g"]).startsWith("A, b, c, d and 3 more, got it!"));
// [ANSWER] parsing
const profile = '[PROFILE]\n{"interests": ["dogs"]}';
assert.equal(extractAnswer(`Dogs it is.\n[ANSWER] I'm an AI, but I love octopuses.\n${profile}`), "I'm an AI, but I love octopuses.");
assert.equal(extractAnswer(`[ANSWER] I like whales! Do you? ${profile}`), "I like whales!");
assert.equal(extractAnswer(`Dogs it is.\n${profile}`), null);
assert.equal(extractAnswer(`[ANSWER]\n${profile}`), null);
assert.equal(extractAnswer("[ANSWER] no end punctuation"), null);
assert.equal(extractAnswer(`[ANSWER] ${"word ".repeat(40)}.`), null);
assert.equal(stripAnswer("Sharks, there's a lot there.\n[ANSWER] I like sharks too.\nWhat else?"), "Sharks, there's a lot there.\nWhat else?");
assert.equal(stripAnswer("No tag here."), "No tag here.");
// The prompt quotes the opener; keep the two in sync
const prompt = readFileSync(new URL("./prompts/md/interest-interview.md", import.meta.url), "utf8");
assert.ok(prompt.includes(interviewOpener("[name]")), "interest-interview.md must quote interviewOpener");
assert.ok(interviewWrapUp(["iPhone", "soccer"]).startsWith("iPhone and soccer, got it!"));
console.log("onboarding-copy tests passed");
