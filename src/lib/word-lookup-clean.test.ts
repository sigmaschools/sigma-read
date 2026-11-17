import assert from "node:assert/strict";
import { cleanLookup } from "./word-lookup-clean";

{
  assert.deepEqual(cleanLookup("Reluctant,", "The cat was  reluctant\nto move."), { word: "reluctant", sentence: "The cat was reluctant to move." });
  assert.deepEqual(cleanLookup("don't", ""), { word: "don't", sentence: null });
  assert.deepEqual(cleanLookup("'well-known'", undefined), { word: "well-known", sentence: null });
  assert.deepEqual(cleanLookup("Café.", ""), { word: "café", sentence: null }, "accented letters are kept");
  assert.deepEqual(cleanLookup("cafe\u0301", ""), { word: "caf\u00e9", sentence: null }, "a decomposed accent is kept");
  assert.deepEqual(cleanLookup("don\u2019t", ""), { word: "don't", sentence: null }, "a curly apostrophe is a plain one");
  assert.equal(cleanLookup("", "x"), null);
  assert.equal(cleanLookup("123", "x"), null);
  assert.equal(cleanLookup(42, "x"), null);
  assert.equal(cleanLookup("a".repeat(80), "")?.word.length, 60);
  assert.equal(cleanLookup("word", "s".repeat(900))?.sentence?.length, 500);
  console.log("✅ cleanLookup");
}
