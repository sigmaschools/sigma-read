import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractAnswer, firstName, interviewOpener, interviewWrapUp, moreInterestsPrompt, stripAnswer, topUpInterests } from "./onboarding-copy";

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
assert.equal(firstName("Lopez, Maya"), "Maya");
assert.equal(firstName("Maya Lopez, Jr."), "Maya");
assert.equal(firstName("Maya,"), "Maya");
assert.equal(firstName("Garcia Lopez, Maria"), "Maria");
// Long lists stay short: up to six named; seven or more name five, then "and N more"
assert.ok(interviewWrapUp(["a", "b", "c", "d", "e"]).startsWith("A, b, c, d and e, got it!"));
assert.ok(interviewWrapUp(["a", "b", "c", "d", "e", "f"]).startsWith("A, b, c, d, e and f, got it!"));
assert.ok(interviewWrapUp(["a", "b", "c", "d", "e", "f", "g"]).startsWith("A, b, c, d, e and 2 more, got it!"));
// [ANSWER] parsing
const profile = '[PROFILE]\n{"interests": ["dogs"]}';
assert.equal(extractAnswer(`Dogs it is.\n[ANSWER] I'm an AI, but I love octopuses.\n${profile}`), "I'm an AI, but I love octopuses.");
assert.equal(extractAnswer(`[ANSWER] I like whales! Do you? ${profile}`), null);
assert.equal(extractAnswer(`[ANSWER] I like Mr. Beast videos. ${profile}`), "I like Mr. Beast videos.");
assert.equal(extractAnswer("[ANSWER] I read 3.5 books a week!"), "I read 3.5 books a week!");
assert.equal(extractAnswer(`Dogs it is.\n${profile}`), null);
assert.equal(extractAnswer(`[ANSWER]\n${profile}`), null);
assert.equal(extractAnswer("[ANSWER] no end punctuation"), null);
assert.equal(extractAnswer(`[ANSWER] ${"word ".repeat(40)}.`), null);
assert.equal(extractAnswer(`[ANSWER] Why do you ask? I like octopuses. ${profile}`), null);
assert.equal(stripAnswer("Sharks, there's a lot there.\n[ANSWER] I like sharks too.\nWhat else?"), "Sharks, there's a lot there.\nI like sharks too.\nWhat else?");
assert.equal(stripAnswer("Sharks! [ANSWER] I like them too."), "Sharks! I like them too.");
assert.equal(stripAnswer("No tag here."), "No tag here.");
// The prompt quotes the opener; keep the two in sync
const prompt = readFileSync(new URL("./prompts/md/interest-interview.md", import.meta.url), "utf8");
assert.ok(prompt.includes(interviewOpener("[name]")), "interest-interview.md must quote interviewOpener");
assert.ok(interviewWrapUp(["iPhone", "soccer"]).startsWith("iPhone and soccer, got it!"));
assert.ok(moreInterestsPrompt(["dogs", "soccer"]).startsWith("Dogs and soccer, good start. What's one more thing you like?"));
assert.ok(moreInterestsPrompt(["iPhone"]).startsWith("iPhone, good start."));
assert.ok(moreInterestsPrompt([]).includes("Pick any that sound good"), "the page shows idea buttons on this phrase");
assert.ok(moreInterestsPrompt([]).startsWith("What's one more thing you like?"));
assert.deepEqual(topUpInterests(["Space"], 3), ["Space", "animals", "sports"]);
assert.deepEqual(topUpInterests(["a", "b", "c"], 3), ["a", "b", "c"]);
console.log("onboarding-copy tests passed");
