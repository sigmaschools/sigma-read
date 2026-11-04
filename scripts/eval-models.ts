/**
 * Model comparison for the comprehension conversation: the same simulated students, articles and
 * conversation styles are run with each candidate tutor model, then every transcript is graded
 * blind by one fixed judge model. Nothing is written to a database; no real student is simulated.
 *
 * Usage (needs ANTHROPIC_API_KEY only):
 *   npm run eval:models
 *   npm run eval:models -- --configs=opus-4-6,sonnet-5-5-low --personas=emma,marcus --runs=1
 *
 * Writes eval-results/<time>-models/results.jsonl (one line per conversation, with transcript,
 * per-turn latency, tokens and cost) and summary.md (one row per model: judge scores, rule
 * violations, latency, cost per conversation).
 *
 * The student simulator and the comprehension report stay on the production models for every
 * candidate, so only the tutor changes.
 */

import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { PERSONAS, EXCLUDED_USERNAMES, type StudentPersona } from "./test-personas";
import { EVAL_ARTICLES, type EvalArticle } from "./eval/articles";
import { buildStudentSystemPrompt } from "./eval/student-sim";
import { checkTranscript, wordCount, type Msg, type Violation } from "./eval/checks";
import { comprehensionConversationPrompt, CONVERSATION_STYLES, maxWordsForLevel } from "../src/lib/prompts";
import { runTutorTurn, type ClosingKind } from "../src/lib/conversation-turn";

/** Fixed, so a change of the app's models doesn't also change the simulated students */
const STUDENT_SIM_MODEL = "claude-sonnet-4-6";

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
  "claude-haiku-5-5": [0.1, 0.5, 0.01], // cache read assumed at 0.1x input
  "claude-fable-5-1": [10, 50, 0.25],
};

interface Config { id: string; model: string; effort?: "low" | "medium" | "high"; thinkingOff?: boolean; /** Only when named in --configs */ optional?: boolean }

const CONFIGS: Config[] = [
  { id: "opus-4-6", model: "claude-opus-4-6" }, // production today
  { id: "opus-5-5-low", model: "claude-opus-5-5", effort: "low" },
  { id: "opus-5-5-medium", model: "claude-opus-5-5", effort: "medium", optional: true },
  { id: "sonnet-5-5-low", model: "claude-sonnet-5-5", effort: "low" },
  { id: "sonnet-5-5-nothink", model: "claude-sonnet-5-5", effort: "high", thinkingOff: true },
  { id: "haiku-5-5-low", model: "claude-haiku-5-5", effort: "low" },
];

/** A judge that is none of the candidates, so no model grades its own work */
const JUDGE_MODEL = "claude-fable-5-1";

