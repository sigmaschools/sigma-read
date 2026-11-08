import assert from "node:assert/strict";
import { EXPLAINER_DOMAINS, KID_NEWS_DOMAINS, NEWS_DOMAINS, STORY_DOMAINS, isGrokipediaPagePath } from "./sources";

// Story searches cover the explainer and kids' news sites, each once
for (const d of [...EXPLAINER_DOMAINS, ...KID_NEWS_DOMAINS]) assert.ok(STORY_DOMAINS.includes(d), d);
assert.equal(new Set(STORY_DOMAINS).size, STORY_DOMAINS.length);

// Script templates caught by the link scan are not pages
assert.equal(isGrokipediaPagePath("/page/Engineering"), true);
assert.equal(isGrokipediaPagePath("/page/Tesla%2C_Inc."), true);
assert.equal(isGrokipediaPagePath("/page/Smoking_(cooking)"), true);
assert.equal(isGrokipediaPagePath("/page/C++"), true);
assert.equal(isGrokipediaPagePath("/page/Newton's_laws_of_motion"), true);
assert.equal(isGrokipediaPagePath("/page/' + encodeURIComponent(r.slug) + '"), false);

// Domain lists are bare hostnames (allowed_domains takes no scheme or path), with no repeats
for (const list of [KID_NEWS_DOMAINS, NEWS_DOMAINS, EXPLAINER_DOMAINS, STORY_DOMAINS]) {
  for (const d of list) assert.match(d, /^[a-z0-9.-]+\.[a-z]+$/, d);
  assert.equal(new Set(list).size, list.length);
}
// Kid news sites are searched first, and stay in the wider news list
for (const d of KID_NEWS_DOMAINS) assert.ok(NEWS_DOMAINS.includes(d));
assert.ok(!NEWS_DOMAINS.includes("newsela.com"));

console.log("sources: ok");
