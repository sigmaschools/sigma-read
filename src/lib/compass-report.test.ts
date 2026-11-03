import assert from "node:assert/strict";
import { levelToLexile, buildLevelReport, buildComprehensionReport, reportJson } from "./compass-report";

assert.deepEqual([1, 2, 3, 4, 5, 6].map(levelToLexile), [450, 600, 750, 900, 1050, 1200]);
assert.equal(levelToLexile(0), 450);
assert.equal(levelToLexile(9), 1200);
console.log("✅ levels map to Lexile band midpoints");

const created = new Date("2026-10-01T15:00:00Z");

// No changes: current level since the student was created, empty history
const fresh = buildLevelReport({ currentLevel: 3, firstSetAt: created, changes: [] });
assert.equal(fresh.kind, "level");
assert.equal(fresh.value, 750);
assert.equal(fresh.setAt, "2026-10-01T15:00:00.000Z");
assert.deepEqual(fresh.history, []);
console.log("✅ no history: empty list, setAt is the first time");

// Two changes, given out of order: history is oldest first and excludes the current level
const moved = buildLevelReport({
  currentLevel: 3,
  firstSetAt: created,
  changes: [
    { fromLevel: 4, toLevel: 3, changedAt: new Date("2026-10-20T10:00:00Z") },
    { fromLevel: 3, toLevel: 4, changedAt: new Date("2026-10-10T10:00:00Z") },
  ],
});
assert.equal(moved.value, 750);
assert.equal(moved.setAt, "2026-10-20T10:00:00.000Z");
assert.deepEqual(moved.history, [
  { value: 750, setAt: "2026-10-01T15:00:00.000Z" },
  { value: 900, setAt: "2026-10-10T10:00:00.000Z" },
]);
console.log("✅ history oldest first, current level left out");

// Field names are what Compass parses
assert.deepEqual(Object.keys(moved).sort(), ["appVersion", "history", "kind", "setAt", "value"]);

const report = buildComprehensionReport({
  articleTitle: "The Seawall",
  articleText: "One two  three\nfour",
  articleLevel: 4,
  score: 82,
  skills: { main_idea: "shown" },
  selfAssessment: null,
  finishedAt: new Date("2026-11-03T12:00:00Z"),
  levelBefore: 3,
  levelAfter: 3,
  currentLevel: 4,
});
assert.equal(report.kind, "comprehension");
assert.equal(report.words, 4);
assert.equal(report.articleLexile, 900);
assert.equal(report.levelBefore, 750);
assert.equal(report.levelAfter, 750);
assert.equal(report.finishedAt, "2026-11-03T12:00:00.000Z");
for (const k of ["article", "words", "overall", "skills", "selfRating", "finishedAt", "articleLexile", "levelBefore", "levelAfter"]) {
  assert.ok(k in report, `comprehension report has ${k}`);
}
console.log("✅ comprehension report carries the 0.1 fields and the level fields");

// Older reports without stored levels: before = after = current level
const old = buildComprehensionReport({
  articleTitle: "x", articleText: "", articleLevel: 2, score: 50, skills: null, selfAssessment: "lost",
  finishedAt: null, levelBefore: null, levelAfter: null, currentLevel: 2,
});
assert.equal(old.levelBefore, 600);
assert.equal(old.levelAfter, 600);
assert.deepEqual(old.skills, {});
console.log("✅ older reports fall back to the current level");

assert.equal(reportJson({ article: "</script><b>" }), '{"article":"\\u003c/script>\\u003cb>"}');
assert.deepEqual(JSON.parse(reportJson({ article: "</script>" })), { article: "</script>" });
console.log("✅ report JSON can't close its script tag");
