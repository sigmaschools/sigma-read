/**
 * Voice eval: does the tutor sound like a person a kid would keep talking to?
 *
 * Realistic simulated kids (scripts/eval/kid-sim.ts: short, messy, off-topic, questions back)
 * talk with each candidate setup on the same articles. Every setup's transcript is then compared
 * blind, pairwise, with the base setup's transcript of the same case ("which conversation would
 * this kid rather keep having?"), and measured for the dryness patterns seen in the live
 * transcripts (scripts/eval/voice-metrics.ts). A blind pairs file is written for a person to
 * pick from too; their picks decide, the judge is the tiebreaker.
 *
 * A setup is a design plus a model:
 *   classic  the production prompt and turn loop (src/lib/prompts + conversation-turn.ts)
 *   sigma    the redesign (src/lib/tutor: character, prep notes, plain-text turn, observer)
 *
 * Usage (needs ANTHROPIC_API_KEY only):
 *   npm run eval:voice                                   # baseline: today vs before
 *   npm run eval:voice -- --configs=today,sigma-opus-low,sigma-sonnet-low --runs=2
 *   npm run eval:voice -- --configs=today,before --kids=theo,sam --articles=bee-dance,immune
 *   npm run eval:voice -- --judge=claude-opus-5-5       # when Fable is a candidate
 *
 * Writes eval-results/<time>-voice/results.jsonl, summary.md, pairs.md (blind, for a person)
 * and pairs-key.json (which setup was A and B in each pair).
 */

import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EVAL_ARTICLES, type EvalArticle } from "./eval/articles";
import { KID_SIMS, kidsFor, buildKidPrompt, type KidSim } from "./eval/kid-sim";
import { voiceMetrics, averageMetrics, type VoiceMetrics } from "./eval/voice-metrics";
import { comprehensionConversationPrompt, CONVERSATION_STYLES, maxWordsForLevel } from "../src/lib/prompts";
import { runTutorTurn, type ClosingKind } from "../src/lib/conversation-turn";
import { sigmaExchange } from "../src/lib/tutor/conversation";
import { writeGuideNotes, type GuideNotes } from "../src/lib/tutor/guide-notes";
import type { ObserverNotes } from "../src/lib/tutor/observer";
import { MODELS, requestSettings } from "../src/lib/models";

/** Fixed, so a change of the app's models doesn't also change the simulated kids */
const KID_SIM_MODEL = "claude-sonnet-4-6";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}
const anthropic = new Anthropic();

/** USD per million tokens (input, output, cache read). Check anthropic.com/pricing. */
const PRICES: Record<string, [number, number, number]> = {
  "claude-opus-4-6": [5, 25, 0.5],
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-sonnet-4-6": [3, 15, 0.3],
  "claude-haiku-5-5": [0.1, 0.5, 0.01],
  "claude-fable-5-1": [10, 50, 0.25],
};

interface Config {
  id: string;
  design: "classic" | "sigma";
  model: string;
  effort?: "low" | "medium" | "high";
  thinkingOff?: boolean;
  /** sigma only: skip the guide's prep notes (to measure what they add) */
  noNotes?: boolean;
  /** sigma only: an earlier character and examples (scripts/eval/sigma-<v>/), to compare prompt versions */
  voice?: "v1";
  optional?: boolean;
}

/** Earlier Sigma prompts kept for comparison. v1: shipped 7 Nov 2026 (the debate register: "make the case", pushback) */
const VOICES = {
  v1: {
    character: readFileSync(join(__dirname, "eval/sigma-v1/character.md"), "utf8"),
    examples: readFileSync(join(__dirname, "eval/sigma-v1/examples.md"), "utf8"),
  },
};

