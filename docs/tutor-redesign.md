# The redesigned tutor ("Sigma", `src/lib/tutor/`)

*Written 7 November 2026. Status: built behind a switch; the voice eval (below) picked Claude Opus 5.5 at low effort (`MODELS.sigmaTutor`). The production tutor ("classic") is unchanged and remains the default until `TUTOR_DESIGN=sigma` is set.*

## Why

Conversations went dry after the tutor moved from Claude Opus 4.6 to Claude Sonnet 5.5 with thinking off (PR #114, 4 Nov 2026). The model only set it off. The classic prompt (`src/lib/prompts/md/comprehension-conversation/`) had grown to about sixty rules, mostly prohibitions, and Sonnet 5.5 follows them precisely: almost every turn came out as "[short reaction]. Imagine X and tell me Y." Across Lily's 36 live conversations the share of tutor messages with an exclamation mark fell from 19% to 7% while length and structure barely moved. The tutor also graded the kid out loud ("Saving money is a smart guess") because the same reply that talks to the kid scores their answer (`progressDelta` in the JSON). The hard six-message backstop once closed a conversation on the student's clarifying question. The model eval (`npm run eval:models`) scored rule-following with simulated students who write tidy paragraphs, so it preferred the drier setup.

## What changed

| | Classic (`src/lib/prompts` + `conversation-turn.ts`) | Sigma (`src/lib/tutor/`) |
|---|---|---|
| Who Sigma is | One line ("older sibling energy") plus ~60 rules | A character (`md/character.md`): a young teacher in their twenties, steady, plain-spoken, takes the kid seriously, no slang, no hype; three example conversations (`md/examples.md`); eight hard rules |
| What Sigma knows | The article | The article plus **prep notes** written once per base article by the writer model (`guide-notes.ts`): ideas worth talking about with Sigma's own take, vivid details, likely confusions with what the article says, good moves. Stored in `article_cache.guide_notes` on the base row; the morning batch writes them, `scripts/backfill-guide-notes.ts` fills older articles |
| The reply | JSON `{message, progressDelta}`, structured output, thinking off | Plain text, streamed to the student as it is written (`turn.ts`); thinking on at low effort |
| The opener | Fixed instruction | Drawn per conversation (`sigmaOpener` in `turn.ts`): a starting point from the prep notes and one of six ways in, so two kids reading the same article don't get the same first message. Added after the 7 Nov eval measured 24–40% repeated openers with notes |
| Scoring | Inside the tutor's reply | A separate **observer** call (`observer.ts`, Sonnet 5.5, thinking off) runs alongside the reply: the 0–40 progress note on the same scale as before, a running summary of what the kid has shown, a one-line steer for the next turn, and whether the talk has done its job |
| Length | Word caps per level, a regex rewrite loop for long or question-shaped turns | A range and an age per level (`LEVEL_VOICE` in `prompt.ts`), no caps. One rewrite remains, for a menu of options to pick from, plus a closing that ends in a question |
| Ending | Score ≥ 100 after 3 exchanges, or a hard stop at 6 | The observer decides (`done`), never before 4 exchanges and never on a message where the kid asked Sigma something; backstop at 8. The closing is a goodbye in Sigma's voice, not a verdict |
| Operator notes | Bracketed text in user messages | `{role: "system"}` messages inside the conversation on models that accept them (Opus 5.5, Sonnet 5.5, Fable 5.1); bracketed user text otherwise |

Unchanged: `conversations.progress_score`, the comprehension report and its inputs (`inChatScore`, `forcedClose`), the done screen, the self-assessment, and the `data-compass-report` block, so the Compass contract is untouched. Tutorial articles always use the classic tutor.

## Switch

`TUTOR_DESIGN=sigma` in the environment starts new conversations on the redesign; anything else keeps the classic tutor. A conversation keeps the design it started with (`conversations.tutor_design`). Migration: `drizzle/0015_sigma_tutor.sql`.

## Streaming

The chat route answers with server-sent events when the client sends `Accept: text/event-stream` and the conversation is on Sigma: `delta` events with text, then one `done` event with the same fields as the JSON response (`message`, `complete`, `progressScore`, `coachingFeedback`, `compassReport`). `src/lib/chat-stream.ts` reads either shape for the student page.

## Evaluating

`npm run eval:voice` (`scripts/eval-voice.ts`) runs realistic simulated kids (`scripts/eval/kid-sim.ts`: short, lowercase, typos, "idk", jokes, questions back, one confidently wrong idea) against each setup on level-matched articles, then compares each setup with the base setup blind and pairwise ("which conversation would this kid rather keep having?") and measures the dryness patterns from the live transcripts (`scripts/eval/voice-metrics.ts`: "tell me" rate, grader's remarks, repeated openers and moves, exclamation rate, length variety). It writes `summary.md`, `pairs.md` (blind pairs for a person to pick from) and `pairs-key.json`. The person's picks decide; the judge is the tiebreaker.

Setups: `today` (classic, Sonnet 5.5 thinking off), `before` (classic, Opus 4.6), `classic-opus-low`, `sigma-sonnet-low`, `sigma-opus-low`, `sigma-opus-medium`, `sigma-fable-low`, `sigma-opus-low-nonotes`. Pass `--judge=` when the judge model is also a candidate.

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
