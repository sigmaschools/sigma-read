import assert from "node:assert/strict";
import { grokipediaPageUrl, parseSourcePick } from "./source-pick";

const results = [
  { title: "Girls games", url: "https://grokipedia.com/page/Girls_games" },
  { title: "Panhellenic Games", url: "https://grokipedia.com/page/Panhellenic_Games" },
  { title: "Soccer", url: "https://grokipedia.com/page/Soccer" },
];

assert.equal(grokipediaPageUrl("Video game"), "https://grokipedia.com/page/Video_game");

// Picks keep Haiku's order
assert.deepEqual(parseSourcePick('{"pages": [3, 1]}', results), [results[2], results[0]]);

// A general page that wasn't listed goes first, ahead of the picks
assert.deepEqual(parseSourcePick('Sure: {"pages": [1], "general": "Video game"}', results), [
  { title: "Video game", url: "https://grokipedia.com/page/Video_game" },
  results[0],
]);

// A general page already listed isn't added twice
assert.deepEqual(parseSourcePick('{"pages": [3], "general": "Soccer"}', results), [results[2]]);

// None fit
assert.deepEqual(parseSourcePick('{"pages": []}', results), []);

// Unreadable or out-of-range replies keep the search order (null)
assert.equal(parseSourcePick("I think page 3", results), null);
assert.equal(parseSourcePick('{"pages": [15]}', results), null);
assert.equal(parseSourcePick('{"pages": "3"}', results), null);
assert.equal(parseSourcePick('{"pages": [3,}', results), null);

// Bad page numbers with a usable general page: just the general page
assert.deepEqual(parseSourcePick('{"pages": [15], "general": "Video game"}', results), [
  { title: "Video game", url: "https://grokipedia.com/page/Video_game" },
]);

// No search results at all: the general page alone
assert.deepEqual(parseSourcePick('{"pages": [], "general": "Animal"}', []), [
  { title: "Animal", url: "https://grokipedia.com/page/Animal" },
]);

// A general page that is too long or not a string is ignored
assert.deepEqual(parseSourcePick(`{"pages": [3], "general": "${"x".repeat(81)}"}`, results), [results[2]]);
assert.deepEqual(parseSourcePick('{"pages": [3], "general": 7}', results), [results[2]]);

// The old bare-array reply still works
assert.deepEqual(parseSourcePick("[3, 1]", results), [results[2], results[0]]);

// Titles that are only dots are ignored
assert.deepEqual(parseSourcePick('{"pages": [3], "general": ".."}', results), [results[2]]);

// Valid numbers are kept from a mix; repeats and non-integers are dropped
assert.deepEqual(parseSourcePick('{"pages": [3, 15, 1.5, 3, 1]}', results), [results[2], results[0]]);

// Titles are encoded so they stay one path segment on grokipedia.com
assert.equal(grokipediaPageUrl("AC/DC?"), "https://grokipedia.com/page/AC%2FDC%3F");

console.log("source-pick tests passed");
