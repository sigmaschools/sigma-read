import assert from "node:assert/strict";
import { stripMarkdown } from "./plain-text";

assert.equal(stripMarkdown("You thought about *why* and **you** did it"), "You thought about why and you did it");
assert.equal(stripMarkdown("***Big*** idea"), "Big idea");
assert.equal(stripMarkdown("So _that_ is it, snake_case stays"), "So that is it, snake_case stays");
assert.equal(stripMarkdown("What you did well\n* a point\n- another"), "What you did well\na point\nanother");
assert.equal(stripMarkdown("Header\n\n- point"), "Header\n\npoint");
assert.equal(stripMarkdown("Try next time\nAdd one more reason."), "Try next time\nAdd one more reason.");
console.log("✅ stripMarkdown leaves plain text");
