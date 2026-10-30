import assert from "node:assert/strict";
import { skillSummary } from "./skills";

const r = (main_idea: string, inference = "not_tested") => ({
  skills: { main_idea, key_details: "not_tested", vocabulary: "not_tested", inference, connection: "not_tested" },
});

{
  const { rows, reports } = skillSummary([r("shown", "partly"), r("not_shown"), { skills: null }, r("partly", "shown")]);
  assert.equal(reports, 3, "reports without skills are skipped");
  const main = rows.find(x => x.skill === "main_idea")!;
  assert.deepEqual([main.tested, main.shown, main.partly, main.notShown], [3, 1, 1, 1]);
  const inf = rows.find(x => x.skill === "inference")!;
  assert.deepEqual([inf.tested, inf.shown, inf.partly], [2, 1, 1]);
  assert.equal(rows.find(x => x.skill === "vocabulary")!.tested, 0);
  console.log("✅ skillSummary tallies tested skills only");
}

{
  const many = Array.from({ length: 15 }, (_, i) => r(i < 10 ? "shown" : "not_shown"));
  const { rows, reports } = skillSummary(many);
  assert.equal(reports, 10);
  assert.equal(rows[0].shown, 10, "only the newest 10 count");
  console.log("✅ skillSummary uses the newest reports");
}
