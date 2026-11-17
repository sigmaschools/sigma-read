import assert from "node:assert/strict";
import { nextStructure, parseStructure, structureLine, TEXT_STRUCTURES } from "./text-structure";
import { adaptPrompt, knowledgePrompt, parseRewrite, rewritePrompt, type SourcedTopic } from "./article-writer";

{
  assert.equal(parseStructure("cause_effect"), "cause_effect");
  assert.equal(parseStructure("Cause and effect"), "cause_effect");
  assert.equal(parseStructure("compare-contrast"), "compare_contrast");
  assert.equal(parseStructure(" Sequence "), "sequence");
  assert.equal(parseStructure("compare/contrast"), "compare_contrast");
  assert.equal(parseStructure("Cause & effect"), "cause_effect");
  assert.equal(parseStructure("narrative"), null);
  assert.equal(parseStructure(3), null);
  console.log("✅ parseStructure");
}

{
  assert.equal(nextStructure([]), "sequence", "nothing recent: the first in the list");
  assert.equal(nextStructure([null, null]), "sequence", "untracked articles don't count");
  assert.equal(nextStructure(["sequence"]), "cause_effect");
  assert.equal(nextStructure(["cause_effect", "sequence"]), "problem_solution");
  // Every structure once: the one used longest ago
  const all = TEXT_STRUCTURES.map(s => s.id);
  assert.equal(nextStructure(["sequence", ...all.filter(s => s !== "sequence")]), "description");
  assert.equal(nextStructure(["description", "sequence", "sequence"]), "cause_effect", "least used wins");
  assert.equal(nextStructure([null, "sequence"]), "cause_effect", "only the newest article's own structure is excluded");
  // Twenty articles in a row cover all five, four times each
  const made: string[] = [];
  for (let i = 0; i < 20; i++) made.unshift(nextStructure(made.slice(0, 10)));
  for (const id of all) assert.equal(made.filter(s => s === id).length, 4, `${id} four times in twenty`);
  console.log("✅ nextStructure rotates through all five");
}

{
  const topic: SourcedTopic = { query: "volcanoes", type: "interest", sourceUrl: "https://example.org", sourceText: "Lava." };
  assert.match(rewritePrompt({ ...topic, structure: "problem_solution" }), /HOW IT IS ORGANIZED: Set out a real problem/);
  assert.match(knowledgePrompt({ ...topic, sourceUrl: null, structure: "sequence" }), /HOW IT IS ORGANIZED: Tell it in time order/);
  assert.doesNotMatch(rewritePrompt(topic), /HOW IT IS ORGANIZED/, "no structure asked: the prompt is as before");
  assert.match(rewritePrompt(topic), /"structure":/, "the writer always says which structure it used");
  assert.match(adaptPrompt("T", "Body.", 2), /same order/, "adaptations keep the base article's organization");
  assert.equal(structureLine(undefined), "");

  const raw = `[ARTICLE]\n{"title":"T","topic":"x","body":"First, lava.","structure":"Sequence","estimated_read_time_minutes":3}`;
  assert.equal(parseRewrite(raw, topic)?.textStructure, "sequence");
  assert.equal(parseRewrite(`{"title":"T","body":"B"}`, topic)?.textStructure, null);
  console.log("✅ writer prompts ask for the structure and the answer is kept");
}
