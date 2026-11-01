import assert from "node:assert/strict";
import { generalFits, grokipediaPageUrl, parseSourcePick } from "./source-pick";

const results = [
  { title: "Girls games", url: "https://grokipedia.com/page/Girls_games" },
  { title: "Panhellenic Games", url: "https://grokipedia.com/page/Panhellenic_Games" },
  { title: "Soccer", url: "https://grokipedia.com/page/Soccer" },
];

assert.equal(grokipediaPageUrl("Video game"), "https://grokipedia.com/page/Video_game");

// Picks keep Haiku's order
assert.deepEqual(parseSourcePick('{"pages": [3, 1]}', results, "x"), [results[2], results[0]]);

// A general page that wasn't listed goes first, ahead of the picks
assert.deepEqual(parseSourcePick('Sure: {"pages": [1], "general": "Video game"}', results, "games"), [
  { title: "Video game", url: "https://grokipedia.com/page/Video_game" },
  results[0],
]);

// A general page already listed isn't added twice
assert.deepEqual(parseSourcePick('{"pages": [3], "general": "Soccer"}', results, "soccer"), [results[2]]);

// None fit
assert.deepEqual(parseSourcePick('{"pages": []}', results, "x"), []);

// Unreadable or out-of-range replies keep the search order (null)
assert.equal(parseSourcePick("I think page 3", results, "x"), null);
assert.equal(parseSourcePick('{"pages": [15]}', results, "x"), null);
assert.equal(parseSourcePick('{"pages": "3"}', results, "x"), null);
assert.equal(parseSourcePick('{"pages": [3,}', results, "x"), null);

// Bad page numbers with a usable general page: just the general page
assert.deepEqual(parseSourcePick('{"pages": [15], "general": "Video game"}', results, "games"), [
  { title: "Video game", url: "https://grokipedia.com/page/Video_game" },
]);

// No search results at all: the general page alone
assert.deepEqual(parseSourcePick('{"pages": [], "general": "Animal"}', [], "animals"), [
  { title: "Animal", url: "https://grokipedia.com/page/Animal" },
]);

// A general page that is too long or not a string is ignored
assert.deepEqual(parseSourcePick(`{"pages": [3], "general": "${"x".repeat(81)}"}`, results, "x"), [results[2]]);
assert.deepEqual(parseSourcePick('{"pages": [3], "general": 7}', results, "x"), [results[2]]);

// The old bare-array reply still works
assert.deepEqual(parseSourcePick("[3, 1]", results, "x"), [results[2], results[0]]);

// Titles that are only dots are ignored
assert.deepEqual(parseSourcePick('{"pages": [3], "general": ".."}', results, "x"), [results[2]]);

// Valid numbers are kept from a mix; repeats and non-integers are dropped
assert.deepEqual(parseSourcePick('{"pages": [3, 15, 1.5, 3, 1]}', results, "x"), [results[2], results[0]]);

// Titles are encoded so they stay one path segment on grokipedia.com
assert.equal(grokipediaPageUrl("AC/DC?"), "https://grokipedia.com/page/AC%2FDC%3F");

// A general page must share a word with the interest: "games" -> "Game", never "SpaceX" -> "Company"
assert.equal(generalFits("Game", "games"), true);
assert.equal(generalFits("Video game", "games"), true);
assert.equal(generalFits("Animal", "animals"), true);
assert.equal(generalFits("The Beatles", "the dogs"), false);
assert.equal(generalFits("Department of Defense", "DoD"), true);
assert.equal(generalFits("Federal Bureau of Investigation", "FBI"), true);
assert.equal(generalFits("Butterfly", "butterflies"), true);
assert.equal(generalFits("Wolf", "wolves"), true);
assert.equal(generalFits("Fox", "foxes"), true);
assert.equal(generalFits("Glass", "glasses"), true);
assert.equal(generalFits("Movie", "movies"), true);
assert.equal(generalFits("Wave", "waves"), true);
assert.equal(generalFits("Knife", "knives"), true);
assert.equal(generalFits("Bus", "buses"), true);
assert.equal(generalFits("Potato", "potatoes"), true);
assert.equal(generalFits("Video game", "gaming"), true);
assert.equal(generalFits("Skateboard", "skateboarding"), true);
assert.equal(generalFits("Zombie", "zombies"), true);
assert.equal(generalFits("Company", "SpaceX"), false);
assert.equal(generalFits("Dog", "dogs"), true);
assert.equal(generalFits("Cat", "cats"), true);
assert.equal(generalFits("Car", "cars"), true);
assert.equal(generalFits("Artificial intelligence", "AI"), true);
assert.equal(generalFits("Space", "SpaceX"), false);
assert.equal(generalFits("Mine", "Minecraft"), false);
assert.equal(generalFits("Car", "cartoons"), false);
assert.equal(generalFits("AI", "ai"), true);
assert.deepEqual(parseSourcePick('{"pages": [], "general": "Company"}', results, "SpaceX"), []);
assert.deepEqual(parseSourcePick('{"pages": [], "general": "Game"}', results, "games"), [
  { title: "Game", url: "https://grokipedia.com/page/Game" },
]);

console.log("source-pick tests passed");
