import assert from "node:assert/strict";
import { profileFromNote, startingGrade } from "./compass-onboarding";

const student = (labels: string[], grade?: string) => ({
  id: "0b5e3c1a-2f4d-4e6a-9b7c-1d2e3f4a5b6c",
  name: "A test learner",
  grade,
  interests: labels.map((label) => ({ topic: label.toLowerCase(), label, words: [] })),
});

{
  assert.deepEqual(profileFromNote(student(["Volcanoes", "Soccer", "Drawing"]))?.interests, ["Volcanoes", "Soccer", "Drawing"]);
  assert.equal(profileFromNote(student(["Volcanoes", "Soccer"])), null, "fewer than three: the chat still runs");
  assert.equal(profileFromNote(student(["Volcanoes", "volcanoes", "Soccer"])), null, "duplicates do not count twice");
  assert.equal(profileFromNote({ id: "x", name: "y" }), null, "no interests at all");
  console.log("✅ profileFromNote");
}

{
  assert.equal(startingGrade(4, student([], "5")), 4, "SigmaRead's own grade wins");
  assert.equal(startingGrade(null, student([], "5")), 5);
  assert.equal(startingGrade(null, student([])), null);
  console.log("✅ startingGrade");
}
