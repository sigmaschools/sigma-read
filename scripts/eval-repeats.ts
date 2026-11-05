/**
 * The serving repeat check (src/lib/repeats.ts) on fixed cases: one student's recent articles and
 * a set of candidates, each marked as a repeat or not. Runs the real light model several times
 * and reports, per candidate, how often it was flagged. False flags cost the student a good
 * article; misses serve a rerun.
 *
 *   npm run eval:repeats              # 5 runs
 *   npm run eval:repeats -- --runs 10
 *
 * Needs ANTHROPIC_API_KEY only (no database). The cases are real articles from the live pool
 * (2026-11-05), when a student who had read "How Cooking Changed Humanity Forever" was served
 * "The Ancient Art of Smoking Food" the next day; both open with early humans and fire and tell
 * the same history.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findRepeats, type ArticleGist, type RepeatCandidate } from "../src/lib/repeats";

interface Case { history: ArticleGist[]; candidates: (RepeatCandidate & { repeat: boolean })[] }

const cases = JSON.parse(readFileSync(join(__dirname, "eval", "repeat-cases.json"), "utf8")) as Case[];
const runsArg = process.argv.indexOf("--runs");
const RUNS = runsArg > 0 ? Number(process.argv[runsArg + 1]) : 5;
const anthropic = new Anthropic();

async function main() {
  let wrong = 0, total = 0;
  for (const [i, c] of cases.entries()) {
    const flagged = new Map<number, number>();
    for (let r = 0; r < RUNS; r++) {
      const found = await findRepeats(anthropic, c.candidates, c.history);
      for (const id of found) flagged.set(id, (flagged.get(id) ?? 0) + 1);
    }
    console.log(`\nCase ${i + 1}: ${c.history.length} articles read, ${c.candidates.length} candidates, ${RUNS} runs`);
    for (const cand of c.candidates) {
      const n = flagged.get(cand.id) ?? 0;
      const bad = cand.repeat ? RUNS - n : n;
      wrong += bad; total += RUNS;
      console.log(`  ${bad === 0 ? "ok " : "BAD"} ${cand.repeat ? "repeat" : "fresh "} flagged ${n}/${RUNS}  ${cand.title}`);
    }
  }
  console.log(`\n${total - wrong}/${total} judgements right`);
}

main().catch(e => { console.error(e); process.exit(1); });
