import assert from "node:assert/strict";
import { parseStudentUpdate } from "./admin-student-update";

const ok = (body: unknown) => {
  const r = parseStudentUpdate(body);
  assert.ok(r.ok, `expected ok for ${JSON.stringify(body)}: ${!r.ok ? r.error : ""}`);
  return r.update;
};
const bad = (body: unknown) => assert.equal(parseStudentUpdate(body).ok, false, `expected error for ${JSON.stringify(body)}`);

assert.deepEqual(ok({ readingLevel: 3, dailyArticleCap: 5 }), { readingLevel: 3, dailyArticleCap: 5 });
assert.deepEqual(ok({ dailyArticleCap: 8 }), { dailyArticleCap: 8 });
console.log("✅ valid updates pass");

bad({});
bad(null);
bad([]);
bad({ readingLevel: 7 });
bad({ readingLevel: null });
bad({ readingLevel: 2.5 });
bad({ dailyArticleCap: 0 });
bad({ dailyArticleCap: null });
console.log("✅ invalid updates rejected");

// Unknown keys are ignored, not written. Who the student is comes from Compass: name, grade, guide and the Compass id are not editable here
assert.deepEqual(ok({ readingLevel: 2, name: "Ada", gradeLevel: 4, guideId: 2, externalId: "x", passwordHash: "x", interestProfile: {} }), { readingLevel: 2 });
bad({ name: "Ada" });
bad({ externalId: "cmp-123" });
console.log("✅ unknown and Compass-owned fields ignored");
