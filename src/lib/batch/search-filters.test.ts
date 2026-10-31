import assert from "node:assert";
import { isIndexPage, isOlderThan } from "./search-filters";

assert.ok(isIndexPage("https://newsforkids.net/tag/space/"));
assert.ok(isIndexPage("https://example.com/category/science"));
assert.ok(isIndexPage("https://example.com/"));
assert.ok(isIndexPage("not a url"));
assert.ok(!isIndexPage("https://newsforkids.net/articles/2026/07/08/rush-mission-to-rescue-a-space-telescope/"));
assert.ok(!isIndexPage("https://www.britannica.com/topic/octopus"), "Britannica topic pages are articles");
assert.ok(isIndexPage("https://example.com/news/page/2"));
assert.ok(isIndexPage("https://example.com/topics"));
assert.ok(!isIndexPage("https://www.sciencealert.com/the-amazing-camouflage-of-the-octopus"));
console.log("✅ index pages are skipped, articles are kept");

const now = Date.parse("2026-10-31T12:00:00Z");
assert.ok(isOlderThan("July 8, 2026", 7, now));
assert.ok(!isOlderThan("2026-10-29", 7, now));
assert.ok(!isOlderThan(null, 7, now), "unknown dates pass");
assert.ok(!isOlderThan("3 days ago", 7, now), "unparseable dates pass");
console.log("✅ recency filter drops only known-old pages");
