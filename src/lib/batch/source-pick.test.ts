import assert from "node:assert/strict";
import { parseSourcePick } from "./source-pick";

const results = [
  { title: "Girls games", url: "https://grokipedia.com/page/Girls_games" },
  { title: "Panhellenic Games", url: "https://grokipedia.com/page/Panhellenic_Games" },
  { title: "Soccer", url: "https://grokipedia.com/page/Soccer" },
];

// Picks keep the model's order
assert.deepEqual(parseSourcePick('{"pages": [3, 1]}', results), [results[2], results[0]]);
assert.deepEqual(parseSourcePick('Sure: {"pages": [1]}', results), [results[0]]);

// None fit
assert.deepEqual(parseSourcePick('{"pages": []}', results), []);

// Unreadable or out-of-range replies keep the search order (null)
assert.equal(parseSourcePick("I think page 3", results), null);
assert.equal(parseSourcePick('{"pages": [15]}', results), null);
assert.equal(parseSourcePick('{"pages": "3"}', results), null);
assert.equal(parseSourcePick('{"pages": [3,}', results), null);

// A general page named in the old reply shape is ignored: no overview pages any more
assert.deepEqual(parseSourcePick('{"pages": [3], "general": "Soccer"}', results), [results[2]]);
assert.deepEqual(parseSourcePick('{"pages": [], "general": "Animal"}', []), []);
assert.equal(parseSourcePick('{"pages": [15], "general": "Video game"}', results), null);

// The old bare-array reply still works
assert.deepEqual(parseSourcePick("[3, 1]", results), [results[2], results[0]]);

// Valid numbers are kept from a mix; repeats and non-integers are dropped
assert.deepEqual(parseSourcePick('{"pages": [3, 15, 1.5, 3, 1]}', results), [results[2], results[0]]);

console.log("source-pick tests passed");