const CONFIGS: Config[] = [
  { id: "today", design: "classic", model: "claude-sonnet-5-5", effort: "high", thinkingOff: true }, // production since 4 Nov 2026
  { id: "before", design: "classic", model: "claude-opus-4-6" }, // production until 4 Nov 2026
  { id: "classic-opus-low", design: "classic", model: "claude-opus-5-5", effort: "low", optional: true }, // the quick win: new model, old prompt
  { id: "sigma-sonnet-low", design: "sigma", model: "claude-sonnet-5-5", effort: "low", optional: true },
  { id: "sigma-opus-low", design: "sigma", model: "claude-opus-5-5", effort: "low", optional: true },
  { id: "sigma-opus-medium", design: "sigma", model: "claude-opus-5-5", effort: "medium", optional: true },
  { id: "sigma-fable-low", design: "sigma", model: "claude-fable-5-1", effort: "low", optional: true },
  { id: "sigma-opus-low-nonotes", design: "sigma", model: "claude-opus-5-5", effort: "low", noNotes: true, optional: true },
  { id: "sigma-v1", design: "sigma", model: "claude-opus-5-5", effort: "low", voice: "v1", optional: true }, // Sigma as shipped 7 Nov 2026, before the lighter character
];

const args = process.argv.slice(2);
const getArg = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const listArg = (name: string) => getArg(name)?.split(",").filter(Boolean) ?? null;
const intArg = (name: string, fallback: number) => {
  const n = parseInt(getArg(name) ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const configIds = listArg("configs");
const configs = configIds ? configIds.map(id => CONFIGS.find(c => c.id === id)!).filter(Boolean) : CONFIGS.filter(c => !c.optional);
function failOnUnknown(name: string, asked: string[] | null, known: string[]) {
  const unknown = (asked ?? []).filter(x => !known.includes(x));
  if (unknown.length) { console.error(`Unknown --${name}: ${unknown.join(", ")}. Known: ${known.join(", ")}`); process.exit(1); }
}
failOnUnknown("configs", configIds, CONFIGS.map(c => c.id));
failOnUnknown("kids", listArg("kids"), KID_SIMS.map(k => k.id));
failOnUnknown("articles", listArg("articles"), EVAL_ARTICLES.map(a => a.id));
const kidIds = listArg("kids");
const articles = EVAL_ARTICLES.filter(a => !listArg("articles") || listArg("articles")!.includes(a.id));
const runs = intArg("runs", 1);
const concurrency = intArg("concurrency", 4);
/** A judge that is none of the candidates by default, so no model grades its own work */
const JUDGE_MODEL = getArg("judge") ?? "claude-fable-5-1";
const unpriced = [...new Set(configs.map(c => c.model))].filter(m => !PRICES[m]);
if (unpriced.length) { console.error(`No price for ${unpriced.join(", ")}: add it to PRICES`); process.exit(1); }
if (configs.some(c => c.model === JUDGE_MODEL)) console.warn(`Warning: the judge (${JUDGE_MODEL}) is also a candidate; pass --judge=<other model> for a clean comparison`);
const MAX_TURNS = 12;

interface Call { role: "tutor" | "observer" | "notes"; model: string; ms: number; input: number; output: number; cacheRead: number; cacheWrite: number }

function costOf(calls: Call[]): number {
  return calls.reduce((s, c) => {
    const p = PRICES[c.model] ?? [0, 0, 0];
    return s + (c.input * p[0] + c.cacheWrite * p[0] * 1.25 + c.cacheRead * p[2] + c.output * p[1]) / 1e6;
  }, 0);
}

/** A client that records each call's time and tokens under a role */
function recording(role: Call["role"], calls: Call[]) {
  return {
    messages: {
      create: async (body: Record<string, unknown>) => {
        const start = Date.now();
        const res = await anthropic.messages.create(body as never) as Anthropic.Message;
        const u = res.usage;
        calls.push({ role, model: String(body.model), ms: Date.now() - start, input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 });
        return res;
      },
    },
  } as unknown as { messages: Pick<Anthropic["messages"], "create"> };
}

function tutorSettings(config: Config): object {
  const s: Record<string, unknown> = {};
  if (config.effort) s.output_config = { effort: config.effort };
  if (config.thinkingOff) s.thinking = { type: "between_tools" };
  return s;
}

type Msg = { role: "user" | "assistant"; content: string };

async function kidReply(kid: KidSim, article: EvalArticle, transcript: Msg[]): Promise<string> {
  const res = await anthropic.messages.create({
    model: KID_SIM_MODEL,
    max_tokens: 150,
    system: buildKidPrompt(kid, article.title, article.bodyText),
    messages: [{
      role: "user",
      content: `The chat so far:\n${transcript.map(m => `${m.role === "user" ? "You" : "Sigma"}: ${m.content}`).join("\n")}\n\nSigma just said: "${transcript[transcript.length - 1].content}"\n\nWrite your next message, as ${kid.id} would type it. Just the message.`,
    }],
  });
  return res.content.filter(b => b.type === "text").map(b => b.text).join("").trim() || "idk";
}

// Prep notes once per article (the app writes them once per base article, for every student)
const notesCache = new Map<string, Promise<{ notes: GuideNotes | null; calls: Call[] }>>();
function notesFor(article: EvalArticle) {
  if (!notesCache.has(article.id)) {
    const calls: Call[] = [];
    notesCache.set(article.id, writeGuideNotes(recording("notes", calls), article.title, article.bodyText).then(notes => ({ notes, calls })));
  }
  return notesCache.get(article.id)!;
}

interface Result {
  config: string;
  design: string;
  model: string;
  kid: string;
  article: string;
  level: number;
  run: number;
  exchanges: number;
  closing: ClosingKind | null;
  fixes: number;
  metrics: VoiceMetrics;
  calls: Call[];
  costUsd: number;
  /** Tutor API time per reply, ms */
  replyMs: number[];
  transcript: Msg[];
  error?: string;
}

async function runClassic(config: Config, kid: KidSim, article: EvalArticle, style: string, calls: Call[], transcript: Msg[], replyMs: number[]): Promise<{ closing: ClosingKind | null; fixes: number }> {
  const systemPrompt = comprehensionConversationPrompt(article.bodyText, article.level, JSON.stringify({}), null, style);
  const client = recording("tutor", calls);
  let progress = 0, fixes = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const before = calls.length;
    const r = await runTutorTurn({ client, model: config.model, settings: tutorSettings(config), systemPrompt, messages: transcript, priorProgress: progress, maxWords: maxWordsForLevel(article.level) });
    replyMs.push(calls.slice(before).reduce((s, c) => s + c.ms, 0));
    progress = r.progressScore;
    if (r.usedFallback) fixes++;
    transcript.push({ role: "assistant", content: r.message });
    if (r.complete) return { closing: r.closing, fixes };
    transcript.push({ role: "user", content: await kidReply(kid, article, transcript) });
  }
  return { closing: null, fixes };
}

async function runSigma(config: Config, kid: KidSim, article: EvalArticle, calls: Call[], transcript: Msg[], replyMs: number[]): Promise<{ closing: ClosingKind | null; fixes: number }> {
  const guideNotes = config.noNotes ? null : (await notesFor(article)).notes;
  const tutorClient = recording("tutor", calls);
  const observerClient = recording("observer", calls);
  let progress = 0, fixes = 0;
  let notes: ObserverNotes | null = null;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const before = calls.length;
    const r = await sigmaExchange({
      tutorClient, observerClient,
      articleTitle: article.title, articleText: article.bodyText, level: article.level, guideNotes,
      voice: config.voice ? VOICES[config.voice] : null,
      messages: transcript, priorProgress: progress, previousNotes: notes,
      tutorModel: config.model, tutorSettings: tutorSettings(config),
      observerModel: MODELS.observer, observerSettings: requestSettings(MODELS.observer, "observer"),
    });
    replyMs.push(calls.slice(before).filter(c => c.role === "tutor").reduce((s, c) => s + c.ms, 0));
    progress = r.progressScore;
    notes = r.notes;
    if (r.fixed) fixes++;
    transcript.push({ role: "assistant", content: r.message });
    if (r.complete) return { closing: r.closing, fixes };
    transcript.push({ role: "user", content: await kidReply(kid, article, transcript) });
  }
  return { closing: null, fixes };
}

