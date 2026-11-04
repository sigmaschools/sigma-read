/**
 * Article-writer comparison: the same sources rewritten at the base level and adapted to
 * levels 1 and 6 by each candidate model, with the batch's own prompts (src/lib/batch/article-writer.ts).
 * Each candidate's three articles are graded blind by a judge model that is not a candidate,
 * against the source, plus automatic checks (length, readability grade, banned openings).
 *
 *   npm run eval:articles                       # all candidates
 *   npm run eval:articles -- --configs sonnet-4-5,opus-5-5-low --sources 4
 *   npm run eval:articles -- --make-sources     # (re)write the source fixtures, then stop
 *
 * Needs ANTHROPIC_API_KEY only (no database). Output: eval-results/articles-<time>/.
 *
 * The sources are encyclopedia-style texts in scripts/eval/article-sources.json. They were
 * written by a model for this test, because the test machine couldn't reach the web; the judge
 * grades faithfulness to the source, not to the world, so that is enough to compare writers.
 */

import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { rewriteFromSource, adaptArticleToLevel, hasBannedOpening, levelGuide, BASE_LEVEL, type SourcedTopic } from "../src/lib/batch/article-writer";
import { costUsd } from "../src/lib/ai-pricing";

const anthropic = new Anthropic();
const JUDGE_MODEL = "claude-fable-5-1";
const SOURCES_FILE = join(__dirname, "eval", "article-sources.json");
const ADAPT_LEVELS = [1, 6];

interface Config { id: string; model: string; settings: Record<string, unknown> }

const CONFIGS: Config[] = [
  { id: "sonnet-4-5", model: "claude-sonnet-4-5", settings: {} },
  { id: "haiku-5-5-nothink", model: "claude-haiku-5-5", settings: { thinking: { type: "disabled" } } },
  { id: "sonnet-5-5-nothink", model: "claude-sonnet-5-5", settings: { thinking: { type: "between_tools" } } },
  { id: "sonnet-5-5-low", model: "claude-sonnet-5-5", settings: { output_config: { effort: "low" } } },
  { id: "opus-5-5-low", model: "claude-opus-5-5", settings: { output_config: { effort: "low" } } },
  { id: "opus-5-5-medium", model: "claude-opus-5-5", settings: { output_config: { effort: "medium" } } },
];

const SOURCE_TOPICS: { query: string; type: SourcedTopic["type"]; brief: string }[] = [
  { query: "octopus", type: "interest", brief: "the octopus: anatomy, nervous system, camouflage, intelligence studies, reproduction and short life span, species, relationship with humans (fishing, aquariums, research ethics)" },
  { query: "tesla", type: "interest", brief: "Tesla, Inc.: founding, early Roadster, Model S/3/X/Y, battery factories, Autopilot and its investigations, financial history, lawsuits and leadership controversies, market share" },
  { query: "volcanoes", type: "interest", brief: "volcanoes: plate tectonics, magma types, eruption styles, famous eruptions with dates and death tolls, monitoring, volcanic soils and benefits" },
  { query: "soccer", type: "interest", brief: "association football: origins in England, Laws of the Game, FIFA, World Cup history and records, women's game, money and transfer fees, governance scandals" },
  { query: "minecraft", type: "interest", brief: "Minecraft: development history, sale to Microsoft and price, game modes, sales figures, education edition, redstone, community controversies" },
  { query: "honeybees", type: "horizon", brief: "honey bees: colony castes, waggle dance, honey production, pollination value to agriculture, colony collapse disorder, varroa mites, beekeeping history" },
  { query: "black holes", type: "horizon", brief: "black holes: general relativity, event horizon, stellar and supermassive black holes, Sagittarius A*, the 2019 image, gravitational waves (LIGO 2015), Hawking radiation" },
  { query: "sled dog racing", type: "news", brief: "a news report on this year's long-distance sled dog race in Alaska: the winner, finishing time, weather problems, dog care rules, a rookie's story, animal-welfare criticism" },
];

function args() {
  const a = process.argv.slice(2);
  const get = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : null; };
  return {
    makeSources: a.includes("--make-sources"),
    configs: get("--configs")?.split(",") ?? null,
    sources: get("--sources") ? Number(get("--sources")) : null,
    concurrency: get("--concurrency") ? Number(get("--concurrency")) : 4,
  };
}

