/**
 * What the interest code does when Compass can't be reached: every call the morning batch, the
 * feed, the tutor and the end-of-day screen make must answer (with nothing, or the profile)
 * without throwing or waiting long. Run against a scratch database, never production:
 *
 *   DATABASE_URL=... COMPASS_URL=http://127.0.0.1:9 COMPASS_INTERESTS_KEY=unused \
 *     npx tsx --require ./scripts/md-require.cjs scripts/interest-outage-check.ts <studentId> <articleCacheId>
 *
 * The student must be linked to Compass (external_id) and have an interest profile.
 * NEON_FETCH_ENDPOINT points the database client at a local stand-in when there is one.
 */
import assert from "node:assert/strict";
import { neon, neonConfig } from "@neondatabase/serverless";

if (process.env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;

async function main() {
  const studentId = Number(process.argv[2]);
  const cacheId = Number(process.argv[3]);
  assert.ok(studentId > 0 && cacheId > 0, "usage: interest-outage-check.ts <studentId> <articleCacheId>");
  assert.ok(process.env.COMPASS_URL && process.env.COMPASS_INTERESTS_KEY, "set COMPASS_URL to somewhere unreachable");
  const sql = neon(process.env.DATABASE_URL!);
  const g = await import("../src/lib/interest-graph");
  const { normalizeInterestProfile } = await import("../src/lib/normalize-interests");

  const [student] = await sql`SELECT interest_profile, external_id FROM students WHERE id = ${studentId}`;
  const profile = normalizeInterestProfile(student.interest_profile).interests;
  assert.ok(student.external_id && profile.length > 0, "the student needs a Compass link and a profile");

  const started = Date.now();
  const step = async <T>(name: string, work: () => Promise<T>, check: (v: T) => void) => {
    const t = Date.now();
    const v = await work();
    check(v);
    console.log(`✅ ${name} (${Date.now() - t} ms)`);
  };

  await step("batch: nothing prefetched", () => g.prefetchInterests([studentId]), n => assert.equal(n, 0));
  await step("batch: plans from the profile", () => g.batchInterestsFor(studentId, profile), v => assert.deepEqual(v, profile));
  await step("batch: no horizon topic from the map", () => g.horizonTopicsFor(studentId), v => assert.deepEqual(v, []));
  await step("feed: no affinities", () => g.getAffinities(studentId), v => assert.deepEqual(v, []));
  await step("feed: scoring falls back (unranked)", () => g.feedScoring(studentId, [{ id: cacheId, topics: ["sharks"] }], new Map()), v => assert.ok(v instanceof Map && v.size === 0));
  await step("tutor: no interest line", () => g.tutorInterestContext(studentId), v => assert.equal(v, null));
  await step("end of day: no check-in asked", () => g.checkinFor(studentId), v => assert.deepEqual(v, []));
  await step("end of day: a check-in answer doesn't throw", () => g.saveCheckin(studentId, [{ slug: "sharks", answer: "keep" }]), () => {});
  await step("admin panel: says Compass can't answer", () => g.interestSummaryFor(studentId), v => assert.equal(v.source, "unavailable"));
  await step("admin panel: a remove is not confirmed", () => g.setTopicRemoved(studentId, "sharks", true, { role: "admin", userId: 0 }), v => assert.equal(v, false));
  await step("phrases still match, on the bundled map", () => g.resolveTopics(["great whites", "Lego", "zzz nothing"]), v => {
    assert.equal(v.get("great whites"), "sharks");
    assert.ok(v.get("Lego"));
    assert.equal(v.get("zzz nothing") ?? null, null);
  });
  await step("an article is still tagged", async () => {
    await g.tagCacheArticle(cacheId, ["great whites"]);
    return g.topicsForCache([cacheId]);
  }, v => assert.deepEqual(v.get(cacheId), ["sharks"]));
  await step("older articles are still tagged", () => g.tagUntaggedCache(50), n => assert.ok(n >= 0));
  await step("a signal is dropped without an error", () => g.recordSignals([{ studentId, type: "liked", topicSlug: "sharks", sourceRef: "outage-check:1" }]), () => {});
  await step("the morning re-send sends nothing", () => g.resendReadingState([studentId]), n => assert.equal(n, 0));

  const took = Date.now() - started;
  assert.ok(took < 30_000, `took ${took} ms`);
  console.log(`All interest calls answered without Compass, in ${took} ms`);
}

main().catch(e => { console.error(e); process.exit(1); });