async function runConversation(config: Config, kid: KidSim, article: EvalArticle, run: number, style: string): Promise<Result> {
  const calls: Call[] = [];
  const transcript: Msg[] = [];
  const replyMs: number[] = [];
  const { closing, fixes } = config.design === "classic"
    ? await runClassic(config, kid, article, style, calls, transcript, replyMs)
    : await runSigma(config, kid, article, calls, transcript, replyMs);
  return {
    config: config.id, design: config.design, model: config.model, kid: kid.id, article: article.id, level: article.level, run,
    exchanges: transcript.filter(m => m.role === "user").length,
    closing, fixes,
    metrics: voiceMetrics(transcript.filter(m => m.role === "assistant").map(m => m.content)),
    calls, costUsd: costOf(calls), replyMs, transcript,
  };
}

// ─── Pairwise blind judge ──────────────────────────────────────────────────

const PAIR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["winner", "margin", "reason", "a", "b"],
  properties: {
    winner: { type: "string", enum: ["A", "B", "tie"] },
    margin: { type: "string", enum: ["slight", "clear", "big"] },
    reason: { type: "string", description: "one or two sentences, naming specific lines" },
    a: { $ref: "#/$defs/side" },
    b: { $ref: "#/$defs/side" },
  },
  $defs: {
    side: {
      type: "object",
      additionalProperties: false,
      required: ["person", "keepTalking", "fun", "graderLines", "debateLines", "muddledLines", "worstLine"],
      properties: {
        person: { type: "integer", description: "1-5: sounds like a real adult who read the article and has their own reactions, not a program running a routine" },
        keepTalking: { type: "integer", description: "1-5: a kid this age would want to keep talking to this tutor" },
        fun: { type: "integer", description: "1-5: light and fun for a kid this age; 1 is a debate or a lesson, 5 is a chat they'd enjoy and want again" },
        graderLines: { type: "integer", description: "how many tutor lines evaluate the kid ('smart guess', 'good catch', 'you put that together nicely', summing up what they got right)" },
        debateLines: { type: "integer", description: "how many tutor lines ask the kid to make a case, defend, argue, convince or prove something, push back on the kid, counter them with a claim of the tutor's own (a correction of a misreading is not a debate line)" },
        muddledLines: { type: "integer", description: "how many tutor lines are confusing, hop topics, or ask two things at once" },
        worstLine: { type: "string", description: "the tutor's weakest line, quoted, or 'none'" },
      },
    },
  },
} as const;

