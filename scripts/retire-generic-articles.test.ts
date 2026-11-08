import assert from "node:assert";
import { grokipediaSubject, isOverviewPage } from "./retire-generic-articles";

assert.equal(grokipediaSubject("https://grokipedia.com/page/Animal"), "animal");
assert.equal(grokipediaSubject("https://grokipedia.com/page/Newton%27s_laws_of_motion?x=1"), "newton's laws of motion");
assert.equal(grokipediaSubject("https://kids.nationalgeographic.com/animals/wombat"), null);
assert.equal(grokipediaSubject(null), null);

// The page on the interest itself is an overview
assert.ok(isOverviewPage("animal", "animals"));
assert.ok(isOverviewPage("cooking", "cooking"));
assert.ok(isOverviewPage("video game", "video games"));
assert.ok(isOverviewPage("airsoft", "airsoft"));
assert.ok(isOverviewPage("cooking (food)", "cooking"));
// A specific page is a story, even a one-word one; no interest to compare with means no call
assert.ok(!isOverviewPage("hop-up (airsoft)", "airsoft"));
assert.ok(!isOverviewPage("starcraft ii: wings of liberty", "starcraft"));
assert.ok(!isOverviewPage("common wombat", "animals"));
assert.ok(!isOverviewPage("wombat", "animals"));
assert.ok(!isOverviewPage("minecraft", "video games"));
assert.ok(!isOverviewPage("airsoft", null));

console.log("retire-generic-articles tests passed");