const args = process.argv.slice(2);
const getArg = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const listArg = (name: string) => getArg(name)?.split(",").filter(Boolean) ?? null;
const intArg = (name: string, fallback: number) => {
  const n = parseInt(getArg(name) ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const configIds = listArg("configs");
const configs = CONFIGS.filter(c => configIds ? configIds.includes(c.id) : !c.optional);
function failOnUnknown(name: string, asked: string[] | null, known: string[]) {
  const unknown = (asked ?? []).filter(x => !known.includes(x));
  if (unknown.length) { console.error(`Unknown --${name}: ${unknown.join(", ")}. Known: ${known.join(", ")}`); process.exit(1); }
}
failOnUnknown("configs", configIds, CONFIGS.map(c => c.id));
failOnUnknown("personas", listArg("personas"), PERSONAS.map(p => p.username));
failOnUnknown("articles", listArg("articles"), EVAL_ARTICLES.map(a => a.id));
const unpriced = [...new Set(configs.map(c => c.model))].filter(m => !PRICES[m]);
if (unpriced.length) { console.error(`No price for ${unpriced.join(", ")}: add it to PRICES`); process.exit(1); }
const DEFAULT_PERSONAS = ["emma", "sofia", "marcus", "dante"];
const personas = PERSONAS.filter(p => (listArg("personas") ?? DEFAULT_PERSONAS).includes(p.username))
  .filter(p => !EXCLUDED_USERNAMES.includes(p.username));
const articles = EVAL_ARTICLES.filter(a => !listArg("articles") || listArg("articles")!.includes(a.id));
const runs = intArg("runs", 1);
const concurrency = intArg("concurrency", 4);
const MAX_TURNS = 10;

interface Call { ms: number; input: number; output: number; cacheRead: number; cacheWrite: number }

function costOf(model: string, calls: Call[]): number {
  const p = PRICES[model];
  if (!p) return NaN;
  return calls.reduce((s, c) => s + (c.input * p[0] + c.cacheWrite * p[0] * 1.25 + c.cacheRead * p[2] + c.output * p[1]) / 1e6, 0);
}

/** A client that applies the candidate's settings and records each call's time and tokens */
function candidateClient(config: Config, calls: Call[]) {
  return {
    messages: {
      create: async (body: Record<string, unknown>) => {
        const req: Record<string, unknown> = { ...body, model: config.model };
        if (config.effort) req.output_config = { ...(body.output_config as object ?? {}), effort: config.effort };
        if (config.thinkingOff) req.thinking = { type: "between_tools" };
        const start = Date.now();
        const res = await anthropic.messages.create(req as never) as Anthropic.Message;
        const u = res.usage;
        calls.push({ ms: Date.now() - start, input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 });
        return res;
      },
    },
  } as unknown as { messages: Pick<Anthropic["messages"], "create"> };
}

async function studentReply(persona: StudentPersona, article: EvalArticle, transcript: Msg[]): Promise<string> {
  const last = transcript[transcript.length - 1].content;
  const res = await anthropic.messages.create({
    model: STUDENT_SIM_MODEL,
    max_tokens: 200,
    system: buildStudentSystemPrompt(persona, article.level),
    messages: [{
      role: "user",
      content: `Article you just read:\n---\n${article.bodyText}\n---\n\nConversation so far:\n${transcript.map(m => `${m.role === "user" ? "You" : "Teacher"}: ${m.content}`).join("\n")}\n\nThe teacher just said: "${last}"\n\nRespond as this student would. Just the student's response, nothing else.`,
    }],
  });
  return res.content.filter(b => b.type === "text").map(b => b.text).join("").trim() || "idk";
}

const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["natural", "responsive", "thinking", "level_fit", "rules", "overall", "best_moment", "worst_moment"],
  properties: {
    natural: { type: "integer", description: "1-5: sounds like a warm, curious older sibling talking, not a quiz or a form" },
    responsive: { type: "integer", description: "1-5: reacts to what the student actually said, follows their ideas, handles off-topic or wrong answers well" },
    thinking: { type: "integer", description: "1-5: questions push the student to explain, connect and reason, not just recall facts" },
    level_fit: { type: "integer", description: "1-5: words and length fit the reading level" },
    rules: { type: "integer", description: "1-5: one question at a time, no empty praise, no lecturing, never gives away the answer" },
    overall: { type: "integer", description: "1-10: how good this conversation is for a child, as a whole" },
    best_moment: { type: "string", description: "one short quote of the tutor's best line" },
    worst_moment: { type: "string", description: "one short quote of the tutor's weakest line and why, or 'none'" },
  },
} as const;

type Judgement = { natural: number; responsive: number; thinking: number; level_fit: number; rules: number; overall: number; best_moment: string; worst_moment: string };

async function judge(article: EvalArticle, transcript: Msg[]): Promise<Judgement | null> {
  const text = transcript.map(m => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`).join("\n\n");
  const prompt = `You are reviewing a reading discussion between an AI tutor and a child (reading level ${article.level} of 6, where 1 is about grade 2-3 and 6 is about grade 9). The tutor should feel like a warm, curious older sibling: short turns, one question at a time, reacting to what the child actually said, pushing them to explain and connect ideas, never quizzing, lecturing or giving empty praise.

Article:
---
${article.bodyText}
---

Conversation:
${text}

Score the TUTOR only (the student is simulated). Be strict and use the whole scale: 3 is ordinary, 5 is excellent.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await anthropic.messages.create({
        model: JUDGE_MODEL,
        max_tokens: 16000,
        messages: [{ role: "user", content: prompt }],
        output_config: { format: { type: "json_schema", schema: JUDGE_SCHEMA }, effort: "low" },
      } as never) as Anthropic.Message;
      const t = res.content.filter(b => b.type === "text").map(b => b.text).join("");
      const j = JSON.parse(t) as Judgement;
      const clamp = (n: number, max: number) => Math.min(max, Math.max(1, Math.round(Number(n) || 1)));
      for (const k of ["natural", "responsive", "thinking", "level_fit", "rules"] as const) j[k] = clamp(j[k], 5);
      j.overall = clamp(j.overall, 10);
      if (/^\s*none\W*$/i.test(j.worst_moment ?? "")) j.worst_moment = "none";
      return j;
    } catch (e) {
      console.log(`  judge failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  return null;
}

interface Result {
  config: string;
  model: string;
  persona: string;
  article: string;
  level: number;
  style: string;
  exchanges: number;
  closing: ClosingKind | null;
  fallbacks: number;
  tutorAvgWords: number;
  violations: Violation[];
  calls: Call[];
  costUsd: number;
  judge: Judgement | null;
  transcript: Msg[];
  error?: string;
}

async function runConversation(config: Config, persona: StudentPersona, article: EvalArticle, style: string): Promise<Result> {
  const systemPrompt = comprehensionConversationPrompt(article.bodyText, article.level, JSON.stringify({ interests: persona.interests }), undefined, null, style);
  const calls: Call[] = [];
  const client = candidateClient(config, calls);
  const transcript: Msg[] = [];
  let progress = 0;
  let closing: ClosingKind | null = null;
  let fallbacks = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const r = await runTutorTurn({ client, model: config.model, systemPrompt, messages: transcript, priorProgress: progress, maxWords: maxWordsForLevel(article.level) });
    progress = r.progressScore;
    if (r.usedFallback) fallbacks++;
    transcript.push({ role: "assistant", content: r.message });
    if (r.complete) { closing = r.closing; break; }
    transcript.push({ role: "user", content: await studentReply(persona, article, transcript) });
  }
  const tutor = transcript.filter(m => m.role === "assistant");
  return {
    config: config.id, model: config.model, persona: persona.username, article: article.id, level: article.level, style,
    exchanges: transcript.filter(m => m.role === "user").length,
    closing, fallbacks,
    tutorAvgWords: tutor.length ? Math.round(tutor.reduce((s, m) => s + wordCount(m.content), 0) / tutor.length) : 0,
    violations: checkTranscript(transcript, article.level, closing ? transcript.length - 1 : null),
    calls, costUsd: costOf(config.model, calls),
    judge: await judge(article, transcript),
    transcript,
  };
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };

function summarize(results: Result[]): string {
  const lines = [`# Tutor model comparison`, "", `${results.length} conversations. Student simulator ${STUDENT_SIM_MODEL}; judge ${JUDGE_MODEL} (blind to the model). Same personas, articles and styles for every model.`, ""];
  // Cases are paired across models (same persona, article and style), so compare each model with
  // the first config case by case: mean difference in the judge's overall score and its standard error
  const base = configs[0]?.id;
  const caseKey = (r: Result) => `${r.persona}|${r.article}|${r.style}`;
  const overallBy = (id: string) => {
    const m = new Map<string, number[]>();
    results.filter(r => r.config === id && r.judge).forEach(r => m.set(caseKey(r), [...(m.get(caseKey(r)) ?? []), r.judge!.overall]));
    return m;
  };
  const baseBy = base ? overallBy(base) : new Map<string, number[]>();
  const paired = (id: string) => {
    const d = [...overallBy(id).entries()].filter(([k]) => baseBy.has(k)).map(([k, v]) => mean(v) - mean(baseBy.get(k)!));
    if (d.length < 2) return "-";
    const m = mean(d), sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1));
    return `${m >= 0 ? "+" : ""}${m.toFixed(2)} ± ${(sd / Math.sqrt(d.length)).toFixed(2)}`;
  };
  lines.push(`| Model | Convos | Errors | Judged | Closed | Overall /10 | vs ${base} (±SE) | Natural | Responsive | Thinking | Level fit | Rules | Rule violations / convo | Fallbacks | Median reply s | p90 reply s | Cost / convo $ |`);
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of configs) {
    const rs = results.filter(r => r.config === c.id);
    const ok = rs.filter(r => !r.error);
    const j = ok.flatMap(r => r.judge ? [r.judge] : []);
    const ms = ok.flatMap(r => r.calls.map(x => x.ms / 1000));
    const f = (n: number, d = 1) => Number.isFinite(n) ? n.toFixed(d) : "-";
    lines.push(`| ${c.id} | ${ok.length} | ${rs.length - ok.length} | ${j.length} | ${ok.length ? Math.round(100 * ok.filter(r => r.closing).length / ok.length) : 0}% | ${f(mean(j.map(x => x.overall)))} | ${c.id === base ? "-" : paired(c.id)} | ${f(mean(j.map(x => x.natural)))} | ${f(mean(j.map(x => x.responsive)))} | ${f(mean(j.map(x => x.thinking)))} | ${f(mean(j.map(x => x.level_fit)))} | ${f(mean(j.map(x => x.rules)))} | ${f(mean(ok.map(r => r.violations.length)))} | ${ok.reduce((s, r) => s + r.fallbacks, 0)} | ${f(pct(ms, 0.5))} | ${f(pct(ms, 0.9))} | ${f(mean(ok.map(r => r.costUsd)), 3)} |`);
  }
  lines.push("", "Reply time is one whole tutor API call, without streaming and including any SDK retries (a rewrite retry counts as its own call): use it to compare models, not as the time to first word a streaming app shows. Cost covers the tutor calls only. A conversation that hit the turn limit without closing counts as not closed.", "");
  lines.push("## Weakest lines the judge picked", "");
  for (const c of configs) {
    lines.push(`### ${c.id}`, "");
    results.filter(r => r.config === c.id && r.judge && r.judge.worst_moment !== "none")
      .sort((a, b) => (a.judge!.overall - b.judge!.overall)).slice(0, 3)
      .forEach(r => lines.push(`- ${r.persona}/${r.article} (${r.judge!.overall}/10): ${r.judge!.worst_moment}`));
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

async function main() {
  // One style per persona/article/run, shared by every model, so styles don't confound the comparison
  const cases = personas.flatMap((p, i) => articles.flatMap((a, k) => Array.from({ length: runs }, (_, r) => ({ p, a, style: CONVERSATION_STYLES[(i + k * 2 + r) % CONVERSATION_STYLES.length] }))));
  const jobs = cases.flatMap(c => configs.map(config => ({ ...c, config })));
  const dir = join("eval-results", `${new Date().toISOString().replace(/[:.]/g, "-")}-models`);
  mkdirSync(dir, { recursive: true });
  console.log(`Running ${jobs.length} conversations (${cases.length} cases x ${configs.length} models) → ${dir}`);
  const results: Result[] = [];
  await runPool(jobs, concurrency, async ({ p, a, style, config }) => {
    let r: Result;
    try {
      r = await runConversation(config, p, a, style);
      console.log(`  ${config.id} ${p.username}/${a.id}: ${r.exchanges} exchanges, judge ${r.judge?.overall ?? "-"}, $${r.costUsd.toFixed(3)}`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`  ${config.id} ${p.username}/${a.id}: error: ${error}`);
      r = { config: config.id, model: config.model, persona: p.username, article: a.id, level: a.level, style, exchanges: 0, closing: null, fallbacks: 0, tutorAvgWords: 0, violations: [], calls: [], costUsd: 0, judge: null, transcript: [], error };
    }
    results.push(r);
    appendFileSync(join(dir, "results.jsonl"), JSON.stringify(r) + "\n");
  });
  results.sort((x, y) => x.config.localeCompare(y.config) || x.persona.localeCompare(y.persona) || x.article.localeCompare(y.article));
  writeFileSync(join(dir, "summary.md"), summarize(results));
  console.log(`\nSummary: ${join(dir, "summary.md")}`);
}

main().catch(e => { console.error(e); process.exit(1); });