interface Side { person: number; keepTalking: number; fun: number; graderLines: number; debateLines: number; muddledLines: number; worstLine: string }
interface Judgement { winner: "A" | "B" | "tie"; margin: "slight" | "clear" | "big"; reason: string; a: Side; b: Side }

const fmt = (t: Msg[]) => t.map(m => `${m.role === "user" ? "Kid" : "Tutor"}: ${m.content}`).join("\n\n");

async function judgePair(article: EvalArticle, kid: KidSim, a: Msg[], b: Msg[]): Promise<Judgement | null> {
  const prompt = `Two reading discussions between a tutor (a Guide, meant to be a young teacher in their twenties: warm, plain-spoken, curious, genuinely interested in the kid, never a quiz, never a cheerleader, never a debate partner) and the same ${kid.age}-year-old kid, after both read the article below. The kid is simulated and the same in both; judge the TUTOR only.

The owner's standard: the point is to get kids interested in reading and to practice understanding what they read, so the talk should be light-hearted and fun, not deeply challenging. It should feel like a kid and an adult who both enjoyed the same article. A guide with their own reactions, who follows the kid, varies how they talk, stays on the article, and never grades the kid out loud. Two failure modes. Dry: the same shape every turn ("[short reaction]. Imagine X and tell me Y."), remarks that evaluate the kid ("smart guess", "good catch"), nothing of the tutor's own, muddled or topic-hopping prompts, closings that read like a report card. Argumentative: "make the case", "defend that", "convince me", pushback every turn, correcting small things, bringing in claims from outside the article to counter the kid, chasing depth or responsibility or blame. A real person described the argumentative version as "arguing with an annoying adult".

Article:
---
${article.bodyText}
---

CONVERSATION A
${fmt(a)}

CONVERSATION B
${fmt(b)}

Which conversation would this kid rather keep having, and which one would make them want to read another article tomorrow? Pick a winner unless they are truly indistinguishable. Be strict on both; a tie is rare.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await anthropic.messages.create({
        model: JUDGE_MODEL,
        max_tokens: 16000,
        messages: [{ role: "user", content: prompt }],
        output_config: { format: { type: "json_schema", schema: PAIR_SCHEMA }, effort: "medium" },
      } as never) as Anthropic.Message;
      const t = res.content.filter(b => b.type === "text").map(b => b.text).join("");
      return JSON.parse(t) as Judgement;
    } catch (e) {
      console.log(`  judge failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  return null;
}

