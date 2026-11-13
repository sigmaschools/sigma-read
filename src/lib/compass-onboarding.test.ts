import assert from "node:assert/strict";
import { personChanges, personFromNote, profileFromNote, startingGrade } from "./compass-onboarding";

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
  assert.equal(startingGrade(4, student([], "5")), 5, "Compass owns the grade, so its grade wins");
  assert.equal(startingGrade(null, student([], "5")), 5);
  assert.equal(startingGrade(4, student([])), 4, "a note without a grade keeps the one on the row");
  assert.equal(startingGrade(null, student([])), null);
  console.log("✅ startingGrade");
}

{
  // Who the student is comes from the note: the row keeps the name and grade as the note last gave them
  assert.deepEqual(personFromNote(student([], "5")), { name: "A test learner", gradeLevel: 5 });
  assert.deepEqual(personFromNote({ id: "x", name: "  Ada  " }), { name: "Ada", gradeLevel: null });
  assert.deepEqual(personFromNote({ id: "x", name: "K".repeat(300), grade: "K" }), { name: "K".repeat(100), gradeLevel: 0 });
  assert.deepEqual(personFromNote({ id: "x", name: "" }), { name: "Student", gradeLevel: null }, "a note with no usable name still makes a row");
  assert.deepEqual(personFromNote({ id: "x", name: 7 as unknown as string }), { name: "Student", gradeLevel: null });
  console.log("✅ personFromNote");
}

{
  const row = { name: "Ada", gradeLevel: 4 };
  assert.deepEqual(personChanges(row, { id: "x", name: "Ada", grade: "4" }), null, "nothing to write when nothing changed");
  assert.deepEqual(personChanges(row, { id: "x", name: "Ada L", grade: "5" }), { name: "Ada L", gradeLevel: 5 });
  assert.deepEqual(personChanges(row, { id: "x", name: "Ada" }), null, "a note without a grade does not clear the grade");
  assert.deepEqual(personChanges(row, { id: "x", name: "" }), null, "a note without a name does not rename the student");
  console.log("✅ personChanges");
}
