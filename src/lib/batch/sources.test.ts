import assert from "node:assert/strict";
import { EXPLAINER_DOMAINS, KID_NEWS_DOMAINS, NEWS_DOMAINS, isGrokipediaPagePath, sourceOrder } from "./sources";

// Plans alternate their first source, and each tries both
assert.deepEqual(sourceOrder(0), ["explainers", "grokipedia"]);
assert.deepEqual(sourceOrder(1), ["grokipedia", "explainers"]);
assert.deepEqual(sourceOrder(2), sourceOrder(0));

// Script templates caught by the link scan are not pages
assert.equal(isGrokipediaPagePath("/page/Engineering"), true);
assert.equal(isGrokipediaPagePath("/page/Tesla%2C_Inc."), true);
assert.equal(isGrokipediaPagePath("/page/Smoking_(cooking)"), true);
assert.equal(isGrokipediaPagePath("/page/' + encodeURIComponent(r.slug) + '"), false);

// Domain lists are bare hostnames (allowed_domains takes no scheme or path), with no repeats
for (const list of [KID_NEWS_DOMAINS, NEWS_DOMAINS, EXPLAINER_DOMAINS]) {
  for (const d of list) assert.match(d, /^[a-z0-9.-]+\.[a-z]+$/, d);
  assert.equal(new Set(list).size, list.length);
}
// Kid news sites are searched first, and stay in the wider news list
for (const d of KID_NEWS_DOMAINS) assert.ok(NEWS_DOMAINS.includes(d));
assert.ok(!NEWS_DOMAINS.includes("newsela.com"));

console.log("sources: ok");