interface Pair { case: string; kid: string; article: string; level: number; run: number; base: string; other: string; baseIs: "A" | "B"; judgement: Judgement | null }

// ─── Summary ──────────────────────────────────────────────────────────────

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const f = (n: number, d = 1) => Number.isFinite(n) ? n.toFixed(d) : "-";
const pc = (n: number) => Number.isFinite(n) ? `${Math.round(n * 100)}%` : "-";

function summarize(results: Result[], pairs: Pair[], notesCost: number): string {
  const base = configs[0].id;
  const lines = [`# Tutor voice eval`, "", `${results.length} conversations. Kids simulated by ${KID_SIM_MODEL}; pairs judged blind by ${JUDGE_MODEL}. Each setup is compared with \`${base}\` on the same kid, article and run.`, ""];
  lines.push(`| Setup | Convos | Errors | Wins vs ${base} | Losses | Ties | Person /5 | Keep talking /5 | Fun /5 | Grader lines | Debate lines | Muddled lines | Exchanges | Closed | Fixes | Median reply s | p90 | Cost / convo $ |`);
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  const sideOf = (p: Pair, which: "base" | "other"): Side | null => {
    if (!p.judgement) return null;
    const isA = (which === "base") === (p.baseIs === "A");
    return isA ? p.judgement.a : p.judgement.b;
  };
  for (const c of configs) {
    const rs = results.filter(r => r.config === c.id);
    const ok = rs.filter(r => !r.error);
    const ps = pairs.filter(p => p.other === c.id && p.judgement);
    const which = c.id === base ? "base" : "other";
    const sides = (c.id === base ? pairs.filter(p => p.judgement) : ps).map(p => sideOf(p, which)!).filter(Boolean);
    const wins = ps.filter(p => p.judgement!.winner !== "tie" && (p.judgement!.winner === "A") !== (p.baseIs === "A")).length;
    const losses = ps.filter(p => p.judgement!.winner !== "tie" && (p.judgement!.winner === "A") === (p.baseIs === "A")).length;
    const ties = ps.length - wins - losses;
    const ms = ok.flatMap(r => r.replyMs.map(x => x / 1000));
    lines.push(`| ${c.id} | ${ok.length} | ${rs.length - ok.length} | ${c.id === base ? "-" : wins} | ${c.id === base ? "-" : losses} | ${c.id === base ? "-" : ties} | ${f(mean(sides.map(s => s.person)))} | ${f(mean(sides.map(s => s.keepTalking)))} | ${f(mean(sides.map(s => s.fun)))} | ${f(mean(sides.map(s => s.graderLines)))} | ${f(mean(sides.map(s => s.debateLines)))} | ${f(mean(sides.map(s => s.muddledLines)))} | ${f(mean(ok.map(r => r.exchanges)))} | ${pc(ok.length ? ok.filter(r => r.closing).length / ok.length : NaN)} | ${ok.reduce((s, r) => s + r.fixes, 0)} | ${f(pct(ms, 0.5))} | ${f(pct(ms, 0.9))} | ${f(mean(ok.map(r => r.costUsd)), 3)} |`);
  }
  lines.push("", `Cost is the tutor plus (for sigma) the observer, per conversation, with prompt caching as the API reported it. Prep notes cost $${notesCost.toFixed(3)} for ${articles.length} articles in this run, once per article for every student. Reply time is the tutor's API time per turn without streaming.`, "");
  lines.push("## Measured patterns (share of tutor messages)", "");
  lines.push("| Setup | \"tell me\" | imagine/picture | ! | grader's remark | debate move | correction | repeated opener | same move as last turn | ends with ? | words | length variety |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of configs) {
    const m = averageMetrics(results.filter(r => r.config === c.id && !r.error).map(r => r.metrics));
    lines.push(`| ${c.id} | ${pc(m.tellMe)} | ${pc(m.imagine)} | ${pc(m.exclaim)} | ${pc(m.grading)} | ${pc(m.debate)} | ${pc(m.corrects)} | ${pc(m.repeatOpener)} | ${pc(m.repeatMove)} | ${pc(m.question)} | ${f(m.words, 0)} | ${f(m.lengthVariety, 2)} |`);
  }
  lines.push("", "Live-site reference (Lily, 2-7 Nov 2026): Opus 4.6 had \"tell me\" 64%, ! 19%; Sonnet 5.5 had \"tell me\" 70%, ! 7%.", "");
  lines.push("## Why the judge picked (a sample)", "");
  for (const c of configs.slice(1)) {
    lines.push(`### ${c.id} vs ${base}`, "");
    for (const p of pairs.filter(p => p.other === c.id && p.judgement).slice(0, 6)) {
      const j = p.judgement!;
      const won = j.winner === "tie" ? "tie" : (j.winner === "A") !== (p.baseIs === "A") ? c.id : base;
      lines.push(`- ${p.kid}/${p.article} r${p.run}: ${won} (${j.margin}). ${j.reason}`);
    }
    lines.push("");
  }
  lines.push("## Weakest lines", "");
  for (const c of configs) {
    const worst = pairs.flatMap(p => {
      const s = sideOf(p, c.id === base ? "base" : "other");
      return s && (c.id === base || p.other === c.id) && s.worstLine && !/^none$/i.test(s.worstLine) ? [`- ${p.kid}/${p.article}: ${s.worstLine}`] : [];
    });
    lines.push(`### ${c.id}`, "", ...worst.slice(0, 5), "");
  }
  return lines.join("\n") + "\n";
}

