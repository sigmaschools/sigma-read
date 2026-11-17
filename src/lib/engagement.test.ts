import assert from "node:assert/strict";
import { localDate, weekOf, weeklyEngagement, type EngagementInput } from "./engagement";

const Z = "America/Chicago";

{
  // 03:00 UTC on Tuesday 17 Nov is still Monday evening in Central time
  assert.equal(localDate(new Date("2026-11-17T03:00:00Z"), Z), "2026-11-16");
  assert.equal(localDate(new Date("2026-11-17T07:00:00Z"), Z), "2026-11-17");
  assert.equal(weekOf("2026-11-16"), "2026-11-16", "Monday starts its own week");
  assert.equal(weekOf("2026-11-22"), "2026-11-16", "Sunday belongs to the week that began on Monday");
  assert.equal(weekOf("2026-11-23"), "2026-11-23");
  assert.equal(weekOf("2026-01-01"), "2025-12-29", "across a year boundary");
  console.log("✅ localDate, weekOf");
}

const at = (iso: string) => new Date(iso);
const s = (studentId: number, iso: string, extra: Partial<EngagementInput["sessions"][number]> = {}) =>
  ({ studentId, completedAt: at(iso), liked: null, score: null, selfAssessment: null, ...extra });

{
  // Student 1 (goal 3): Monday 3 pieces (goal met), Tuesday 1 piece. Student 2 (goal 2): Wednesday 2 pieces.
  const input: EngagementInput = {
    goals: new Map([[1, 3], [2, 2]]),
    sessions: [
      s(1, "2026-11-16T15:00:00Z", { liked: true, score: 62, selfAssessment: "pretty_well" }),
      s(1, "2026-11-16T15:20:00Z", { liked: true, score: 70, selfAssessment: "really_well" }),
      s(1, "2026-11-16T15:40:00Z", { liked: false, score: 80, selfAssessment: "pretty_well" }),
      s(1, "2026-11-17T15:00:00Z", { score: 50 }),
      s(2, "2026-11-18T15:00:00Z", { liked: true, score: 75 }),
      s(2, "2026-11-19T02:00:00Z", { liked: true, score: 90 }), // Wednesday 8 pm Central
      s(1, "2026-11-23T15:00:00Z", { liked: true, score: 65 }), // the next week
    ],
    favorites: [{ studentId: 1, createdAt: at("2026-11-16T15:45:00Z") }],
    lookups: [
      { studentId: 1, createdAt: at("2026-11-16T15:05:00Z") },
      { studentId: 1, createdAt: at("2026-11-16T15:06:00Z") },
      { studentId: 2, createdAt: at("2026-11-18T15:05:00Z") },
    ],
  };
  const weeks = weeklyEngagement(input, Z);
  assert.deepEqual(weeks.map(w => w.week), ["2026-11-16", "2026-11-23"], "oldest week first");
  const [w] = weeks;
  assert.equal(w.students, 2);
  assert.equal(w.pieces, 6);
  assert.equal(w.piecesPerStudent, 3);
  assert.equal(w.daysRead, 3, "student 1 read Monday and Tuesday, student 2 Wednesday");
  assert.equal(w.goalDays, 2, "student 1 on Monday and student 2 on Wednesday met their goals");
  assert.equal(w.goalRate, 2 / 3);
  assert.equal(w.liked, 4);
  assert.equal(w.disliked, 1);
  assert.equal(w.likeRate, 4 / 5, "pieces with no thumbs either way are left out of the rate");
  assert.equal(w.favorites, 1);
  assert.equal(w.favoriteRate, 1 / 2, "favorites per goal day");
  assert.deepEqual(w.selfAssessment, { really_well: 1, pretty_well: 2, not_sure: 0, lost: 0 });
  assert.equal(w.scored, 6);
  assert.equal(w.scoreMedian, 72.5);
  assert.equal(w.inTargetZone, 3 / 6, "62, 70 and 75 sit in 60 to 75");
  assert.equal(w.lookups, 3);
  assert.equal(w.lookupsPerPiece, 0.5);

  const [, next] = weeks;
  assert.equal(next.students, 1);
  assert.equal(next.goalDays, 0);
  assert.equal(next.goalRate, 0);
  assert.equal(next.likeRate, 1);
  assert.equal(next.favoriteRate, null, "no goal day, no favorite rate");
  assert.equal(next.lookups, 0);
  console.log("✅ weeklyEngagement");
}

{
  assert.deepEqual(weeklyEngagement({ goals: new Map(), sessions: [], favorites: [], lookups: [] }, Z), []);
  // A lookup in a week with no finished piece still shows the week, with no per-piece rate
  const weeks = weeklyEngagement({ goals: new Map(), sessions: [], favorites: [], lookups: [{ studentId: 1, createdAt: at("2026-11-17T15:00:00Z") }] }, Z);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].lookups, 1);
  assert.equal(weeks[0].lookupsPerPiece, null);
  assert.equal(weeks[0].goalRate, null);
  assert.equal(weeks[0].scoreMedian, null);
  // A student with no goal on record uses the default of three
  const one = weeklyEngagement({ goals: new Map(), sessions: [s(9, "2026-11-17T15:00:00Z"), s(9, "2026-11-17T16:00:00Z"), s(9, "2026-11-17T17:00:00Z")], favorites: [], lookups: [] }, Z);
  assert.equal(one[0].goalDays, 1);
  console.log("✅ weeklyEngagement edges");
}
