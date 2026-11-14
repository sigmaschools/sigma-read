/**
 * Compass's reading-level measure, as SigmaRead uses it (app contract section 17).
 * Run with: npx tsx src/lib/reading-level.test.ts
 */
import assert from "node:assert/strict";
import {
  displayLevel, fitsLevel, guidanceForLevel, landOnTarget, measureArticle, measureArticles, needsRewrite,
  resetReadingLevelState, storedLevel, targetForLevel, toMeasured, UNMEASURED, MEASURE_MAX_TEXTS, type Measured,
} from "./reading-level";
import { adaptPrompt, knowledgePrompt, revisePrompt, rewritePrompt, type SourcedTopic } from "./batch/article-writer";

const m = (over: Partial<Measured> = {}): Measured => ({ level: 900, modelVersion: "1", reliable: true, difference: 0, advice: [], ...over });
const realFetch = globalThis.fetch;
const savedEnv = { url: process.env.COMPASS_URL, key: process.env.COMPASS_INTERESTS_KEY };

function configure() {
  process.env.COMPASS_URL = "https://compass.example/";
  process.env.COMPASS_INTERESTS_KEY = "test-key"; // credential-check: allow
  resetReadingLevelState();
}
function answer(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function main() {
  // ─── Targets and display ────────────────────────────────────────────────────
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(targetForLevel), [450, 600, 750, 900, 1050, 1200]);
  assert.equal(targetForLevel(0), 450);
  assert.equal(targetForLevel(9), 1200);
  assert.equal(displayLevel(710), "710L (approximate)");
  assert.equal(fitsLevel(null, 3), null);
  assert.equal(fitsLevel(840, 3), true);
  assert.equal(fitsLevel(860, 3), false);
  console.log("✅ targets are the level midpoints; a level is always shown as approximate");

  // ─── What comes back from Compass ───────────────────────────────────────────
  assert.equal(toMeasured(undefined, "1"), null);
  assert.equal(toMeasured({ reliable: false }, "1"), null, "a text with no words has no level");
  assert.equal(toMeasured({ level: 700 }, ""), null, "a level is never kept without its model version");
  assert.deepEqual(
    toMeasured({ level: 912.4, reliable: true, target: { difference: 162, advice: ["Shorten the sentences.", "", 3] } }, "1"),
    { level: 912, modelVersion: "1", reliable: true, difference: 162, advice: ["Shorten the sentences."] },
  );
  assert.deepEqual(storedLevel(null), UNMEASURED);
  assert.deepEqual(storedLevel(m({ level: 880, reliable: false })), { measuredLevel: 880, levelModelVersion: "1", levelReliable: false });
  console.log("✅ results are kept with their model version; no level means unmeasured");

  // ─── When to rewrite ────────────────────────────────────────────────────────
  assert.equal(needsRewrite(null), false);
  assert.equal(needsRewrite(m({ difference: 149, advice: ["x"] })), false);
  assert.equal(needsRewrite(m({ difference: 150, advice: ["x"] })), true);
  assert.equal(needsRewrite(m({ difference: -200, advice: ["x"] })), true);
  assert.equal(needsRewrite(m({ difference: 300, advice: ["x"], reliable: false })), false, "never on an unreliable result");
  assert.equal(needsRewrite(m({ difference: 300, advice: [] })), false, "nothing to act on");
  assert.equal(needsRewrite(m({ difference: null, advice: ["x"] })), false);
  console.log("✅ a rewrite needs a reliable result 150L or more off, with advice");

  // ─── Write, measure, rewrite once ───────────────────────────────────────────
  const article = { title: "T", bodyText: "first" };
  const by = (levels: Record<string, Measured | null>) => async (text: string) => levels[text] ?? null;
  let rewrites = 0;
  const rewrite = async () => { rewrites++; return { title: "T", bodyText: "second" }; };

  let r = await landOnTarget({ level: 4, article, rewrite, measure: by({}) });
  assert.deepEqual([r.article.bodyText, r.measured, r.rewritten, rewrites], ["first", null, false, 0], "unmeasured goes out as written");

  r = await landOnTarget({ level: 4, article, rewrite, measure: by({ first: m({ level: 1000, difference: 100, advice: ["x"] }) }) });
  assert.deepEqual([r.article.bodyText, r.measured?.level, r.rewritten, rewrites], ["first", 1000, false, 0], "close enough is left alone");

  r = await landOnTarget({ level: 4, article, rewrite, measure: by({ first: m({ level: 1100, difference: 200, advice: ["x"] }), second: m({ level: 940, difference: 40 }) }) });
  assert.deepEqual([r.article.bodyText, r.measured?.level, r.rewritten, rewrites], ["second", 940, true, 1], "a closer rewrite is kept");

  r = await landOnTarget({ level: 4, article, rewrite, measure: by({ first: m({ level: 1100, difference: 200, advice: ["x"] }), second: m({ level: 650, difference: -250, advice: ["y"] }) }) });
  assert.deepEqual([r.article.bodyText, r.measured?.level, r.rewritten, rewrites], ["first", 1100, false, 2], "a rewrite that is further off is dropped, and there is no third try");

  r = await landOnTarget({ level: 4, article, rewrite, measure: by({ first: m({ level: 1100, difference: 200, advice: ["x"] }), second: m({ level: 900, difference: 0, reliable: false }) }) });
  assert.equal(r.article.bodyText, "first", "an unreliable second measurement can't show the rewrite is closer");

  r = await landOnTarget({ level: 4, article, rewrite, measure: by({ first: m({ level: 1100, difference: 200, advice: ["x"] }) }) });
  assert.deepEqual([r.article.bodyText, r.measured?.level], ["first", 1100], "a rewrite that can't be measured is dropped");

  r = await landOnTarget({ level: 4, article, rewrite: async () => null, measure: by({ first: m({ level: 1100, difference: 200, advice: ["x"] }) }) });
  assert.deepEqual([r.article.bodyText, r.rewritten], ["first", false], "a failed rewrite keeps the first");

  r = await landOnTarget({ level: 4, article, rewrite: async () => { throw new Error("writer down"); }, measure: by({ first: m({ level: 1100, difference: 200, advice: ["x"] }) }) });
  assert.deepEqual([r.article.bodyText, r.measured?.level], ["first", 1100], "a rewrite that throws keeps the first");
  console.log("✅ one rewrite at most, and the closer of the two is kept");

  // ─── Compass not configured, down or slow: null, never a throw ──────────────
  delete process.env.COMPASS_URL;
  delete process.env.COMPASS_INTERESTS_KEY;
  resetReadingLevelState();
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error("no network"); }) as typeof fetch;
  assert.equal(await measureArticle("Some text.", 4), null);
  assert.equal(await guidanceForLevel(4), null);
  assert.equal(calls, 0, "nothing is sent without the Compass settings");

  configure();
  assert.equal(await measureArticle("Some text.", 4), null);
  assert.deepEqual(await measureArticles([{ text: "a", level: 2 }, { text: "b", level: 3 }]), [null, null]);
  assert.equal(await guidanceForLevel(4), null);
  assert.equal(calls, 1, "after one failure the rest of the batch doesn't wait on Compass again");

  configure();
  calls = 0;
  globalThis.fetch = (async () => { calls++; return answer({ error: "boom" }, 503); }) as typeof fetch;
  assert.equal(await measureArticle("Some text.", 4), null);
  assert.equal(await measureArticle("Some text.", 4), null);
  assert.equal(calls, 1, "a 5xx also starts the pause");

  configure();
  globalThis.fetch = (async () => new Response("not json", { status: 200 })) as typeof fetch;
  assert.equal(await measureArticle("Some text.", 4), null, "an answer that isn't JSON is no answer");
  console.log("✅ no settings, an outage or a bad answer all mean unmeasured, never a failed batch");

  // ─── The calls themselves ───────────────────────────────────────────────────
  configure();
  const seen: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url: String(url), init });
    if (String(url).includes("/guidance")) return answer({ modelVersion: "1", target: 900, summary: " Aim for about 14 words a sentence. " });
    const body = JSON.parse(String(init.body)) as { texts: { id: string; target: number }[] };
    return answer({ modelVersion: "1", results: body.texts.map(t => ({ id: t.id, level: t.target + 160, reliable: true, target: { difference: 160, advice: ["Shorten the sentences."] } })) });
  }) as typeof fetch;

  const g = await guidanceForLevel(4);
  assert.deepEqual(g, { modelVersion: "1", target: 900, summary: "Aim for about 14 words a sentence." });
  await guidanceForLevel(4);
  assert.equal(seen.length, 1, "guidance is fetched once per level");
  assert.equal(seen[0].url, "https://compass.example/api/v1/reading-level/guidance?target=900");
  assert.equal((seen[0].init.headers as Record<string, string>).Authorization, "Bearer test-key");

  const two = await measureArticles([{ text: "# One\n\nText.", level: 2 }, { text: "Two.", level: 5 }]);
  assert.deepEqual(two.map(x => x?.level), [760, 1210]);
  const sent = JSON.parse(String(seen[1].init.body));
  assert.equal(sent.format, "markdown");
  assert.deepEqual(sent.texts.map((t: { target: number }) => t.target), [600, 1050]);
  assert.equal(seen[1].url, "https://compass.example/api/v1/reading-level/measure");

  seen.length = 0;
  const many = await measureArticles(Array.from({ length: MEASURE_MAX_TEXTS + 5 }, () => ({ text: "Words here.", level: 3 })));
  assert.equal(seen.length, 2, "more than 100 texts go in two calls");
  assert.equal(many.filter(Boolean).length, MEASURE_MAX_TEXTS + 5);

  configure();
  globalThis.fetch = (async () => answer({ modelVersion: "1", results: [] })) as typeof fetch;
  assert.deepEqual(await measureArticles([{ text: "a", level: 2 }]), [null], "an answer of the wrong length is not matched up by guesswork");
  console.log("✅ guidance once per level; articles measured as Markdown against their level's target");

  // ─── The writer's prompt ────────────────────────────────────────────────────
  const topic: SourcedTopic = { query: "why hop-up makes airsoft BBs curve", type: "interest", sourceUrl: "https://example.org/a", sourceText: "Source text." };
  const unsourced: SourcedTopic = { ...topic, sourceUrl: null, sourceText: "" };
  const summary = "Aim for about 14 words a sentence.";
  for (const prompt of [rewritePrompt(topic, summary), knowledgePrompt(unsourced, summary), adaptPrompt("T", "Body.", 2, summary), revisePrompt("T", "Body.", ["Shorten the sentences."], summary)]) {
    assert.ok(prompt.includes(summary), "Compass's guidance is in the prompt");
  }
  for (const prompt of [rewritePrompt(topic), knowledgePrompt(unsourced), adaptPrompt("T", "Body.", 2)]) {
    assert.ok(!prompt.includes("SENTENCES AND WORDS"), "without guidance the prompt is as it was");
  }
  assert.ok(revisePrompt("T", "Body.", ["Shorten the sentences."]).includes("Shorten the sentences."));
  console.log("✅ the writer is told what to aim at, and the prompt is unchanged when Compass doesn't answer");
}

main().finally(() => {
  globalThis.fetch = realFetch;
  if (savedEnv.url === undefined) delete process.env.COMPASS_URL; else process.env.COMPASS_URL = savedEnv.url;
  if (savedEnv.key === undefined) delete process.env.COMPASS_INTERESTS_KEY; else process.env.COMPASS_INTERESTS_KEY = savedEnv.key;
}).catch(e => { console.error(e); process.exit(1); });
