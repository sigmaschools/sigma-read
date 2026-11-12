# AI models: which model does each job, and why

Last reviewed 11 Nov 2026. The source of truth is `src/lib/models.ts`; this page records the choices and the tests behind them, so a later model generation can be tested the same way.

## The mix

| Job (`MODELS.*`) | Calls | Model | Settings | Why |
|---|---|---|---|---|
| `tutor` | every turn of the reading conversation | Claude Sonnet 5.5 | thinking off | Best conversations of five setups, half the cost and half the wait of Opus 4.6 (test 1) |
| `report` | once per finished conversation; moves the student's level | Claude Sonnet 5.5 | thinking off | As good as the best report model, scores closest to a reference grader, half the cost of Opus (test 2) |
| `writer` | base article and each level adaptation, once per article for all students | Claude Opus 5.5 | medium effort | Clearly the best articles: most accurate, best level fit, every length on target (test 3) |
| `standard` | onboarding chat, coaching tip, word definitions, parent chat, the serve-time repeat check (`src/lib/repeats.ts`) | Claude Sonnet 5.5 | thinking off | Short chat replies: fast, and the same model as the tutor |
| `light` | web search step, topic tagging, interest matching, pre-reading prompt | Claude Haiku 5.5 | thinking off | Mechanical steps; a tenth of the price of Haiku 4.5. Until 2026-11-09 it also judged the batch's sources and duplicates; those moved to `standard` and story angles to `writer`, because judging what kids read is not a place to economize |
| `observer` | beside each turn of the redesigned tutor (`TUTOR_DESIGN=sigma`, [tutor-redesign.md](./tutor-redesign.md)): scores the student's message, keeps the running notes, decides when the talk is done | Claude Sonnet 5.5 | thinking off | The same scoring the tutor used to do inside its reply, on the same scale; not yet re-tested on its own |
| `sigmaTutor` | every turn of the redesigned tutor (`TUTOR_DESIGN=sigma`) | Claude Opus 5.5 | low effort | Voice eval of 7 Nov 2026 ([tutor-redesign.md](./tutor-redesign.md)): won all 16 blind pairs against today's tutor, "sounds like a person" 4.3/5 against 2.6, about $0.12 a conversation with the observer. Sonnet 5.5 at low effort won 15 of 16 for $0.09 but repeated itself more; Fable 5.1 scored the same as Opus for $0.20 |

The repeat check moved from `light` to `standard` on 11 Nov 2026: Haiku called a Roadster-in-space story a repeat of a Tesla company history (4 of 4 runs, and a sharper prompt only moved the false flag), Sonnet never did. On 12 Nov the prompt gained a rule that a passing mention is not a repeat, after Sonnet called the same Roadster story a repeat of a spacesuit article that gives Starman's ride two sentences. `npm run eval:repeats` on the current prompt: 120 of 120 (the script prints the total). It runs once per student per serving, a few cents a day.

`tutor` below is the classic tutor, which stays the default until `TUTOR_DESIGN=sigma` is set.

Two cost levers apply to every job:

- **Prompt caching.** The tutor's system prompt (rules plus the article, about 4,900 tokens) is cached, so each turn after the first reads it at a tenth of the input price. The onboarding and parent chats cache theirs too. Measured: first turn writes 4,908 cached tokens, the next turn reads 4,908.
- **Articles are shared, but planned per student.** One article, adapted to each level, serves every student who has that interest. The morning batch writes a specific story for each of every student's top interests (`src/lib/batch/plan-interests.ts`), with no daily cap since 2026-11-09 (the user chose quality and personal fit over cost), and nothing on the same subject is written twice (`src/lib/batch/dedup.ts`; details in [article-pipeline.md](./article-pipeline.md)).

## Cost

| | Before (Opus 4.6 chat and report, Sonnet 4.5 writer) | Now |
|---|---|---|
| Tutor, per conversation | $0.142 | $0.031 (Sonnet 5.5 $0.080, then caching) |
| Report, per conversation | $0.027 | $0.014 |
| Coaching tip and chat-interest check | ~$0.01 | ~$0.005 |
| **Per conversation** | **~$0.18** | **~$0.05** |
| Writing one article in all 6 levels | ~$0.10 | ~$0.30 |

