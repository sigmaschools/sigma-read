import assert from "node:assert/strict";
import { ANGLES_PER_INTEREST, anglesPrompt, parseAngles } from "./story-angles";

// The prompt carries the interest in the kid's words, the rule against overviews, and recent titles to skip
const p = anglesPrompt("airsoft", "interest", ["The Science Behind Airsoft Pellets"]);
assert.ok(p.includes('"airsoft"'));
assert.ok(p.includes("Not an overview"));
assert.ok(p.includes("- The Science Behind Airsoft Pellets"));
assert.ok(p.includes(`${ANGLES_PER_INTEREST} specific stories`));
assert.ok(!p.includes("horizon article"));
assert.ok(anglesPrompt("airsoft", "horizon", []).includes("NEXT TO"));
assert.ok(anglesPrompt("airsoft", "interest", []).includes("(none yet)"));

// A good reply: trimmed, at most ANGLES_PER_INTEREST
const reply = `{"angles": [
  {"angle": " How a hop-up makes a BB curve upward ", "query": "airsoft hop-up backspin", "why": "A tiny rubber nub doubles the range."},
  {"angle": "The spring piston inside", "query": "airsoft spring piston physics", "why": "Stored energy in a coil."},
  {"angle": "Japan's gun ban started a sport", "query": "airsoft history Japan 1970s", "why": "A law created a hobby."},
  {"angle": "A fourth one", "query": "extra", "why": "dropped"}
]}`;
const angles = parseAngles(reply)!;
assert.equal(angles.length, ANGLES_PER_INTEREST);
assert.equal(angles[0].angle, "How a hop-up makes a BB curve upward");
assert.equal(angles[0].query, "airsoft hop-up backspin");

// Entries without an angle or a query are dropped; "why" is optional
assert.deepEqual(parseAngles('{"angles": [{"angle": "x", "query": "y"}, {"angle": "", "query": "z", "why": "w"}, {"query": "only"}]}'),
  [{ angle: "x", query: "y", why: "" }]);

// Unreadable or empty replies are null, so the caller falls back to the interest itself
assert.equal(parseAngles("no json here"), null);
assert.equal(parseAngles('{"angles": []}'), null);
assert.equal(parseAngles('{"angles": "nope"}'), null);
assert.equal(parseAngles('{"angles": [{"angle": 1}]}'), null);

console.log("story-angles tests passed");
