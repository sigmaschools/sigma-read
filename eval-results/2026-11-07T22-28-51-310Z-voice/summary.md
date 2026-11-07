# Tutor voice eval

32 conversations. Kids simulated by claude-sonnet-4-6; pairs judged blind by claude-fable-5-1. Each setup is compared with `today` on the same kid, article and run.

| Setup | Convos | Errors | Wins vs today | Losses | Ties | Person /5 | Keep talking /5 | Grader lines | Muddled lines | Exchanges | Closed | Fixes | Median reply s | p90 | Cost / convo $ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| today | 16 | 0 | - | - | - | 3.1 | 3.3 | 3.2 | 1.8 | 5.6 | 100% | 0 | 1.8 | 2.2 | 0.027 |
| before | 16 | 0 | 12 | 4 | 0 | 3.3 | 3.6 | 2.5 | 1.9 | 5.4 | 100% | 0 | 3.8 | 5.3 | 0.154 |

Cost is the tutor plus (for sigma) the observer, per conversation, with prompt caching as the API reported it. Prep notes cost $0.000 for 5 articles in this run, once per article for every student. Reply time is the tutor's API time per turn without streaming.

## Measured patterns (share of tutor messages)

| Setup | "tell me" | imagine/picture | ! | grader's remark | repeated opener | same move as last turn | ends with ? | words | length variety |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| today | 53% | 15% | 7% | 19% | 15% | 7% | 12% | 40 | 0.10 |
| before | 54% | 22% | 17% | 15% | 32% | 8% | 11% | 41 | 0.15 |

Live-site reference (Lily, 2-7 Nov 2026): Opus 4.6 had "tell me" 64%, ! 19%; Sonnet 5.5 had "tell me" 70%, ! 7%.

## Why the judge picked (a sample)

### before vs today

- nico/octopus r0: before (slight). A falls into a visible routine ("Here's one I love... Wild, right?" / "Here's one I didn't expect... Wild, right?") and ends by grading the kid ("Hiding in the rocks is a smart pick, and you even spotted..."), while B actually follows the kid's own idea ("Ha, totally like a ninja! Now imagine you were a fish and got inked") and closes on a shared reaction rather than a report card, though B hops topics abruptly after the kid's "idk" and "ya".
- nico/octopus r1: before (slight). Both tutors hop topics a lot, but A grades the kid ('Swimming away is smart') and closes with a report card ('You picked the ink cloud as your favorite trick and said...'), while B never evaluates the kid and ends on a real callback to 'hide from my brother' that cracked the tutor up.
- nico/lighthouse r0: today (slight). A's guide offers more of its own reactions ("Here's one that surprised me", "Ha, then you'd fit right in at a lighthouse", "I bet keeper families had pets") and follows the kid's dog and bike comments naturally, while B ends every turn with "Tell me...", circles twice on stairs-vs-storm after the kid said "idk", and closes with the cheerleader line "I like that you thought the storms were the scariest part." A is still dry in spots: it repeats "Here's one that got me... Wild, right?" nearly verbatim and its closing sums up the kid's pick like a report card.
- nico/lighthouse r1: before (slight). B follows the kid's own thread for several turns (no wifi → friends → 'i can ride a bike' → 'Same here') and feels like a real exchange, while A hops topics three times with the same 'Here's what got me... Wild, right?' shape and closes with a double grade ('clear code... smart way to see'). B is dragged down by the non sequitur after 'wipe the windows' ('Yeah, and here's the thing — each lighthouse had its own special flash pattern').
- maya/lighthouse r0: before (clear). Tutor A answers the kid's own questions ('Ha, I bet that happened more than once!', 'I wonder if they did — no adults nearby to say no, right?') and never grades, while Tutor B twice opens with the report-card formula 'You connected X to Y, which is exactly why...' and runs comprehension checks like 'tell me why even a little soot is a problem.'
- maya/lighthouse r1: before (slight). Both tutors run the same 'reaction, article-doesn't-say, tell me why' routine, but A offers a little more of its own ('spiders in a dark tower would creep me out too', 'I'd sure want one') and stays closer to the kid's thread, while B leans on bare grading ('Good thinking.', 'You figured out the whole chain') and hops cold from kids climbing steps to soot on the glass.

## Weakest lines

### today

- nico/octopus: Hiding in the rocks is a smart pick, and you even spotted that the octopus fits through a gap if its beak does.
- nico/octopus: You picked the ink cloud as your favorite trick and said swimming away fast is what you'd do. That's exactly what that confused fish wants to do too!
- nico/lighthouse: Scary is right, wind howling and nothing to hold onto but a walkway. Pick the part of the article that makes you think that, and tell me why it got you.
- nico/lighthouse: Five flashes then stop is a clear code, and calling the patterns a code was a smart way to see how sailors knew which lighthouse they were looking at.
- maya/lighthouse: You connected dimmer light to ships crashing, which is exactly why keepers cleaned it every day. If you were the keeper, tell me how you'd decide which job to do first each evening.

### before

- nico/octopus: An octopus has zero bones so it can squeeze through tiny holes, like squishing through a crack in a wall. Pretty cool, right?
- nico/octopus: Right, three hearts is so wild. Tell me why you think blue blood is weirder than red blood.
- nico/lighthouse: Storms do sound scary, going out on that narrow walkway with wind howling around you. Tell me which one you think you could handle better and why.
- nico/lighthouse: Yeah, and here's the thing — each lighthouse had its own special flash pattern so sailors could figure out exactly where they were. Like a secret code made of light. Pretty cool, right?
- maya/lighthouse: Feeding your family when no boat shows up, that's real survival. The article says supplies only came a few times a year so delays were probably scary. Tell me what changed most when electricity took over.

