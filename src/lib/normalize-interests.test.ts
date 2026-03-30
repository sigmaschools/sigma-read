import assert from "node:assert/strict";
import { normalizeInterestProfile } from "./normalize-interests";

// ─── Test: Already correct shape ────────────────────────────────────────────
{
  const result = normalizeInterestProfile({
    interests: ["space", "dinosaurs", "cooking"],
  });
  assert.deepStrictEqual(result, {
    interests: ["space", "dinosaurs", "cooking"],
  });
  console.log("✅ Already correct shape");
}

// ─── Test: Legacy primary_interests + secondary_interests ───────────────────
{
  const result = normalizeInterestProfile({
    primary_interests: ["soccer"],
    secondary_interests: ["art"],
  });
  assert.deepStrictEqual(result, {
    interests: ["soccer", "art"],
  });
  console.log("✅ Legacy primary + secondary merged");
}

// ─── Test: Legacy with notes (notes dropped) ───────────────────────────────
{
  const result = normalizeInterestProfile({
    primary_interests: ["space", "dinosaurs"],
    secondary_interests: ["cooking"],
    notes: "loves rockets",
  });
  assert.deepStrictEqual(result, {
    interests: ["space", "dinosaurs", "cooking"],
  });
  console.log("✅ Legacy with notes — notes dropped");
}

// ─── Test: Deduplicates when merging primary + secondary (case-insensitive) ─
{
  const result = normalizeInterestProfile({
    primary_interests: ["Space", "dinosaurs"],
    secondary_interests: ["space", "cooking"],
  });
  assert.deepStrictEqual(result, {
    interests: ["Space", "dinosaurs", "cooking"],
  });
  console.log("✅ Deduplicates primary + secondary (case-insensitive, first wins)");
}

// ─── Test: topics/categories format (Max's profile) ─────────────────────────
{
  const result = normalizeInterestProfile({
    topics: ["StarCraft", "airsoft", "SpaceX", "firefighting", "fire suppression systems", "paramedics"],
    categories: ["gaming", "tactical sports", "space exploration", "emergency services"],
  });
  assert.deepStrictEqual(result, {
    interests: ["StarCraft", "airsoft", "SpaceX", "firefighting", "fire suppression systems", "paramedics", "gaming", "tactical sports", "space exploration", "emergency services"],
  });
  console.log("✅ topics/categories format (Max's profile)");
}

// ─── Test: Flat array ───────────────────────────────────────────────────────
{
  const result = normalizeInterestProfile(["space", "robots", "dogs"]);
  assert.deepStrictEqual(result, {
    interests: ["space", "robots", "dogs"],
  });
  console.log("✅ Flat array");
}

// ─── Test: Flat array with duplicates ───────────────────────────────────────
{
  const result = normalizeInterestProfile(["space", "Space", "dogs", "DOGS"]);
  assert.deepStrictEqual(result, {
    interests: ["space", "dogs"],
  });
  console.log("✅ Flat array deduplicates");
}

// ─── Test: Unknown object with string arrays ────────────────────────────────
{
  const result = normalizeInterestProfile({
    hobbies: ["painting", "chess"],
    subjects: ["math", "science"],
    age: 10, // non-array field, should be ignored
  });
  assert.deepStrictEqual(result, {
    interests: ["painting", "chess", "math", "science"],
  });
  console.log("✅ Unknown object with string arrays merged");
}

// ─── Test: null / undefined ─────────────────────────────────────────────────
{
  const result = normalizeInterestProfile(null);
  assert.deepStrictEqual(result, { interests: [] });
  console.log("✅ null returns empty profile");
}

{
  const result = normalizeInterestProfile(undefined);
  assert.deepStrictEqual(result, { interests: [] });
  console.log("✅ undefined returns empty profile");
}

// ─── Test: Empty object ─────────────────────────────────────────────────────
{
  const result = normalizeInterestProfile({});
  assert.deepStrictEqual(result, { interests: [] });
  console.log("✅ Empty object returns empty profile");
}

// ─── Test: String (unexpected primitive) ────────────────────────────────────
{
  const result = normalizeInterestProfile("just a string");
  assert.deepStrictEqual(result, { interests: [] });
  console.log("✅ String returns empty profile");
}

console.log("\n🎉 All tests passed!");
