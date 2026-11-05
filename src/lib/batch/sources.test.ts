import assert from "node:assert/strict";
import { EXPLAINER_DOMAINS, KID_NEWS_DOMAINS, NEWS_DOMAINS, isGrokipediaPagePath, plansToRun, sourceOrder } from "./sources";

// Plans alternate their first source, and each tries both
assert.deepEqual(sourceOrder(0), ["explainers", "grokipedia"]);
assert.deepEqual(sourceOrder(1), ["grokipedia", "explainers"]);
assert.deepEqual(sourceOrder(2), sourceOrder(0));

// Script templates caught by the link scan are not pages
assert.equal(isGrokipediaPagePath("/page/Engineering"), true);
assert.equal(isGrokipediaPagePath("/page/Tesla%2C_Inc."), true);
assert.equal(isGrokipediaPagePath("/page/Smoking_(cooking)"), true);
assert.equal(isGrokipediaPagePath("/page/C++"), true);
assert.equal(isGrokipediaPagePath("/page/' + encodeURIComponent(r.slug) + '"), false);

// The 2026-11-05 batch: 3 interests + 1 horizon + 5 news candidates, target 5. All news
// candidates go in (they're fallbacks for one article), not just the first.
const plan = (type: "interest" | "news" | "horizon", query: string) => ({ type, query });
const day = [plan("interest", "a"), plan("interest", "b"), plan("interest", "c"), plan("horizon", "h"),
  plan("news", "n1"), plan("news", "n2"), plan("news", "n3"), plan("news", "n4"), plan("news", "n5")];
assert.deepEqual(plansToRun(day, 5, true).map(p => p.query), ["a", "b", "c", "h", "n1", "n2", "n3", "n4", "n5"]);
// A later run with 2 articles still to write keeps the news slot
assert.deepEqual(plansToRun(day, 2, true).map(p => p.query), ["a", "n1", "n2", "n3", "n4", "n5"]);
// One left and no news yet: the slot is news
assert.deepEqual(plansToRun(day, 1, true).map(p => p.query), ["n1", "n2", "n3", "n4", "n5"]);
// News already written today: topics only
assert.deepEqual(plansToRun(day, 2, false).map(p => p.query), ["a", "b"]);
assert.deepEqual(plansToRun(day, 0, true), []);

// Domain lists are bare hostnames (allowed_domains takes no scheme or path), with no repeats
for (const list of [KID_NEWS_DOMAINS, NEWS_DOMAINS, EXPLAINER_DOMAINS]) {
  for (const d of list) assert.match(d, /^[a-z0-9.-]+\.[a-z]+$/, d);
  assert.equal(new Set(list).size, list.length);
}
// Kid news sites are searched first, and stay in the wider news list
for (const d of KID_NEWS_DOMAINS) assert.ok(NEWS_DOMAINS.includes(d));
assert.ok(!NEWS_DOMAINS.includes("newsela.com"));

console.log("sources: ok");
