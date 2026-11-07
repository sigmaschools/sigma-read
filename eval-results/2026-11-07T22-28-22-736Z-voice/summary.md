# Tutor voice eval

1 conversations. Kids simulated by claude-sonnet-4-6; pairs judged blind by claude-fable-5-1. Each setup is compared with `today` on the same kid, article and run.

| Setup | Convos | Errors | Wins vs today | Losses | Ties | Person /5 | Keep talking /5 | Grader lines | Muddled lines | Exchanges | Closed | Fixes | Median reply s | p90 | Cost / convo $ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| today | 1 | 0 | - | - | - | - | - | - | - | 6.0 | 100% | 0 | 2.0 | 2.2 | 0.029 |

Cost is the tutor plus (for sigma) the observer, per conversation, with prompt caching as the API reported it. Prep notes cost $0.000 for 1 articles in this run, once per article for every student. Reply time is the tutor's API time per turn without streaming.

## Measured patterns (share of tutor messages)

| Setup | "tell me" | imagine/picture | ! | grader's remark | repeated opener | same move as last turn | ends with ? | words | length variety |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| today | 43% | 43% | 0% | 0% | 29% | 14% | 14% | 39 | 0.13 |

Live-site reference (Lily, 2-7 Nov 2026): Opus 4.6 had "tell me" 64%, ! 19%; Sonnet 5.5 had "tell me" 70%, ! 7%.

## Why the judge picked (a sample)

## Weakest lines

### today