For 100 students reading 3 articles a school day (about 6,600 conversations a month): conversations about $330 a month instead of about $1,200; writing one article per distinct interest, up to three per student plus news and horizon (at most about 300 a day for 100 students if no interests are shared, far fewer in practice). An article costs about $0.30 to write at all six levels (the table below: $0.15 for three levels) plus roughly $0.10 for its story angles and the standard-model source checks, so writing can reach about $3,500 a month at that scale. That is the user's decision (2026-11-08): specific, personal articles over a cheaper shared set, which from Oct 29 to Nov 8 capped writing at 4 per 10 students and made the feed generic. For a single pilot student: about 5 articles a day, roughly $45 a month.

The cheaper writer option, if writing cost ever matters more than the last bit of quality: Claude Sonnet 5.5 with thinking off scored 7.1 against 7.6, at a little over half the cost. Change `MODELS.writer` and the `writer` line in `requestSettings`.

## Tests

All three ran 3–4 Nov 2026 with Sigma Read's own prompts and code paths, needing only `ANTHROPIC_API_KEY`. Each output was graded blind by Claude Fable 5.1, which was not a candidate. Results files are in `eval-results/` (not committed).

### 1. Conversation (`npm run eval:models`)

120 conversations: 4 simulated students × 3 articles (levels 1, 3, 5) × 2 runs × 5 setups.

| Setup | Overall /10 | Median reply | Tutor cost / conversation |
|---|---|---|---|
| Opus 4.6 (before) | 6.1 | 3.7 s | $0.142 |
| Opus 5.5, low effort | 6.7 | 2.0 s | $0.145 |
| Sonnet 5.5, low effort | 6.7 | 1.7 s | $0.074 |
| **Sonnet 5.5, thinking off** | **6.9** | 1.9 s | $0.080 |
| Haiku 5.5, low effort | 5.9 | 1.5 s | $0.004 |

Haiku invented a fact to correct a child once, which rules it out for the tutor. Costs here are before prompt caching.

#### Gemini as the tutor (4 Nov 2026)

The same test, 96 conversations (the same 24 cases × 4 setups), with Google's current Gemini models running through Sigma Read's own tutor code and prompts (`scripts/eval/gemini-client.ts` translates the request; `--configs=gemini-…`, needs `GEMINI_API_KEY`). Same simulated students, same blind judge.

| Setup | Overall /10 | vs Sonnet 5.5 (paired) | Responsive /5 | Rules /5 | Median reply | p90 reply | Tutor cost / conversation |
|---|---|---|---|---|---|---|---|
| **Sonnet 5.5, thinking off** | **6.8** | - | 4.0 | 3.5 | 1.9 s | 2.4 s | $0.030 (cached) |
| Gemini 3.8 Flash, low thinking | 5.4 | −1.4 ± 0.2 | 3.0 | 2.9 | 2.4 s | 6.8 s | $0.017 |
| Gemini 3.8 Flash, high thinking | 5.3 | −1.5 ± 0.2 | 2.9 | 2.9 | 8.7 s | 16.1 s | $0.034 |
| Gemini 4 Argon, low thinking | 5.7 | −1.0 ± 0.2 | 3.3 | 3.0 | 7.2 s | 28.8 s | $0.037 |

Sonnet 5.5 stays the tutor. Of the 24 paired cases, Sonnet scored higher than Gemini 3.8 Flash low in 20 (2 ties), Flash high in 22 (1 tie) and Gemini 4 Argon in 18 (6 ties; Argon never scored higher). No Gemini turn came back empty or cut off (0 fallbacks). The judge's complaints were consistent: Gemini echoed the student's line and jumped to a new, often off-article prompt instead of following the child's idea, ignored the child's own questions, and twice accepted a wrong idea (once agreeing that blue blood "sounds made up", against the article). Gemini 3.8 Flash at low thinking is about half the tutor cost (at high thinking it costs a little more than Sonnet) but is slower at the tail; Gemini 4 Argon costs more and is much slower. Sonnet's cost includes prompt caching; Gemini's cache hits are Google's automatic caching as the API reported it (Argon on most turns, Flash rarely), priced at an assumed tenth of input. The judge and the simulated students are Claude models; the judge is blind to the tutor, but a family preference can't be ruled out. Only the setups in the table were run (no Flash at medium thinking, no Argon above low). A re-run of 12 cases each, with retries counted and kept out of reply time, had no retries and gave the same picture: Flash low 5.2 (median 2.2 s, p90 4.4 s), Argon low 5.6 (median 7.5 s, p90 28.2 s), so the slow replies are the models, not rate limits. Gemini 3.8 Flash's price doubles on 1 Jan 2027 and Argon's on 1 Dec 2026. The prompts were tuned on Claude models over months of user testing, so some of the gap may be prompt fit rather than model quality; closing it would mean re-tuning the conversation prompts for another model, which this result doesn't justify. Gemini 3.1 Pro (preview) was not run: Argon is the newer flagship, and the preview shares a 250-request daily cap with other work on the same key.

