# The redesigned tutor ("Sigma", `src/lib/tutor/`)

*Written 7 November 2026. Status: built behind a switch; the voice eval (below) picked Claude Opus 5.5 at low effort (`MODELS.sigmaTutor`). The production tutor ("classic") is unchanged and remains the default until `TUTOR_DESIGN=sigma` is set.*

## Why

Conversations went dry after the tutor moved from Claude Opus 4.6 to Claude Sonnet 5.5 with thinking off (PR #114, 4 Nov 2026). The model only set it off. The classic prompt (`src/lib/prompts/md/comprehension-conversation/`) had grown to about sixty rules, mostly prohibitions, and Sonnet 5.5 follows them precisely: almost every turn came out as "[short reaction]. Imagine X and tell me Y." Across Lily's 36 live conversations the share of tutor messages with an exclamation mark fell from 19% to 7% while length and structure barely moved. The tutor also graded the kid out loud ("Saving money is a smart guess") because the same reply that talks to the kid scores their answer (`progressDelta` in the JSON). The hard six-message backstop once closed a conversation on the student's clarifying question. The model eval (`npm run eval:models`) scored rule-following with simulated students who write tidy paragraphs, so it preferred the drier setup.

## What changed

| | Classic (`src/lib/prompts` + `conversation-turn.ts`) | Sigma (`src/lib/tutor/`) |
|---|---|---|
| Who Sigma is | One line ("older sibling energy") plus ~60 rules | A character (`md/character.md`): a young teacher in their twenties, warm, easygoing, delighted by the article, no slang, no hype, never a debate partner; three example conversations (`md/examples.md`); nine hard rules |
| What Sigma knows | The article | The article plus **prep notes** written once per base article by the writer model (`guide-notes.ts`): ideas worth talking about with Sigma's own take, vivid details, likely confusions with what the article says, good moves. Stored in `article_cache.guide_notes` on the base row; the morning batch writes them, and a catch-up cron (`/api/cron/guide-notes`, every 15 minutes) fills any base article without notes; `scripts/backfill-guide-notes.ts` does the same by hand |
| The reply | JSON `{message, progressDelta}`, structured output, thinking off | Plain text, streamed to the student as it is written (`turn.ts`); thinking on at low effort |
| The opener | Fixed instruction | Drawn per conversation (`sigmaOpener` in `turn.ts`): a starting point from the prep notes and one of six ways in, so two kids reading the same article don't get the same first message. Added after the 7 Nov eval measured 24–40% repeated openers with notes |
| Scoring | Inside the tutor's reply | A separate **observer** call (`observer.ts`, Sonnet 5.5, thinking off) runs alongside the reply: the 0–40 progress note on the same scale as before, a running summary of what the kid has shown, a one-line steer for the next turn, and whether the talk has done its job |
| Length | Word caps per level, a regex rewrite loop for long or question-shaped turns | A range and an age per level (`LEVEL_VOICE` in `prompt.ts`), no caps. One rewrite remains, for a menu of options to pick from, plus a closing that ends in a question |
| Ending | Score ≥ 100 after 3 exchanges, or a hard stop at 6 | The observer decides (`done`), never before 4 exchanges and never on a message where the kid asked Sigma something; the goodbye comes one exchange later, and waits another turn if that message is itself a question (`kidAskedQuestion`); backstop at 8, where the goodbye answers any question inside it. The closing is a goodbye in Sigma's voice, not a verdict |
| Operator notes | Bracketed text in user messages | `{role: "system"}` messages inside the conversation on models that accept them (Opus 5.5, Sonnet 5.5, Fable 5.1); bracketed user text otherwise |

Unchanged: `conversations.progress_score`, the comprehension report and its inputs (`inChatScore`, `forcedClose`), the done screen, the self-assessment, and the `data-compass-report` block, so the Compass contract is untouched. Tutorial articles always use the classic tutor.

## Switch

`TUTOR_DESIGN=sigma` in the environment starts new conversations on the redesign; anything else keeps the classic tutor. A conversation keeps the design it started with (`conversations.tutor_design`). Migration: `drizzle/0015_sigma_tutor.sql`.

## Streaming

The chat route answers with server-sent events when the client sends `Accept: text/event-stream` and the conversation is on Sigma: `delta` events with text, then one `done` event with the same fields as the JSON response (`message`, `complete`, `progressScore`, `coachingFeedback`, `compassReport`). `src/lib/chat-stream.ts` reads either shape for the student page.

## Evaluating

`npm run eval:voice` (`scripts/eval-voice.ts`) runs realistic simulated kids (`scripts/eval/kid-sim.ts`: short, lowercase, typos, "idk", jokes, questions back, one confidently wrong idea, a contrarian who says "name one") against each setup on level-matched articles, then compares each setup with the base setup blind and pairwise ("which conversation would this kid rather keep having, and which would make them want to read another article tomorrow?", with a 1-5 rating for light and fun) and measures the dryness patterns from the live transcripts (`scripts/eval/voice-metrics.ts`: "tell me" rate, grader's remarks, repeated openers and moves, exclamation rate, length variety, debate moves such as "make the case", corrections). It writes `summary.md`, `pairs.md` (blind pairs for a person to pick from) and `pairs-key.json`. The person's picks decide; the judge is the tiebreaker.

Setups: `today` (classic, Sonnet 5.5 thinking off), `before` (classic, Opus 4.6), `classic-opus-low`, `sigma-sonnet-low`, `sigma-opus-low`, `sigma-opus-medium`, `sigma-fable-low`, `sigma-opus-low-nonotes`, `sigma-v1` (the 7 Nov character and examples from `scripts/eval/sigma-v1/`, so a prompt change can be measured against the one it replaces). Pass `--judge=` when the judge model is also a candidate.

## Results (7 November 2026)

Two runs in the cloud, 96 conversations, kids played by Claude Sonnet 4.6, each pair (same kid, article and run) judged blind. Result files on branch `eval/voice-results-2026-11-07`.

**Baseline.** Judged by Claude Fable 5.1, the old tutor (`before`: Opus 4.6, same prompt) beat `today` 12–4 over 16 pairs, for the reasons seen live: one repeated shape, grading out loud, report-card closings. So the eval sees the decline.

**Candidates** (judge Claude Opus 5.5, 16 pairs each against `today`):

| Setup | Wins vs today | Person /5 | Keep talking /5 | Rewrites | "tell me" | Grader lines | Repeated opener | Median reply | Cost / conversation |
|---|---|---|---|---|---|---|---|---|---|
| today (classic, Sonnet 5.5, thinking off) | - | 2.6 | 2.6 | 0 | 53% | 17% | 17% | 1.8 s | $0.027 |
| sigma, Sonnet 5.5, low | 15–1 | 4.0 | 3.7 | 7 | 16% | 4% | 40% | 2.8 s | $0.088 |
| **sigma, Opus 5.5, low** | **16–0** | 4.3 | 4.2 | 1 | 16% | 2% | 28% | 2.5 s | **$0.119** |
| sigma, Fable 5.1, low | 16–0 | 4.4 | 4.1 | 0 | 22% | 4% | 24% | 2.7 s | $0.199 |

Cost is tutor plus observer with prompt caching as the API reported it; prep notes added about $0.02 per article, once for every reader. Opus 5.5 at low effort was chosen: never lost, one rewrite in 16 conversations, within the $0.15 budget; Fable read the same for two thirds more. Caveats: Opus 5.5 was both judge and a candidate (Sonnet and Fable won almost as often under it, so the direction holds, the Opus–Sonnet gap is less certain), and the kids are simulated. The one pattern that got worse was the repeated opener: with prep notes, every conversation on an article opened from the same idea. `sigmaOpener` now draws the starting point and the way in per conversation; not yet re-measured.

## 8 November: lighter

The first real conversation on the shipped Sigma (a seventh grader, an encyclopedia-style article about animals) read as an argument. Four of seven turns ended in "Make the case…", every turn corrected something, the tutor brought in claims from outside the article (biomass, the Aral Sea, politicians) and lost the article itself. The debate register was by design: the 7 Nov character called for an opinion with a reason every turn and the prep notes asked for "a side to argue", the examples modelled "Argue the other side", and the eval judged "sounds like a person", which a debater does.

The standard is now: light-hearted and fun, not deeply challenging. The goal is a kid who wants to read another article tomorrow and practises comprehension on the way. Changes:

- `md/character.md` and `md/examples.md`: warm and easygoing, delighted by the article; opinions as preferences, never positions; one easy move per turn (pick a favourite, picture a scene, what would you do, would you rather); a correction only for a misreading of the article, once per conversation; no debating at all (hard rule 3).
- `guide-notes.ts`: prep notes collect "wait, really?" moments and playful moves, no sides, no "why it matters". Notes carry a `version` (`NOTES_VERSION`); notes from an older prompt are left out of Sigma's prompt and the 15-minute catch-up cron rewrites them, so the library is on the new notes within an hour of the deploy with no manual step.
- `observer.ts`: the steer keeps the talk light and on the page ("they're arguing; don't take the bait"), and never asks Sigma to push back or go deeper.
- `turn.ts`: a live guard (`asksForDebate`) gives a turn that says "make the case", "convince me" or "defend that" one rewrite, like the menu check; the eval counts it under Fixes. The `sigma-v1` eval arm runs without the guard, so the old character is measured as it was.
- Eval: `debate` and `corrects` metrics, a `fun` rating and debate lines in the judge, a contrarian kid (`jules`), and the `sigma-v1` setup (the 7 Nov character and examples; the notes prompt, observer and opener shapes are the current ones in both arms) so the new character is measured against the one it replaces. Caveat: the judge rubric describes the failure the new character was written against, so it leans the new way; a person reading `pairs.md` decides.

**Result (8 Nov, 36 conversations, judge Claude Fable 5.1, results on branch `eval/voice-results-2026-11-08`):** the lighter character beat the 7 Nov one 18–0. Fun 4.2 vs 2.3, keeps-talking 4.2 vs 2.5, sounds-like-a-person 4.1 vs 3.2, debate lines per conversation 0.7 vs 2.9, "tell me" 16% → 1% of turns, debate moves 19% → 1%, cost $0.116 vs $0.108. The judge's reasons: the new one follows the kid's own jokes and tangents, has reactions of its own and varies its moves; the old one ran "Say X, tell me Y" every turn and nudged toward making a case. Two habits came with it: 46% of turns ended with a question (6% before) and "picture/imagine" rose from 10% to 30%, against the owner's rule that turns are mostly directives. The character now asks for most moves as a nudge and keeps those two words to once or twice a conversation; a short confirmation run followed before the merge.
