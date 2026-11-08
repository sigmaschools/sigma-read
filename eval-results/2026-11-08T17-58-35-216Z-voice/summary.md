# Tutor voice eval

36 conversations. Kids simulated by claude-sonnet-4-6; pairs judged blind by claude-fable-5-1. Each setup is compared with `sigma-v1` on the same kid, article and run.

| Setup | Convos | Errors | Wins vs sigma-v1 | Losses | Ties | Person /5 | Keep talking /5 | Fun /5 | Grader lines | Debate lines | Muddled lines | Exchanges | Closed | Fixes | Median reply s | p90 | Cost / convo $ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sigma-v1 | 18 | 0 | - | - | - | 3.2 | 2.5 | 2.3 | 1.6 | 2.9 | 0.6 | 7.3 | 100% | 2 | 2.4 | 3.8 | 0.108 |
| sigma-opus-low | 18 | 0 | 18 | 0 | 0 | 4.1 | 4.2 | 4.2 | 1.1 | 0.7 | 0.6 | 7.6 | 100% | 3 | 2.8 | 4.4 | 0.116 |

Cost is the tutor plus (for sigma) the observer, per conversation, with prompt caching as the API reported it. Prep notes cost $0.111 for 5 articles in this run, once per article for every student. Reply time is the tutor's API time per turn without streaming.

## Measured patterns (share of tutor messages)

| Setup | "tell me" | imagine/picture | ! | grader's remark | debate move | correction | repeated opener | same move as last turn | ends with ? | words | length variety |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sigma-v1 | 16% | 10% | 1% | 1% | 19% | 1% | 30% | 6% | 6% | 52 | 0.16 |
| sigma-opus-low | 1% | 30% | 1% | 3% | 1% | 1% | 30% | 3% | 46% | 54 | 0.16 |

Live-site reference (Lily, 2-7 Nov 2026): Opus 4.6 had "tell me" 64%, ! 19%; Sonnet 5.5 had "tell me" 70%, ! 7%.

## Why the judge picked (a sample)

### sigma-opus-low vs sigma-v1

- nico/octopus r0: sigma-opus-low (clear). A follows the kid's 'my brother' idea into one running game that touches every fact in the article with varied prompts, while B repeats the 'Picture X and tell me Y' shape four times ('Picture a big octopus... tell me what it looks like', 'Say you're the octopus. Tell me...', 'Be the shark... tell me what you see', 'Picture it and tell me what you'd think').
- nico/octopus r1: sigma-opus-low (clear). B follows the kid's booger joke, muses about its own one heart, and ends with 'I'm going to be picturing a big octopus booger squeezing through a fence for the rest of the day,' while A runs nearly every turn through the same 'Tell me / Walk me through / Pick a hole' imperative and slips toward convincing with 'Tell me what you'd say if a friend didn't believe you.'
- nico/lighthouse r0: sigma-opus-low (clear). B gets the kid laughing twice ('lol wiping with ur elbow', 'soot in ur nose haha') by running with the burp and adding its own silly reactions, while A opens by asking a 7-year-old to solve a problem the article never covers ('who made sure two lighthouses never got the same pattern?') and the kid answers 'idk'.
- nico/lighthouse r1: sigma-opus-low (slight). A varies its moves (would-you-rather, pick-one, the tutor's own favorite part) and rolls with the kid's tangents ('i can ride a bike', 'i dont like fish') with real humor, while B's first three turns are a scaffolded walk-through ('Walk me through what you do next', 'Tell me what you do with the ship') and every reply opens by echoing the kid's words; B's closing line about spotting the kid's lighthouse is the best single line in either chat, though.
- maya/lighthouse r0: sigma-opus-low (clear). A runs the same shape almost every turn ('Say X... Tell me Y', 'Describe', 'Walk me through', 'Pick which') and yanks the kid from sailors to keeper with 'Meanwhile the keeper's not even watching the sea', while B follows the kid's own threads (candle, keeper kid, naming, supply boat), varies its questions, and offers more of its own ('I'd row out just to see it', 'I picture one tiny flame bobbing up the dark stairs').
- maya/lighthouse r1: sigma-opus-low (clear). B has real humor and reactions of its own ('I'm laughing at you dropping the crank', 'That kid would be rowing to town to quit') and no grading, while A runs a repeated '[reaction]. Walk me through / Pick / Tell me' shape with two 'walk me through what happens' comprehension checks and small evaluations like 'your rope plan sounds smart to me' and 'you're right'.

## Weakest lines

### sigma-v1

- nico/octopus: Picture it and tell me what you'd think.
- nico/octopus: Three. I thought I'd misread it too. One octopus, three hearts all beating, and blue blood moving through all of them. Tell me what you'd say if a friend didn't believe you.
- nico/lighthouse: Here's what I'm still wondering: who made sure two lighthouses never got the same pattern? Tell me how you'd keep them from getting mixed up.
- nico/lighthouse: Say the list puts you right near the rocks. Tell me what you do with the ship.
- maya/lighthouse: Meanwhile the keeper's not even watching the sea. They're climbing more than a hundred steps several times a night to wind the weight back up. Describe your third climb of the night, around 3 a.m.

### sigma-opus-low

- nico/octopus: Pick what you'd want to stick to if you had suction cups.
- nico/lighthouse: The real burp would get lost in the wind, though, so picture some poor keeper hauling a foghorn up a hundred steps to do it. Say what a sailor does when they spot your lighthouse at night.
- nico/lighthouse: Maybe, if the sailor got lost.
- maya/lighthouse: As far as I know, the people in charge gave lighthouses near each other different patterns, so that mix-up wouldn't happen.
- maya/lighthouse: Now picture Maya's lighthouse from the inside. Would you rather climb a hundred steps at 3 a.m. to wind the weight, or go out on the walkway in a storm to wipe salt off the glass?

