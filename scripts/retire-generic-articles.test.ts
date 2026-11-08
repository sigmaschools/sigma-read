import assert from "node:assert";
import { grokipediaSubject, isOverviewPage } from "./retire-generic-articles";

assert.equal(grokipediaSubject("https://grokipedia.com/page/Animal"), "animal");
assert.equal(grokipediaSubject("https://grokipedia.com/page/Newton%27s_laws_of_motion?x=1"), "newton's laws of motion");
assert.equal(grokipediaSubject("https://kids.nationalgeographic.com/animals/wombat"), null);
assert.equal(grokipediaSubject(null), null);

// The interest itself, or any one-word subject, is an overview
assert.ok(isOverviewPage("animal", "animals"));
assert.ok(isOverviewPage("cooking", "cooking"));
assert.ok(isOverviewPage("video game", "video games"));
assert.ok(isOverviewPage("airsoft", null));
// A specific page is a story
assert.ok(!isOverviewPage("hop-up (airsoft)", "airsoft"));
assert.ok(!isOverviewPage("starcraft ii: wings of liberty", "starcraft"));
assert.ok(!isOverviewPage("common wombat", "animals"));

console.log("retire-generic-articles tests passed");