/** Blind pairs for a person: A and B in random order, the key in a separate file */
function pairsForHumans(results: Result[], pairs: Pair[]): { md: string; key: object[] } {
  const md = ["# Blind pairs", "", "Read each pair and note which tutor you'd rather your kid talked with: A, B or tie. The key is in pairs-key.json.", ""];
  const key: object[] = [];
  pairs.forEach((p, i) => {
    const base = results.find(r => r.config === p.base && r.kid === p.kid && r.article === p.article && r.run === p.run)!;
    const other = results.find(r => r.config === p.other && r.kid === p.kid && r.article === p.article && r.run === p.run)!;
    const [a, b] = p.baseIs === "A" ? [base, other] : [other, base];
    md.push(`## Pair ${i + 1}: ${p.kid} (age ${KID_SIMS.find(k => k.id === p.kid)?.age}), "${EVAL_ARTICLES.find(x => x.id === p.article)?.title}"`, "", "### A", "", fmt(a.transcript).replace(/^/gm, "> "), "", "### B", "", fmt(b.transcript).replace(/^/gm, "> "), "");
    key.push({ pair: i + 1, A: a.config, B: b.config, judge: p.judgement?.winner ?? null });
  });
  return { md: md.join("\n"), key };
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

async function main() {
  const cases = articles.flatMap(a => kidsFor(a.level).filter(k => !kidIds || kidIds.includes(k.id)).flatMap((k, i) => Array.from({ length: runs }, (_, run) => ({ a, k, run, style: CONVERSATION_STYLES[(i + run + a.level) % CONVERSATION_STYLES.length] }))));
  if (!cases.length) { console.error("No cases: the chosen kids don't match the chosen articles' levels"); process.exit(1); }
  const jobs = cases.flatMap(c => configs.map(config => ({ ...c, config })));
  const dir = join("eval-results", `${new Date().toISOString().replace(/[:.]/g, "-")}-voice`);
  mkdirSync(dir, { recursive: true });
  console.log(`Running ${jobs.length} conversations (${cases.length} cases x ${configs.length} setups) → ${dir}`);
  const results: Result[] = [];
  await runPool(jobs, concurrency, async ({ a, k, run, style, config }) => {
    let r: Result;
    try {
      r = await runConversation(config, k, a, run, style);
      console.log(`  ${config.id} ${k.id}/${a.id} r${run}: ${r.exchanges} exchanges, ${r.closing ?? "unclosed"}, tell-me ${pc(r.metrics.tellMe)}, debate ${pc(r.metrics.debate)}, $${r.costUsd.toFixed(3)}`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`  ${config.id} ${k.id}/${a.id} r${run}: error: ${error}`);
      r = { config: config.id, design: config.design, model: config.model, kid: k.id, article: a.id, level: a.level, run, exchanges: 0, closing: null, fixes: 0, metrics: voiceMetrics([]), calls: [], costUsd: 0, replyMs: [], transcript: [], error };
    }
    results.push(r);
    appendFileSync(join(dir, "results.jsonl"), JSON.stringify(r) + "\n");
  });

  // Pairs: every other setup against the base, per case, in random order
  const base = configs[0];
  const pairs: Pair[] = [];
  for (const c of configs.slice(1)) {
    for (const cs of cases) {
      const b = results.find(r => r.config === base.id && r.kid === cs.k.id && r.article === cs.a.id && r.run === cs.run && !r.error);
      const o = results.find(r => r.config === c.id && r.kid === cs.k.id && r.article === cs.a.id && r.run === cs.run && !r.error);
      if (b && o) pairs.push({ case: `${cs.k.id}/${cs.a.id}/${cs.run}`, kid: cs.k.id, article: cs.a.id, level: cs.a.level, run: cs.run, base: base.id, other: c.id, baseIs: Math.random() < 0.5 ? "A" : "B", judgement: null });
    }
  }
  console.log(`Judging ${pairs.length} pairs with ${JUDGE_MODEL}`);
  await runPool(pairs, concurrency, async p => {
    const b = results.find(r => r.config === p.base && r.kid === p.kid && r.article === p.article && r.run === p.run)!;
    const o = results.find(r => r.config === p.other && r.kid === p.kid && r.article === p.article && r.run === p.run)!;
    const [a, bb] = p.baseIs === "A" ? [b, o] : [o, b];
    p.judgement = await judgePair(EVAL_ARTICLES.find(x => x.id === p.article)!, KID_SIMS.find(k => k.id === p.kid)!, a.transcript, bb.transcript);
    if (p.judgement) console.log(`  ${p.other} vs ${p.base} ${p.case}: ${p.judgement.winner === "tie" ? "tie" : (p.judgement.winner === "A") !== (p.baseIs === "A") ? p.other : p.base} (${p.judgement.margin})`);
  });

  const notesCost = (await Promise.all([...notesCache.values()])).reduce((s, n) => s + costOf(n.calls), 0);
  writeFileSync(join(dir, "pairs.json"), JSON.stringify(pairs, null, 1));
  writeFileSync(join(dir, "summary.md"), summarize(results, pairs, notesCost));
  const human = pairsForHumans(results, pairs);
  writeFileSync(join(dir, "pairs.md"), human.md);
  writeFileSync(join(dir, "pairs-key.json"), JSON.stringify(human.key, null, 1));
  console.log(`\nSummary: ${join(dir, "summary.md")}\nBlind pairs for a person: ${join(dir, "pairs.md")}`);
}

main().catch(e => { console.error(e); process.exit(1); });
