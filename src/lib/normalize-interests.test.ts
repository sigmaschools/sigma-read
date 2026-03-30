import assert from "node:assert/strict";
import { normalizeInterestProfile } from "./normalize-interests";

// ─── Test: Already correct shape ────────────────────────────────────────────
{
  const result = normalizeInterestProfile({
    primary_interests: ["space", "dinosaurs"],
    secondary_interests: ["cooking"],
    notes: "loves rockets",
  });
  assert.deepStrictEqual(result, {
    primary_interests: ["space", "dinosaurs"],
    secondary_interests: ["cooking"],
    notes: "loves rockets",
  });
  console.log("✅ Already correct shape");
}

// ─── Test: Correct shape without notes ──────────────────────────────────────
{
  const result = normalizeInterestProfile({
    primary_interests: ["soccer"],
    secondary_interests: ["art"],
  });
  assert.deepStrictEqual(result, {
    primary_interests: ["soccer"],
    secondary_interests: ["art"],
  });
  console.log("✅ Correct shape without notes (no notes key added)");
}

// ─── Test: topics/categories format (Max's profile) ─────────────────────────
{
  const result = normalizeInterestProfile({
    topics: ["StarCraft", "airsoft", "SpaceX", "firefighting", "fire suppression systems", "paramedics"],
    categories: ["gaming", "tactical sports", "space exploration", "emergency services"],
  });
  assert.deepStrictEqual(result, {
    primary_interests: ["StarCraft", "airsoft", "SpaceX", "firefighting", "fire suppression systems", "paramedics"],
    secondary_interests: ["gaming", "tactical sports", "space exploration", "emergency services"],
  });
  console.log("✅ topics/categories format (Max's profile)");
}

// ─── Test: Flat array — 5 or fewer all go to primary ────────────────────────
{
  const result = normalizeInterestProfile(["space", "robots", "dogs"]);
  assert.deepStrictEqual(result, {
    primary_interests: ["space", "robots", "dogs"],
    secondary_interests: [],
  });
  console.log("✅ Flat array (≤5 items)");
}

// ─── Test: Flat array — more than 5, overflow to secondary ──────────────────
{
  const result = normalizeInterestProfile(["a", "b", "c", "d", "e", "f", "g"]);
  assert.deepStrictEqual(result, {
    primary_interests: ["a", "b", "c", "d", "e"],
    secondary_interests: ["f", "g"],
  });
  console.log("✅ Flat array (>5 items splits at 5)");
}

// ─── Test: Unknown object with string arrays ────────────────────────────────
{
  const result = normalizeInterestProfile({
    hobbies: ["painting", "chess"],
    subjects: ["math", "science"],
    age: 10, // non-array field, should be ignored
  });
  assert.deepStrictEqual(result, {
    primary_interests: ["painting", "chess", "math", "science"],
    secondary_interests: [],
  });
  console.log("✅ Unknown object with string arrays merged");
}

// ─── Test: null / undefined ─────────────────────────────────────────────────
{
  const result = normalizeInterestProfile(null);
  assert.deepStrictEqual(result, {
    primary_interests: [],
    secondary_interests: [],
  });
  console.log("✅ null returns empty profile");
}

{
  const result = normalizeInterestProfile(undefined);
  assert.deepStrictEqual(result, {
    primary_interests: [],
    secondary_interests: [],
  });
  console.log("✅ undefined returns empty profile");
}

// ─── Test: Empty object ─────────────────────────────────────────────────────
{
  const result = normalizeInterestProfile({});
  assert.deepStrictEqual(result, {
    primary_interests: [],
    secondary_interests: [],
  });
  console.log("✅ Empty object returns empty profile");
}

// ─── Test: String (unexpected primitive) ────────────────────────────────────
{
  const result = normalizeInterestProfile("just a string");
  assert.deepStrictEqual(result, {
    primary_interests: [],
    secondary_interests: [],
  });
  console.log("✅ String returns empty profile");
}

console.log("\n🎉 All tests passed!");
