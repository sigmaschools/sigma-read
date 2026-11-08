# Tutor voice eval

2 conversations. Kids simulated by claude-sonnet-4-6; pairs judged blind by claude-fable-5-1. Each setup is compared with `sigma-v1` on the same kid, article and run.

| Setup | Convos | Errors | Wins vs sigma-v1 | Losses | Ties | Person /5 | Keep talking /5 | Fun /5 | Grader lines | Debate lines | Muddled lines | Exchanges | Closed | Fixes | Median reply s | p90 | Cost / convo $ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sigma-v1 | 1 | 0 | - | - | - | 3.0 | 3.0 | 2.0 | 1.0 | 3.0 | 1.0 | 8.0 | 100% | 0 | 2.9 | 4.2 | 0.136 |
| sigma-opus-low | 1 | 0 | 1 | 0 | 0 | 4.0 | 4.0 | 4.0 | 1.0 | 1.0 | 1.0 | 8.0 | 100% | 0 | 2.6 | 3.7 | 0.137 |

Cost is the tutor plus (for sigma) the observer, per conversation, with prompt caching as the API reported it. Prep notes cost $0.023 for 1 articles in this run, once per article for every student. Reply time is the tutor's API time per turn without streaming.

## Measured patterns (share of tutor messages)

| Setup | "tell me" | imagine/picture | ! | grader's remark | debate move | correction | repeated opener | same move as last turn | ends with ? | words | length variety |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sigma-v1 | 33% | 11% | 0% | 0% | 11% | 0% | 0% | 11% | 22% | 56 | 0.13 |
| sigma-opus-low | 0% | 67% | 0% | 0% | 0% | 11% | 22% | 0% | 44% | 55 | 0.20 |

Live-site reference (Lily, 2-7 Nov 2026): Opus 4.6 had "tell me" 64%, ! 19%; Sonnet 5.5 had "tell me" 70%, ! 7%.

## Why the judge picked (a sample)

### sigma-opus-low vs sigma-v1

- jules/bee-dance r0: sigma-opus-low (clear). A's tutor dropped the task the moment the kid balked and offered 'Longest shimmy in the hive' instead, which got the kid laughing and riffing ('turn left go three miles'), while B opened with 'Not sure I'd call them dumb' and 'Convince me something dumb could pull that off', then ran the same 'Say you're a bee... Tell me...' shape nearly every turn.

## Weakest lines

### sigma-v1

- jules/bee-dance: The ants can make their own case another day. Here's what I can't get past: if she waggles a little to the right of straight up, the flowers are that same amount to the right of the sun. Convince me something dumb could pull that off.

### sigma-opus-low

- jules/bee-dance: Could be about their eyes, but look at that line in the second paragraph again, the one about why the other bees crowd around her. Anyway, you're the dancer.

