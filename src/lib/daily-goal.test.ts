import assert from "node:assert/strict";
import { DEFAULT_DAILY_GOAL, dailyGoalOf, effectiveDailyCap, goalFromNote } from "./daily-goal";

const note = (goal?: unknown) => ({ id: "0b5e3c1a-2f4d-4e6a-9b7c-1d2e3f4a5b6c", name: "A test learner", goal }) as never;

{
  assert.equal(goalFromNote(note({ subject: "Reading", targetXp: 30, unit: "exercise", rate: 10, units: 3 })), 3);
  assert.equal(goalFromNote(note({ subject: "Reading", targetXp: 20, unit: "exercise", rate: 10, units: 2 })), 2);
  assert.equal(goalFromNote(note({ subject: "Reading", targetXp: 50, unit: "exercise", rate: 10, units: 5 })), 5);
  assert.equal(goalFromNote(note()), null, "no goal in the note (an older Compass, or a subject with no target)");
  assert.equal(goalFromNote(note({ subject: "Reading", targetXp: 30 })), null, "no count in our unit");
  assert.equal(goalFromNote(note({ subject: "Reading", targetXp: 30, unit: "exercise", units: 0 })), null);
  assert.equal(goalFromNote(note({ subject: "Reading", targetXp: 30, unit: "exercise", units: 2.5 })), null);
  assert.equal(goalFromNote(note({ subject: "Reading", targetXp: 30, unit: "exercise", units: "3" })), null);
  assert.equal(goalFromNote(note({ subject: "Reading", targetXp: 900, unit: "exercise", units: 90 })), 20, "never more than a day can hold");
  assert.equal(goalFromNote(note("3")), null);
  console.log("✅ goalFromNote");
}

{
  assert.equal(DEFAULT_DAILY_GOAL, 3);
  assert.equal(dailyGoalOf({ dailyGoalArticles: null }), 3, "never told by Compass: three, as before");
  assert.equal(dailyGoalOf({ dailyGoalArticles: 2 }), 2);
  assert.equal(dailyGoalOf({ dailyGoalArticles: 0 }), 3);
  console.log("✅ dailyGoalOf");
}

{
  assert.equal(effectiveDailyCap({ dailyGoalArticles: null, dailyArticleCap: null }), 5);
  assert.equal(effectiveDailyCap({ dailyGoalArticles: 3, dailyArticleCap: 5 }), 5);
  assert.equal(effectiveDailyCap({ dailyGoalArticles: 7, dailyArticleCap: 5 }), 7, "the cap never stops a student short of the goal");
  console.log("✅ effectiveDailyCap");
}
