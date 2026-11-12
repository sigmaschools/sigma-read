/**
 * The serving repeat check (src/lib/repeats.ts) on fixed cases: one student's recent articles and
 * a set of candidates, each marked as a repeat or not. Runs the real model (the standard job)
 * several times and reports, per candidate, how often it was flagged. False flags cost the
 * student a good article; misses serve a rerun.
 *
 *   npm run eval:repeats              # 5 runs
 *   npm run eval:repeats -- --runs 10
 *
 * Needs ANTHROPIC_API_KEY only (no database); a failed model call stops the run. Most cases are
 * real articles from the live pool (2026-11-05), when a student who had read "How Cooking Changed
 * Humanity Forever" was served "The Ancient Art of Smoking Food" the next day; both tell the same
 * history. Candidates with ids 9xx were written for this test. Case 3 is one student's feed of
 * 2026-11-11: the light model called a story about Musk's Roadster in space a repeat of a Tesla
 * company history, and a SpaceX spacesuit story a repeat of a SpaceX history, so the check moved
 * to the standard model. Case 4 is the same feed a day later: with the spacesuit story (which
 * mentions Starman's ride in two sentences) among the student's articles, the standard model
 * called the Roadster story a repeat, so the prompt now says a passing mention is not one. Case 5
 * is another student's serving that morning, all fresh. The totals this comment and
 * docs/ai-models.md quote come from the script's own last line.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkBudget, excerpt, findRepeats } from "../src/lib/repeats";

interface Case { history: { title: string; body: string }[]; candidates: { id: number; title: string; body: string; repeat: boolean }[] }

const cases = JSON.parse(readFileSync(join(__dirname, "eval", "repeat-cases.json"), "utf8")) as Case[];
const runsArg = process.argv.indexOf("--runs");
const RUNS = runsArg > 0 ? Number(process.argv[runsArg + 1]) : 5;
const BATCH = 3;
const anthropic = new Anthropic();

async function main() {
  let wrong = 0, total = 0;
  for (const [i, c] of cases.entries()) {
    const flagged = new Map<number, number>();
    for (let r = 0; r < RUNS; r++) {
      // Serving checks up to 3 picks at a time, so the eval does too
      for (let start = 0; start < c.candidates.length; start += BATCH) {
        const found = await findRepeats(
          anthropic,
          c.candidates.slice(start, start + BATCH).map(x => ({ id: x.id, title: x.title, excerpt: excerpt(x.body) })),
          c.history.map(h => ({ title: h.title, excerpt: excerpt(h.body) })),
          { strict: true, budget: checkBudget(60_000) },
        );
        for (const id of found) flagged.set(id, (flagged.get(id) ?? 0) + 1);
      }
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