// ─── Source fixtures ─────────────────────────────────────────────────────────

async function makeSources() {
  const out: SourcedTopic[] = [];
  for (const t of SOURCE_TOPICS) {
    const r = await anthropic.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 8000,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: `Write an encyclopedia-style article of about 1,200 words for adult readers on ${t.brief}. Dense with specific facts, numbers, dates and named people, in the neutral register of a general encyclopedia, including the less child-friendly sections such a page would have. Plain text with section headings on their own lines, no markdown symbols, no preamble.` }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const text = r.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("").trim();
    out.push({ query: t.query, type: t.type, sourceUrl: `fixture:${t.query.replace(/\s+/g, "-")}`, sourceText: text });
    console.log(`  source "${t.query}": ${text.split(/\s+/).length} words`);
  }
  writeFileSync(SOURCES_FILE, JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote ${SOURCES_FILE}`);
}

// ─── Readability ─────────────────────────────────────────────────────────────

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return w.length > 0 ? 1 : 0;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/** Flesch-Kincaid grade level: a rough check that each level reads easier or harder than the next */
export function fkGrade(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
  const words = text.split(/\s+/).filter(w => /[a-z]/i.test(w));
  if (words.length === 0) return 0;
  const syl = words.reduce((s, w) => s + syllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
}

function wordRange(level: number): [number, number] {
  const [lo, hi] = levelGuide[level].words.split("-").map(Number);
  return [lo, hi];
}

// ─── Candidate client: records time and tokens per call ──────────────────────

interface Call { ms: number; usage: Anthropic.Usage; model: string }

function recordingClient(calls: Call[]) {
  return {
    messages: {
      create: async (body: Anthropic.MessageCreateParamsNonStreaming) => {
        const t = Date.now();
        const res = await anthropic.messages.create(body);
        calls.push({ ms: Date.now() - t, usage: res.usage, model: body.model });
        return res;
      },
    },
  } as unknown as { messages: Pick<Anthropic["messages"], "create"> };
}

// ─── Judge ───────────────────────────────────────────────────────────────────

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    unsupported_claims: { type: "array", items: { type: "string" }, description: "Each statement in any of the three articles that the source does not support or that contradicts it" },
    accuracy: { type: "integer", description: "1-5: faithful to the source, no invented or distorted facts" },
    level_fit_low: { type: "integer", description: "1-5: the level-1 article suits a grade 2-3 reader" },
    level_fit_base: { type: "integer", description: "1-5: the level-4 article suits a grade 7 reader" },
    level_fit_high: { type: "integer", description: "1-5: the level-6 article suits a strong grade 8+ reader" },
    engagement: { type: "integer", description: "1-5: a child who likes the topic would want to read to the end" },
    writing: { type: "integer", description: "1-5: clear, well organized, original prose; a good opening" },
    appropriate: { type: "integer", description: "1-5: content choices suit children aged 8-14 (what was kept and left out of the source)" },
    overall: { type: "integer", description: "1-10: how good these articles are as reading material for a children's reading app" },
    comment: { type: "string", description: "Two or three sentences: the main strengths and weaknesses" },
  },
  required: ["unsupported_claims", "accuracy", "level_fit_low", "level_fit_base", "level_fit_high", "engagement", "writing", "appropriate", "overall", "comment"],
  additionalProperties: false,
} as const;

type Judgement = { unsupported_claims: string[]; accuracy: number; level_fit_low: number; level_fit_base: number; level_fit_high: number; engagement: number; writing: number; appropriate: number; overall: number; comment: string };

interface Written { level: number; title: string; body: string }

async function judge(source: SourcedTopic, articles: Written[]): Promise<Judgement | null> {
  const shown = articles.map(a => `=== LEVEL ${a.level} (${levelGuide[a.level].grade === "8+" ? "grade 8+" : `grade ${levelGuide[a.level].grade}`}) ===\nTitle: ${a.title}\n\n${a.body}`).join("\n\n");
  const prompt = `You are grading reading material for a children's nonfiction reading app (ages 8-14). A writer turned the SOURCE below into an article for a grade 7 reader (level 4), which was then adapted for a grade 2-3 reader (level 1) and a strong grade 8+ reader (level 6). The articles must use only facts from the source, be original prose, pick what suits children, and read at their level. Students discuss each article with a tutor afterwards, so substance matters as well as fun.

Be strict and specific. Check every number, date and name against the source.

SOURCE:
${source.sourceText}

ARTICLES:
${shown}`;
  try {
    const r = await anthropic.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 16000,
      output_config: { format: { type: "json_schema", schema: JUDGE_SCHEMA }, effort: "low" },
      messages: [{ role: "user", content: prompt }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    if (r.stop_reason !== "end_turn") return null;
    const text = r.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
    return JSON.parse(text) as Judgement;
  } catch (e) {
    console.error("  judge failed:", (e as Error).message);
    return null;
  }
}

// ─── One run: a candidate on a source ────────────────────────────────────────

interface Result {
  config: string; model: string; source: string;
  articles: Written[]; failed: string[];
  fk: Record<number, number>; words: Record<number, number>; inRange: number; bannedOpening: boolean;
  calls: Call[]; costUsd: number; judge: Judgement | null; error?: string;
}

async function runOne(config: Config, source: SourcedTopic): Promise<Result> {
  const calls: Call[] = [];
  const client = recordingClient(calls);
  const opts = { model: config.model, settings: config.settings };
  const failed: string[] = [];
  const articles: Written[] = [];

  const base = await rewriteFromSource(client, source, opts);
  if (!base) failed.push(`L${BASE_LEVEL}`);
  else {
    articles.push({ level: BASE_LEVEL, title: base.title, body: base.bodyText });
    const adapted = await Promise.all(ADAPT_LEVELS.map(l => adaptArticleToLevel(client, base.title, base.bodyText, l, opts)));
    adapted.forEach((a, i) => a ? articles.push({ level: ADAPT_LEVELS[i], title: a.title, body: a.bodyText }) : failed.push(`L${ADAPT_LEVELS[i]}`));
  }
  articles.sort((a, b) => a.level - b.level);

  const fk: Record<number, number> = {};
  const words: Record<number, number> = {};
  let inRange = 0;
  for (const a of articles) {
    fk[a.level] = fkGrade(a.body);
    words[a.level] = a.body.split(/\s+/).filter(Boolean).length;
    const [lo, hi] = wordRange(a.level);
    if (words[a.level] >= lo * 0.85 && words[a.level] <= hi * 1.15) inRange++;
  }
  const judged = articles.length === 1 + ADAPT_LEVELS.length ? await judge(source, articles) : null;
  return {
    config: config.id, model: config.model, source: source.query, articles, failed, fk, words, inRange,
    bannedOpening: articles.some(a => hasBannedOpening(a.body)),
    calls, costUsd: calls.reduce((s, c) => s + (costUsd(c.model, c.usage) ?? 0), 0), judge: judged,
  };
}

// ─── Summary ─────────────────────────────────────────────────────────────────

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const f = (x: number, d = 1) => Number.isFinite(x) ? x.toFixed(d) : "-";
function pct(xs: number[], p: number) { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; }

function summarize(results: Result[], configs: Config[]): string {
  const base = configs[0].id;
  const lines = [
    "# Article writer comparison", "",
    `${results.length} runs: each candidate rewrote each source at level ${BASE_LEVEL}, then adapted it to levels ${ADAPT_LEVELS.join(" and ")}. Judge ${JUDGE_MODEL}, blind to the model. "vs base" is the paired difference in overall score against ${base} on the same sources, ± standard error.`, "",
    "| Candidate | Judged | Overall /10 | vs base | Accuracy | Unsupported claims / set | Level fit L1 | L4 | L6 | Engaging | Writing | Suitable | FK grade L1 / L4 / L6 | Length in range | Banned openings | Failed calls | Median call | Cost / article set |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  const bySource = (id: string) => new Map(results.filter(r => r.config === id && r.judge).map(r => [r.source, r.judge!.overall]));
  const baseScores = bySource(base);
  for (const c of configs) {
    const rs = results.filter(r => r.config === c.id);
    const j = rs.map(r => r.judge).filter((x): x is Judgement => !!x);
    const diffs = [...bySource(c.id).entries()].filter(([s]) => baseScores.has(s)).map(([s, v]) => v - baseScores.get(s)!);
    const se = diffs.length > 1 ? Math.sqrt(diffs.reduce((s, d) => s + (d - mean(diffs)) ** 2, 0) / (diffs.length - 1) / diffs.length) : NaN;
    const ms = rs.flatMap(r => r.calls.map(x => x.ms / 1000));
    const fkAt = (l: number) => f(mean(rs.map(r => r.fk[l]).filter(x => x !== undefined)));
    lines.push(`| ${c.id} | ${j.length}/${rs.length} | ${f(mean(j.map(x => x.overall)))} | ${c.id === base ? "-" : `${diffs.length ? (mean(diffs) >= 0 ? "+" : "") + f(mean(diffs), 2) : "-"} ± ${f(se, 2)}`} | ${f(mean(j.map(x => x.accuracy)))} | ${f(mean(j.map(x => x.unsupported_claims.length)))} | ${f(mean(j.map(x => x.level_fit_low)))} | ${f(mean(j.map(x => x.level_fit_base)))} | ${f(mean(j.map(x => x.level_fit_high)))} | ${f(mean(j.map(x => x.engagement)))} | ${f(mean(j.map(x => x.writing)))} | ${f(mean(j.map(x => x.appropriate)))} | ${fkAt(1)} / ${fkAt(4)} / ${fkAt(6)} | ${rs.reduce((s, r) => s + r.inRange, 0)}/${rs.length * 3} | ${rs.filter(r => r.bannedOpening).length} | ${rs.reduce((s, r) => s + r.failed.length, 0)} | ${f(pct(ms, 0.5))} s | $${f(mean(rs.map(r => r.costUsd)), 3)} |`);
  }
  lines.push("", "FK grade is the Flesch-Kincaid estimate (targets: L1 grade 2-3, L4 grade 7, L6 grade 8+). Length in range counts articles within 15% of the level's word target.", "", "## Judge comments", "");
  for (const r of results) if (r.judge) lines.push(`- **${r.config} / ${r.source}** (${r.judge.overall}/10): ${r.judge.comment}${r.judge.unsupported_claims.length ? ` Unsupported: ${r.judge.unsupported_claims.map(s => `"${s}"`).join("; ")}` : ""}`);
  return lines.join("\n") + "\n";
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

async function main() {
  const opt = args();
  if (opt.makeSources) return makeSources();
  if (!existsSync(SOURCES_FILE)) { console.error(`No sources: run with --make-sources first`); process.exit(1); }
  const sources = (JSON.parse(readFileSync(SOURCES_FILE, "utf8")) as SourcedTopic[]).slice(0, opt.sources ?? undefined);
  const unknown = opt.configs?.filter(id => !CONFIGS.some(c => c.id === id)) ?? [];
  if (unknown.length) { console.error(`Unknown configs: ${unknown.join(", ")}. Known: ${CONFIGS.map(c => c.id).join(", ")}`); process.exit(1); }
  const configs = opt.configs ? CONFIGS.filter(c => opt.configs!.includes(c.id)) : CONFIGS;

  const dir = join("eval-results", `articles-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(dir, { recursive: true });
  const jobs = configs.flatMap(c => sources.map(s => ({ c, s })));
  console.log(`${jobs.length} runs (${configs.length} candidates × ${sources.length} sources) → ${dir}`);
  const results: Result[] = [];
  await runPool(jobs, opt.concurrency, async ({ c, s }) => {
    let r: Result;
    try {
      r = await runOne(c, s);
    } catch (e) {
      r = { config: c.id, model: c.model, source: s.query, articles: [], failed: ["all"], fk: {}, words: {}, inRange: 0, bannedOpening: false, calls: [], costUsd: 0, judge: null, error: (e as Error).message };
    }
    results.push(r);
    console.log(`  ${c.id} / ${s.query}: judge ${r.judge?.overall ?? "-"}, FK ${Object.values(r.fk).map(x => x.toFixed(1)).join("/")}, $${r.costUsd.toFixed(3)}${r.error ? ` ERROR ${r.error}` : ""}`);
  });
  writeFileSync(join(dir, "results.json"), JSON.stringify(results, null, 1));
  const summary = summarize(results, configs);
  writeFileSync(join(dir, "summary.md"), summary);
  console.log("\n" + summary.split("## Judge comments")[0]);
}

main().catch(e => { console.error(e); process.exit(1); });
