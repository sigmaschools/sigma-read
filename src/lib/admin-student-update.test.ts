import assert from "node:assert/strict";
import { parseStudentUpdate } from "./admin-student-update";

const ok = (body: unknown) => {
  const r = parseStudentUpdate(body);
  assert.ok(r.ok, `expected ok for ${JSON.stringify(body)}: ${!r.ok ? r.error : ""}`);
  return r.update;
};
const bad = (body: unknown) => assert.equal(parseStudentUpdate(body).ok, false, `expected error for ${JSON.stringify(body)}`);

assert.deepEqual(ok({ name: "  Ada  ", gradeLevel: 4 }), { name: "Ada", gradeLevel: 4 });
assert.deepEqual(ok({ weeklySessionTarget: null }), { weeklySessionTarget: null });
assert.deepEqual(ok({ age: "" }), { age: null });
assert.deepEqual(ok({ readingLevel: 3, dailyArticleCap: 5 }), { readingLevel: 3, dailyArticleCap: 5 });
console.log("✅ valid updates pass");

bad({});
bad(null);
bad([]);
bad({ name: "" });
bad({ readingLevel: 7 });
bad({ readingLevel: null });
bad({ readingLevel: 2.5 });
bad({ dailyArticleCap: 0 });
bad({ guideId: null });
bad({ gradeLevel: "4" });
console.log("✅ invalid updates rejected");

// Unknown keys are ignored, not written
assert.deepEqual(ok({ name: "Ada", passwordHash: "x", interestProfile: {} }), { name: "Ada" });
console.log("✅ unknown fields ignored");
