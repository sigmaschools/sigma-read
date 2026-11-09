import assert from "node:assert";
import { pickServing } from "./serve-picks";

const row = (id: number) => ({ id });
const firstN = <T,>(rest: T[], n: number) => rest.slice(0, n);
const ids = (rows: { id: number }[]) => rows.map(r => r.id);

{
  // Full buffer: the own stories are still served, nothing else is
  const own = [row(101), row(102)];
  const candidates = [...own, row(1), row(2), row(3)];
  const picked = pickServing({ own, candidates, needed: 0, max: 3, excluded: new Set(), fill: firstN });
  assert.deepStrictEqual(ids(picked), [101, 102]);
  console.log("✅ own stories are served when the buffer is full");
}

{
  // The own stories count toward the buffer target and come first
  const own = [row(101)];
  const candidates = [row(1), row(101), row(2), row(3)];
  const picked = pickServing({ own, candidates, needed: 3, max: 3, excluded: new Set(), fill: firstN });
  assert.deepStrictEqual(ids(picked), [101, 1, 2]);
  console.log("✅ own stories count toward the buffer target, fill takes the rest");
}

{
  // At most `max` own stories are guaranteed; with a full buffer the fourth is not served
  const own = [row(101), row(102), row(103), row(104)];
  const candidates = [...own, row(1)];
  const picked = pickServing({ own, candidates, needed: 0, max: 3, excluded: new Set(), fill: firstN });
  assert.deepStrictEqual(ids(picked), [101, 102, 103]);
  console.log("✅ own stories are capped");
}

{
  // Beyond the cap, an own story competes in the fill like any other article
  const own = [row(101), row(102), row(103), row(104)];
  const candidates = [...own, row(1)];
  const picked = pickServing({ own, candidates, needed: 4, max: 3, excluded: new Set(), fill: firstN });
  assert.deepStrictEqual(ids(picked), [101, 102, 103, 104]);
  console.log("✅ own stories beyond the cap can still be picked by the fill");
}

{
  // A rejected own story (a repeat) frees its slot for the fill; excluded ids never come back
  const own = [row(101), row(102)];
  const candidates = [...own, row(1), row(2), row(3)];
  const picked = pickServing({ own, candidates, needed: 2, max: 3, excluded: new Set([101, 1]), fill: firstN });
  assert.deepStrictEqual(ids(picked), [102, 2]);
  console.log("✅ excluded own story is replaced by the fill");
}

{
  // The fill is not asked for zero (or fewer) articles
  const own = [row(101), row(102)];
  let calls = 0;
  const counting = <T,>(rest: T[], n: number) => { calls++; return rest.slice(0, n); };
  pickServing({ own, candidates: [...own, row(1)], needed: 0, max: 3, excluded: new Set(), fill: counting });
  pickServing({ own, candidates: [...own, row(1)], needed: 1, max: 3, excluded: new Set(), fill: counting });
  assert.strictEqual(calls, 0);
  console.log("✅ fill is skipped when the own stories cover the target");
}

{
  // No own stories: plain fill, as before
  const picked = pickServing({ own: [], candidates: [row(1), row(2)], needed: 5, max: 3, excluded: new Set(), fill: firstN });
  assert.deepStrictEqual(ids(picked), [1, 2]);
  console.log("✅ without own stories the fill serves as before");
}
