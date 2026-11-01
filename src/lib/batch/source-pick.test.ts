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

console.log("source-pick tests passed");