### 2. Comprehension report (`npm run eval:reports -- <results.jsonl>`)

24 finished conversations from test 1, each reported on by every model with the production prompt and schema. The judge graded each report against the transcript and also wrote its own reference score.

| Model | Judge /10 | Fair score /5 | Unsupported claims | Mean score | Gap to reference | Median time | Cost |
|---|---|---|---|---|---|---|---|
| Opus 4.6 (before) | 5.1 | 2.8 | 5.1 | 81.1 | 3.1 (2.7 high) | 16.1 s | $0.027 |
| Opus 5.5, low | 6.6 | 3.5 | 3.8 | 81.4 | 3.3 | 7.4 s | $0.028 |
| Sonnet 5.5, low | 6.9 | 3.8 | 3.1 | 76.2 | 3.8 | 5.6 s | $0.014 |
| **Sonnet 5.5, thinking off** | 6.7 | 3.7 | 3.3 | 78.0 | **3.1 (0.4 low)** | 6.6 s | $0.014 |
| Haiku 5.5, low | 5.9 | 3.4 | 3.7 | 75.9 | 6.5 | 6.1 s | <$0.001 |

The two Sonnet setups are within noise on quality; thinking off was chosen because its scores sit closest to the reference, which matters since scores move levels. Its scores run about 3 points below Opus 4.6's on the same conversations (Opus 4.6 ran about 3 above the reference), so level-ups may come slightly less readily. The level thresholds were not changed; watch level changes in the first weeks.

### 3. Article writing (`npm run eval:articles`)

8 encyclopedia-style sources (`scripts/eval/article-sources.json`), each rewritten at level 4 and adapted to levels 1 and 6 by every candidate with the batch's prompts (`src/lib/batch/article-writer.ts`). The sources were written by a model for the test, because the test machine could not reach the web; the judge grades faithfulness to the source, so they serve to compare writers.

| Candidate | Overall /10 | vs before (paired) | Accuracy /5 | Unsupported claims / set | Level fit L1 / L4 / L6 | Length on target | Median call | Cost / 3 articles |
|---|---|---|---|---|---|---|---|---|
| Sonnet 4.5 (before) | 6.0 | - | 3.3 | 8.3 | 3.6 / 4.0 / 3.1 | 12/24 | 15.6 s | $0.051 |
| Haiku 5.5, thinking off | 5.6 | −0.4 ± 0.3 | 3.6 | 5.5 | 3.5 / 4.1 / 2.5 | 11/24 | 4.6 s | <$0.01 |
| Sonnet 5.5, thinking off | 7.1 | +1.1 ± 0.1 | 3.9 | 5.0 | 3.5 / 4.4 / 3.5 | 19/24 | 9.3 s | $0.043 |
| Sonnet 5.5, low effort | 6.5 | +0.5 ± 0.3 | 4.3 | 3.4 | 3.1 / 4.0 / 3.3 | 18/24 | 7.8 s | $0.042 |
| Opus 5.5, low effort | 7.0 | +1.0 ± 0.2 | 4.1 | 5.0 | 4.0 / 4.8 / 3.8 | 23/24 | 10.7 s | $0.084 |
| **Opus 5.5, medium effort** | **7.6** | **+1.6 ± 0.2** | 4.3 | 3.5 | 4.1 / 4.9 / 3.8 | 24/24 | 20.4 s | $0.151 |

Sonnet 4.5 wrote level-4 articles at about grade 10 and level-6 ones at grade 14–15 (Flesch-Kincaid), well above target; the 5.5 models land close to the targets. The judge's most common complaint for every model was details added that the source doesn't support, which is why accuracy weighed heavily.

## Re-testing

When a new model ships, add it to `PRICES` in `src/lib/ai-pricing.ts` and to the candidate list of the relevant eval script, run it, and compare with the tables above. The eval scripts pin their simulated student to Claude Sonnet 4.6, so results stay comparable across app model changes.
